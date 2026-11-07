let allListings = [];
let activeTags = [];
let selectedSearchTags = new Set();

async function loadListings() {
  const res = await fetch('/api/listings');
  allListings = await res.json();
  renderSearchTags(getUniqueSearchTags(allListings));
  renderListings(allListings);

  document.getElementById("apply-filter").addEventListener("click", applyFilters);
  document.getElementById("searchtitle").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && this.value.trim()) {
      addTag(this.value.trim());
      this.value = "";
    }
  });
}

function getUniqueSearchTags(listings) {
  return [...new Set(listings.map(listing => listing.search).filter(Boolean))];
}

function renderSearchTags(tags) {
  const container = document.getElementById("search-tag-container");
  container.innerHTML = "";

  tags.forEach(tag => {
    const btn = document.createElement("button");
    btn.textContent = tag;
    btn.classList.add("tag");
    btn.onclick = () => {
      if (selectedSearchTags.has(tag)) {
        selectedSearchTags.delete(tag);
        btn.classList.remove("selected");
      } else {
        selectedSearchTags.add(tag);
        btn.classList.add("selected");
      }
      applyFilters();
    };
    container.appendChild(btn);
  });
}

function addTag(tag) {
  if (!activeTags.includes(tag.toLowerCase())) {
    activeTags.push(tag.toLowerCase());
    updateActiveTags();
    applyFilters();
  }
}

function removeTag(tag) {
  activeTags = activeTags.filter(t => t !== tag);
  updateActiveTags();
  applyFilters();
}

function updateActiveTags() {
  const container = document.getElementById("active-tags");
  container.innerHTML = "";

  activeTags.forEach(tag => {
    const span = document.createElement("span");
    span.className = "tag selected";
    span.textContent = tag;
    span.onclick = () => removeTag(tag);
    container.appendChild(span);
  });
}

function applyFilters() {
  const minPrice = parseInt(document.getElementById("min-price").value || 0);
  const maxInput = document.getElementById("max-price").value;
  const maxPrice = maxInput ? parseInt(maxInput) : Infinity;

  const filtered = allListings.filter(listing => {
    const price = parsePrice(listing.price);
    const title = (listing.title || '').toLowerCase();
    const location = listing.location || '';
    const search = listing.search;

    const matchesPrice = !isNaN(price) && price >= minPrice && price <= maxPrice;
    const notShipping = !location.includes("Ships to you");
    const matchesSearch = selectedSearchTags.size === 0 || selectedSearchTags.has(search);
    const matchesTags = activeTags.every(tag => title.includes(tag));

    return matchesPrice && notShipping && matchesSearch && matchesTags;
  });

  const sorted = filtered.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
  renderListings(sorted);
}

function parsePrice(priceStr) {
  return Number((priceStr || '').replace(/[^0-9.]/g, ""));
}

function renderListings(listings) {
  const tbody = document.getElementById("listings-body");
  tbody.innerHTML = "";
  document.getElementById("numberlistings").textContent = `${listings.length} listings`;

  listings.forEach(listing => {
    const row = document.createElement("tr");
    if (listing.seen) row.classList.add("seen");

    row.innerHTML = `
      <td>${listing.title}</td>
      <td>${listing.location}</td>
      <td>${listing.price}</td>
      <td><a href="${listing.link}" target="_blank" class="view-link" data-link="${listing.link}">View</a></td>
    `;
    tbody.appendChild(row);
  });

  document.querySelectorAll(".view-link").forEach(link => {
    link.addEventListener("click", async function () {
      this.closest("tr").classList.add("seen");
      await fetch('/api/mark-seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link: this.dataset.link })
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", loadListings);
