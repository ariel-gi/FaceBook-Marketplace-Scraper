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
    # Build a set of existing item IDs from the master list
    existing_ids = {extract_item_id(entry["link"]) for entry in master_list if extract_item_id(entry["link"])}

    for item in new_list:
        item_id = extract_item_id(item["link"])
        if item_id and item_id not in existing_ids:
            master_list.append(item)

    return master_list

def scroll_down_hard(page, max_duration_sec= SEARCHTIME): 
    print("Scrolling started. Press ESC to stop.")
    start_time = time.time()

    while time.time() - start_time < max_duration_sec:

        scroll_amount = random.randint(3000, 5000)
        page.mouse.wheel(0, scroll_amount)
        time.sleep(random.uniform(1.5, 2.5))

def get_nth_tag_child(self, index):
            if not isinstance(self, Tag):
                return None
            children = [child for child in self.children if isinstance(child, Tag)]
            return children[index] if len(children) > index else None

Tag.get_nth_tag_child = get_nth_tag_child

def extract_listing_info(a_tag, search = ""):
    try:

        # Link
        href = a_tag.get("href")
        full_link = "https://facebook.com" + href

        # Extract fields from the spans
        # price = next((t for t in text_spans if re.search(r"[₪$€]\s*\d", t)), "N/A")
        # title = next((t for t in text_spans if t != price and len(t) <= 60), "N/A")
        # location = next((t for t in text_spans if t not in [price, title]), "N/A")
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
            price = price_tag.get_text(strip=True)[:200]
            title = title_tag.get_text(strip=True)[:200]
            location = location_tag.get_text(strip=True)[:200]
        except Exception as e:
            return None  # One of them failed

        # All succeeded — return structured result
        return {
            "search": search,
            "link": full_link,
            "price": price,
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
        page.goto(MARKETPLACE_URL, timeout=60000)
        time.sleep(30)

        scroll_down_hard(page)

        print("Parsing HTML in memory...")
        html = page.content()
        soup = BeautifulSoup(html, "html.parser")

        results = []
        search_made = soup.find('input', {"aria-label": "Search Marketplace"}).get("value")
        seen = set()

        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "/marketplace/item/" in href and href not in seen:
                seen.add(href)
                listing = extract_listing_info(a, search=search_made)
                if listing:
                    results.append(listing)


        # Load existing master list from disk
        master_list = load_master_list()

        # Merge new unique listings into master list
        master_list = merge_results(master_list, results)

        # Save updated master list back to JSON
        save_master_list(master_list)

        browser.close()


if __name__ == "__main__":
    main()
