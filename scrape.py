import time
import random
import re
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import json
from pathlib import Path
from bs4.element import Tag

MARKETPLACE_URL = "https://www.facebook.com/marketplace"
MASTER_JSON_PATH = Path("fb_marketplace_master_list.json")
SEARCHTIME = 180 # seconds

def load_master_list():
    if MASTER_JSON_PATH.exists() and MASTER_JSON_PATH.stat().st_size > 0:
        try:
            with open(MASTER_JSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            print("json file is corrupt or empty. Starting with empty list.")
            return []
    return []


def save_master_list(master_list):
    with open(MASTER_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(master_list, f, ensure_ascii=False, indent=2)

def extract_item_id(link):
    match = re.search(r'/item/(\d+)', link)
    return match.group(1) if match else None

def merge_results(master_list, new_list):
    existing_map = {extract_item_id(entry["link"]): entry for entry in master_list if extract_item_id(entry["link"])}

    for item in new_list:
        item_id = extract_item_id(item["link"])
        if not item_id:
            continue
        if item_id in existing_map:
            # Update price and metadata while preserving user 'seen' status
            existing_entry = existing_map[item_id]
            existing_entry["price"] = item["price"]
            existing_entry["original_price"] = item.get("original_price")
            if item.get("title"):
                existing_entry["title"] = item["title"]
            if item.get("location"):
                existing_entry["location"] = item["location"]
        else:
            master_list.append(item)
            existing_map[item_id] = item

    return master_list

def show_browser_banner(page, message, bg_color="#2563eb"):
    try:
        page.evaluate(f"""
            let b = document.getElementById('__scraper_status_banner');
            if (!b) {{
                b = document.createElement('div');
                b.id = '__scraper_status_banner';
                b.style.position = 'fixed';
                b.style.top = '12px';
                b.style.left = '50%';
                b.style.transform = 'translateX(-50%)';
                b.style.zIndex = '999999';
                b.style.padding = '10px 22px';
                b.style.backgroundColor = '{bg_color}';
                b.style.color = '#ffffff';
                b.style.fontSize = '14px';
                b.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                b.style.fontWeight = '500';
                b.style.borderRadius = '8px';
                b.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)';
                b.style.transition = 'all 0.3s ease';
                b.style.pointerEvents = 'none';
                document.body.appendChild(b);
            }}
            b.style.backgroundColor = '{bg_color}';
            b.innerHTML = `{message}`;
        """)
    except Exception:
        pass

def setup_esc_listener(page):
    try:
        page.evaluate("""
            window._stopScraping = false;
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' || e.keyCode === 27) {
                    window._stopScraping = true;
                    const b = document.getElementById('__scraper_status_banner');
                    if (b) {
                        b.style.backgroundColor = '#dc2626';
                        b.innerHTML = '🛑 <b>Stopping scroll...</b> Finalizing scraped items.';
                    }
                }
            });
        """)
    except Exception:
        pass

def scroll_down_hard(page, max_duration_sec= SEARCHTIME): 
    print("🚀 Scrolling started.")
    print("💡 Tip: Press [ESC] in the browser window anytime to stop scrolling early and save listings.\n")
    setup_esc_listener(page)
    start_time = time.time()

    while time.time() - start_time < max_duration_sec:
        if page.is_closed():
            print("⚠️ Browser was closed. Finalizing current listings...")
            break

        try:
            should_stop = page.evaluate("() => window._stopScraping === true")
            if should_stop:
                print("🛑 ESC pressed in browser. Stopping scroll early and saving items...")
                break
        except Exception:
            pass

        scroll_amount = random.randint(3000, 5000)
        try:
            page.mouse.wheel(0, scroll_amount)
        except Exception:
            break

        time.sleep(random.uniform(1.5, 2.5))

def get_nth_tag_child(self, index):
            if not isinstance(self, Tag):
                return None
            children = [child for child in self.children if isinstance(child, Tag)]
            return children[index] if len(children) > index else None

Tag.get_nth_tag_child = get_nth_tag_child

PRICE_REGEX = re.compile(
    r'([₪$€£¥]\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*[₪$€£¥]|\b\d[\d,.]*\b)'
)

def parse_num(s):
    n = re.sub(r'[^\d.]', '', str(s))
    return float(n) if n else 0.0

def extract_price_info(price_tag):
    if not price_tag:
        return "N/A", None

    # Detect and remove explicit strikethrough tags or styles (<del>, <s>, line-through)
    struck_price = None
    for struck in price_tag.find_all(lambda el: el.name in ['del', 's', 'strike'] or
                                     'line-through' in el.get('style', '').lower() or
                                     'line-through' in ' '.join(el.get('class', [])).lower() or
                                     'strike' in ' '.join(el.get('class', [])).lower()):
        st_text = struck.get_text(strip=True)
        if st_text:
            st_matches = PRICE_REGEX.findall(st_text)
            if st_matches:
                struck_price = st_matches[0].strip()
        struck.decompose()

    raw_text = price_tag.get_text(separator=" ", strip=True)
    matches = PRICE_REGEX.findall(raw_text)

    if not matches:
        return (raw_text[:50] or "N/A"), struck_price

    if len(matches) == 1:
        return matches[0].strip(), struck_price

    # When Facebook renders both current price and crossed-out old price:
    # The active price is the lower/discounted one (which usually appears first).
    p1, p2 = matches[0].strip(), matches[1].strip()
    num1, num2 = parse_num(p1), parse_num(p2)

    if num1 <= num2 and num1 > 0:
        return p1, p2
    elif num2 > 0:
        return p2, p1
    else:
        return p1, None

def extract_listing_info(a_tag, search = ""):
    try:

        # Link
        href = a_tag.get("href")
        full_link = "https://facebook.com" + href

        price_tag = (
                    a_tag.get_nth_tag_child(0)
                    .get_nth_tag_child(1)
                    .get_nth_tag_child(0)
            )
        title_tag = (
                    a_tag.get_nth_tag_child(0)
                    .get_nth_tag_child(1)
                    .get_nth_tag_child(1)
            )
        location_tag = (
                    a_tag.get_nth_tag_child(0)
                    .get_nth_tag_child(1)
                    .get_nth_tag_child(2) 
            )
        # Return None if any tag is missing
        if not (price_tag and title_tag and location_tag):
            return None

        # Try extracting text safely
        try:
            price, original_price = extract_price_info(price_tag)
            title = title_tag.get_text(strip=True)[:200]
            location = location_tag.get_text(strip=True)[:200]
        except Exception as e:
            return None  # One of them failed

        # All succeeded — return structured result
        return {
            "search": search,
            "link": full_link,
            "price": price,
            "original_price": original_price,
            "title": title,
            "location": location,
            "seen": False,
        }
    except Exception as e:
        print(f"Error extracting listing info: {e}")
        return None


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        print("Opening Facebook Marketplace...")
        try:
            page.goto(MARKETPLACE_URL, timeout=60000)
            show_browser_banner(page, "🔐 <b>FBM Scraper:</b> Please log in & search. When ready, switch to your terminal and press <b>[ENTER]</b>.")
        except Exception as e:
            print(f"Note: Error loading initial page: {e}")

        # Wait for user manual confirmation that they are logged in and ready
        print("\n" + "=" * 65)
        print("🌐 Browser is open at Facebook Marketplace.")
        print("👉 1. Log in to your Facebook account (if not already logged in).")
        print("👉 2. Enter your search query or select your location.")
        print("👉 3. Once you are officially logged in and on the marketplace page:")
        input("   👉 Press [ENTER] in this terminal to start scrolling & scraping... ")
        print("=" * 65 + "\n")

        if page.is_closed():
            print("⚠️ Browser window was closed before scraping started. Exiting.")
            return

        show_browser_banner(page, "🚀 <b>Scrolling in progress...</b> Press <b>ESC</b> in the browser to finish early.", bg_color="#059669")

        scroll_down_hard(page)

        if not page.is_closed():
            show_browser_banner(page, "⏳ <b>Processing listings...</b> Saving to database.", bg_color="#334155")

        print("Parsing HTML in memory...")
        html = page.content() if not page.is_closed() else ""
        if not html:
            print("⚠️ No HTML captured.")
            return

        soup = BeautifulSoup(html, "html.parser")

        results = []
        search_input = soup.find('input', {"aria-label": "Search Marketplace"})
        search_made = (search_input.get("value") or "") if search_input else ""
        seen = set()

        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "/marketplace/item/" in href and href not in seen:
                seen.add(href)
                listing = extract_listing_info(a, search=search_made)
                if listing:
                    results.append(listing)

        print(f"✨ Scraped {len(results)} listings from the current page.")

        # Load existing master list from disk
        master_list = load_master_list()

        # Merge new unique listings into master list
        master_list = merge_results(master_list, results)

        # Save updated master list back to JSON
        save_master_list(master_list)
        print(f"💾 Database updated: {len(master_list)} total listings in fb_marketplace_master_list.json")

        try:
            browser.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
