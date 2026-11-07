let allListings = [];
let activeTags = [];
let selectedSearchTags = new Set();
let searchQuery = "";
let statusFilter = "all"; // 'all' | 'unseen' | 'seen'
let sortColumn = "price";
let sortDirection = "desc";

// ============================================================================
// Initialization & Data Loading
// ============================================================================
async function loadListings() {
  try {
    const res = await fetch('/api/listings');
    if (!res.ok) throw new Error("Failed to load listings");
    allListings = await res.json();
  } catch (err) {
    console.error("Error fetching listings:", err);
    allListings = [];
  }

  updateStats();
  renderFilterPills();
  applyFilters();
}

function updateStats() {
  const total = allListings.length;
  const seenCount = allListings.filter(l => l.seen).length;
  const unseenCount = total - seenCount;

  const countAll = document.getElementById("count-all");
  const countUnseen = document.getElementById("count-unseen");
  const countSeen = document.getElementById("count-seen");
  const statsSummary = document.getElementById("stats-summary");

  if (countAll) countAll.textContent = total;
  if (countUnseen) countUnseen.textContent = unseenCount;
  if (countSeen) countSeen.textContent = seenCount;

  if (statsSummary) {
    if (total === 0) {
      statsSummary.textContent = "0 listings available";
    } else {
      statsSummary.textContent = `${total} total listings &bull; ${unseenCount} unread &bull; ${seenCount} seen`;
    }
  }
}

// ============================================================================
// Dynamic Filter Pills (Only displayed when tags/categories exist)
// ============================================================================
function getUniqueSearchTags(listings) {
  return [...new Set(listings.map(l => (l.search || '').trim()).filter(Boolean))];
}

function renderFilterPills() {
  const pillsBar = document.getElementById("filter-pills-bar");
  const searchContainer = document.getElementById("search-tag-container");
  const activeTagsContainer = document.getElementById("active-tags");
  const clearAllBtn = document.getElementById("clear-all-tags");

  const uniqueSearches = getUniqueSearchTags(allListings);
  const hasCategories = uniqueSearches.length > 0;
  const hasActiveTags = activeTags.length > 0;
  const hasSelections = selectedSearchTags.size > 0 || hasActiveTags;

  if (!hasCategories && !hasActiveTags) {
    pillsBar.style.display = "none";
    return;
  }

  pillsBar.style.display = "flex";
  searchContainer.innerHTML = "";
  activeTagsContainer.innerHTML = "";

  // Render search category pills
  uniqueSearches.forEach(category => {
    const isSelected = selectedSearchTags.has(category);
    const pill = document.createElement("button");
    pill.className = `pill ${isSelected ? 'selected' : ''}`;
    pill.textContent = category;
    pill.onclick = () => {
      if (selectedSearchTags.has(category)) {
        selectedSearchTags.delete(category);
      } else {
        selectedSearchTags.add(category);
      }
      renderFilterPills();
      applyFilters();
    };
    searchContainer.appendChild(pill);
  });

  // Render user keyword tags
  activeTags.forEach(tag => {
    const pill = document.createElement("span");
    pill.className = "pill selected";
    pill.innerHTML = `<span>${tag}</span><span class="pill-close" title="Remove tag">&times;</span>`;
    pill.querySelector(".pill-close").onclick = (e) => {
      e.stopPropagation();
      removeTag(tag);
    };
    activeTagsContainer.appendChild(pill);
  });

  if (clearAllBtn) {
    clearAllBtn.style.display = hasSelections ? "inline-block" : "none";
  }
}

function addTag(tag) {
  const cleaned = tag.toLowerCase().trim();
  if (cleaned && !activeTags.includes(cleaned)) {
    activeTags.push(cleaned);
    renderFilterPills();
    applyFilters();
  }
}

function removeTag(tag) {
  activeTags = activeTags.filter(t => t !== tag);
  renderFilterPills();
  applyFilters();
}

function clearAllFilters() {
  selectedSearchTags.clear();
  activeTags = [];
  searchQuery = "";
  const quickSearchInput = document.getElementById("quick-search");
  if (quickSearchInput) quickSearchInput.value = "";
  document.getElementById("clear-search").style.display = "none";
  renderFilterPills();
  applyFilters();
}

// ============================================================================
// Filtering, Sorting & Table Rendering
// ============================================================================
function parsePrice(priceStr) {
  if (!priceStr) return 0;
  const matches = String(priceStr).match(/([₪$€£¥]?\s*[\d,]+(?:\.\d+)?\s*[₪$€£¥]?)/g);
  if (matches) {
    const nums = matches
      .map(m => Number(m.replace(/[^0-9.]/g, "")))
      .filter(n => !isNaN(n) && n > 0);
    if (nums.length > 0) {
      return nums[0];
    }
  }
  const digits = String(priceStr).replace(/[^0-9.]/g, "");
  return Number(digits) || 0;
}

function applyFilters() {
  const query = searchQuery.toLowerCase().trim();

  const filtered = allListings.filter(listing => {
    // Status Filter (All / Unseen / Seen)
    if (statusFilter === "unseen" && listing.seen) return false;
    if (statusFilter === "seen" && !listing.seen) return false;

    const title = (listing.title || '').toLowerCase();
    const location = (listing.location || '').toLowerCase();
    const search = (listing.search || '').toLowerCase();

    // Exclude shipping items
    if (location.includes("ships to you")) return false;

    // Search Category pill filter
    if (selectedSearchTags.size > 0 && !selectedSearchTags.has(listing.search)) {
      return false;
    }

    // Keyword tags filter (must contain all)
    if (activeTags.length > 0) {
      const matchesAllTags = activeTags.every(tag => title.includes(tag) || search.includes(tag));
      if (!matchesAllTags) return false;
    }

    // Instant search query filter
    if (query) {
      const matchesQuery = title.includes(query) || location.includes(query) || search.includes(query);
      if (!matchesQuery) return false;
    }

    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    let comp = 0;
    if (sortColumn === "price") {
      comp = parsePrice(a.price) - parsePrice(b.price);
    } else if (sortColumn === "title") {
      comp = (a.title || "").localeCompare(b.title || "");
    } else if (sortColumn === "location") {
      comp = (a.location || "").localeCompare(b.location || "");
    }
    return sortDirection === "asc" ? comp : -comp;
  });

  renderListings(filtered);
}

function renderListings(listings) {
  const tbody = document.getElementById("listings-body");
  const emptyState = document.getElementById("empty-state");
  const table = document.getElementById("listings-table");
  const footerCount = document.getElementById("footer-count");

  tbody.innerHTML = "";

  if (footerCount) {
    footerCount.textContent = `${listings.length} listing${listings.length === 1 ? '' : 's'} showing`;
  }

  if (listings.length === 0) {
    table.style.display = "none";
    emptyState.style.display = "flex";
    return;
  }

  table.style.display = "table";
  emptyState.style.display = "none";

  const fragment = document.createDocumentFragment();

  listings.forEach((listing, index) => {
    const row = document.createElement("tr");
    if (listing.seen) {
      row.classList.add("is-seen");
    }

    const isNew = !listing.seen;
    const statusPill = isNew
      ? `<span class="status-pill new">NEW</span>`
      : `<span class="status-pill seen">SEEN</span>`;

    const searchQueryBadge = listing.search
      ? `<span class="item-search" title="${listing.search}">${listing.search}</span>`
      : `<span style="color: #cbd5e1;">—</span>`;

    let priceHtml = '';
    if (listing.original_price) {
      priceHtml = `
        <div class="price-container">
          <span class="current-price">${escapeHtml(listing.price || 'N/A')}</span>
          <span class="original-price" title="Original price">${escapeHtml(listing.original_price)}</span>
        </div>
      `;
    } else {
      priceHtml = `<span class="current-price">${escapeHtml(listing.price || 'N/A')}</span>`;
    }

    row.innerHTML = `
      <td class="row-index">${index + 1}</td>
      <td class="col-status">${statusPill}</td>
      <td class="col-title"><div class="item-title" title="${escapeHtml(listing.title || '')}">${escapeHtml(listing.title || 'Untitled')}</div></td>
      <td class="col-price item-price">${priceHtml}</td>
      <td class="col-location"><div class="item-location" title="${escapeHtml(listing.location || '')}">${escapeHtml(listing.location || 'N/A')}</div></td>
      <td class="col-search">${searchQueryBadge}</td>
      <td class="col-action">
        <a href="${listing.link}" target="_blank" rel="noopener noreferrer" class="btn-view" data-link="${escapeHtml(listing.link)}">
          View
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      </td>
    `;

    fragment.appendChild(row);
  });

  tbody.appendChild(fragment);

  // Attach click handlers to View buttons
  tbody.querySelectorAll(".btn-view").forEach(linkBtn => {
    linkBtn.addEventListener("click", function () {
      const link = this.dataset.link;
      const row = this.closest("tr");
      row.classList.add("is-seen");
      const statusCell = row.querySelector(".col-status");
      if (statusCell) {
        statusCell.innerHTML = `<span class="status-pill seen">SEEN</span>`;
      }

      // Update in-memory listing
      const target = allListings.find(l => l.link === link);
      if (target) target.seen = true;
      updateStats();

      // Persist to server
      fetch('/api/mark-seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link })
      }).catch(err => console.error("Error saving seen state:", err));
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// CSV Export Functionality (Excel-Friendly)
// ============================================================================
function exportToCSV() {
  if (allListings.length === 0) {
    alert("No listings available to export.");
    return;
  }

  const headers = ["Title", "Price", "Original Price", "Location", "Search Term", "Status", "Link"];
  const rows = allListings.map(l => [
    `"${(l.title || '').replace(/"/g, '""')}"`,
    `"${(l.price || '').replace(/"/g, '""')}"`,
    `"${(l.original_price || '').replace(/"/g, '""')}"`,
    `"${(l.location || '').replace(/"/g, '""')}"`,
    `"${(l.search || '').replace(/"/g, '""')}"`,
    l.seen ? "Seen" : "New",
    `"${(l.link || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `marketplace_listings_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================================================
// Event Listeners & Setup
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  loadListings();

  // Status Segmented Control (All / Unseen / Seen)
  const segmentedButtons = document.querySelectorAll("#status-filter .seg-btn");
  segmentedButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      segmentedButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      statusFilter = btn.dataset.status;
      applyFilters();
    });
  });

  // Quick Instant Search Input
  const quickSearchInput = document.getElementById("quick-search");
  const clearSearchBtn = document.getElementById("clear-search");

  quickSearchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    clearSearchBtn.style.display = searchQuery ? "inline-block" : "none";
    applyFilters();
  });

  clearSearchBtn.addEventListener("click", () => {
    quickSearchInput.value = "";
    searchQuery = "";
    clearSearchBtn.style.display = "none";
    applyFilters();
    quickSearchInput.focus();
  });

  // Keyword Tag Input
  const tagInput = document.getElementById("searchtitle");
  tagInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && this.value.trim()) {
      addTag(this.value.trim());
      this.value = "";
    }
  });

  // Clear All Tags
  const clearAllBtn = document.getElementById("clear-all-tags");
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", clearAllFilters);
  }

  // Column Header Sorting
  document.querySelectorAll(".dense-table th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.sort;
      if (sortColumn === col) {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
      } else {
        sortColumn = col;
        sortDirection = col === "price" ? "desc" : "asc";
      }

      document.querySelectorAll(".dense-table th.sortable").forEach(h => {
        h.classList.remove("sorted-asc", "sorted-desc");
      });
      th.classList.add(sortDirection === "asc" ? "sorted-asc" : "sorted-desc");

      applyFilters();
    });
  });

  // Export CSV
  const exportBtn = document.getElementById("btn-export-csv");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportToCSV);
  }

  // Refresh
  const refreshBtn = document.getElementById("btn-refresh");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadListings();
    });
  }

  // Mark All Seen
  const markAllBtn = document.getElementById("btn-mark-all-seen");
  if (markAllBtn) {
    markAllBtn.addEventListener("click", async () => {
      if (allListings.length === 0) return;
      if (!confirm("Are you sure you want to mark all listings as seen?")) return;

      try {
        await fetch('/api/mark-all-seen', { method: 'POST' });
        allListings.forEach(l => l.seen = true);
        updateStats();
        applyFilters();
      } catch (err) {
        console.error("Failed to mark all as seen:", err);
      }
    });
  }
});
