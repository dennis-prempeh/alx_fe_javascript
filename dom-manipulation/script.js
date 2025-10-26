const LOCAL_STORAGE_KEY = "quotes_v1";
const LAST_FILTER_KEY = "lastSelectedCategory";
const SESSION_LAST_VIEWED = "lastViewedQuote";
let selectedCategory = "all";

const defaultQuotes = [
  { text: "The only way to do great work is to love what you do.", category: "Motivation" },
  { text: "Life is what happens when you're busy making other plans.", category: "Life" },
  { text: "In the middle of every difficulty lies opportunity.", category: "Wisdom" },
  { text: "Simplicity is the ultimate sophistication.", category: "Design" },
];

let quotes = [];
function saveQuotes() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(quotes));
}

function loadQuotes() {
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (stored) {
    try {
      quotes = JSON.parse(stored);
    } catch {
      quotes = [...defaultQuotes];
    }
  } else {
    quotes = [...defaultQuotes];
    saveQuotes();
  }
}

/* === Escape HTML (for safety) === */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* === Random Quote Display === */
function showRandomQuote(filteredList = quotes) {
  const quoteDisplay = document.getElementById("quoteDisplay");
  if (!filteredList.length) {
    quoteDisplay.innerHTML = "<p>No quotes found for this category.</p>";
    return;
  }
  const randomIndex = Math.floor(Math.random() * filteredList.length);
  const { text, category } = filteredList[randomIndex];
  quoteDisplay.innerHTML = `
    <blockquote style="font-style:italic;">"${escapeHtml(text)}"</blockquote>
    <p><strong>Category:</strong> ${escapeHtml(category)}</p>
  `;
  // save last viewed to session storage
  sessionStorage.setItem(SESSION_LAST_VIEWED, JSON.stringify({ text, category }));
}
function populateCategories() {
  let categories = [...new Set(quotes.map(q => q.category))];
  const dropdown = document.getElementById("categoryFilter");
  dropdown.innerHTML = `<option value="all">All Categories</option>`;
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    dropdown.appendChild(opt);
  });

  const lastFilter = localStorage.getItem(LAST_FILTER_KEY);
  if (lastFilter && (categories.includes(lastFilter) || lastFilter === "all")) {
    dropdown.value = lastFilter;
    filterQuotes();
  }
}
function filterQuotes() {
  const selectedCategory = document.getElementById("categoryFilter").value;
  localStorage.setItem(LAST_FILTER_KEY, selectedCategory);

  if (selectedCategory === "all") {
    showRandomQuote(quotes);
  } else {
    const filtered = quotes.filter(q => q.category === selectedCategory);
    showRandomQuote(filtered);
  }
}
function createAddQuoteForm() {
  const form = document.createElement("form");
  form.id = "addQuoteForm";
  form.innerHTML = `
    <input id="quoteText" type="text" placeholder="Enter quote text" required />
    <input id="quoteCategory" type="text" placeholder="Enter category" required />
    <button type="submit">Add Quote</button>
  `;
  document.body.appendChild(form);

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const text = document.getElementById("quoteText").value.trim();
    const category = document.getElementById("quoteCategory").value.trim();
    if (!text || !category) {
      alert("Please fill in both fields.");
      return;
    }

    const newQuote = { text, category };

    try {
      const response = await fetch(SERVER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newQuote)
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      quotes.push(newQuote);
      saveQuotes();
      populateCategories();
      form.reset();
      showRandomQuote();
      notifyUser("Quote added successfully!");
    } catch (error) {
      console.error('Error posting quote:', error);
      notifyUser("Failed to add quote to server. Please try again.");
    }
  });
}

function createImportExportUI() {
  const container = document.createElement("div");
  container.style.marginTop = "1rem";
  container.innerHTML = `
    <button id="exportBtn">Export Quotes (JSON)</button>
    <label for="importFile" style="cursor:pointer; border:1px solid; padding:0.3rem;">Import Quotes</label>
    <input type="file" id="importFile" accept=".json" style="display:none;" />
  `;
  document.body.appendChild(container);

  document.getElementById("exportBtn").addEventListener("click", exportQuotes);
  document.getElementById("importFile").addEventListener("change", importQuotes);
}

function exportQuotes() {
  const blob = new Blob([JSON.stringify(quotes, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "quotes.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importQuotes(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error("Invalid format");
      quotes.push(...imported);
      saveQuotes();
      populateCategories();
      alert("Quotes imported successfully!");
    } catch {
      alert("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
}

async function syncQuotes() {
  try {
    const localQuotes = quotes;
    const response = await fetch(SERVER_URL);
    if (!response.ok) throw new Error('Network response was not ok');
    const serverQuotes = await response.json();

    const formattedServerQuotes = serverQuotes.slice(0, 5).map(post => ({
      text: post.title,
      category: "Server",
      serverId: post.id
    }));

    const conflicts = [];
    const mergedQuotes = [...formattedServerQuotes];

    localQuotes.forEach(local => {
      const serverQuote = formattedServerQuotes.find(sq => sq.text === local.text);
      if (serverQuote) {
        if (serverQuote.category !== local.category) {
          conflicts.push({ local, server: serverQuote });
        }
      } else {
        mergedQuotes.push(local);
      }
    });

    // Handle conflicts in UI if any exist
    if (conflicts.length > 0) {
      showConflictResolutionUI(conflicts, mergedQuotes);
    } else {
      quotes = mergedQuotes;
      saveQuotes();
      populateCategories();
      notifyUser("Quotes synced with server!");
    }

    return true;
  } catch (error) {
    console.error('Sync failed:', error);
    notifyUser("Failed to sync with server");
    return false;
  }
}

let syncInterval;
function startPeriodicSync() {
  syncQuotes();
  syncInterval = setInterval(syncQuotes, 5 * 60 * 1000);
}

function stopPeriodicSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

function showConflictResolutionUI(conflicts, mergedQuotes) {
  const modal = document.createElement('div');
  modal.className = 'conflict-modal';
  modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:1px solid #ccc;max-height:80vh;overflow-y:auto;';

  modal.innerHTML = `
    <h3>Conflicts Found</h3>
    <div id="conflicts"></div>
    <button id="resolveAll">Keep All Local</button>
    <button id="resolveServer">Keep All Server</button>
  `;

  const conflictsDiv = modal.querySelector('#conflicts');
  conflicts.forEach((conflict, i) => {
    conflictsDiv.innerHTML += `
      <div class="conflict" style="margin:10px 0;padding:10px;border:1px solid #eee;">
        <p>Local: "${conflict.local.text}" (${conflict.local.category})</p>
        <p>Server: "${conflict.server.text}" (${conflict.server.category})</p>
        <button onclick="resolveConflict(${i}, 'local')">Keep Local</button>
        <button onclick="resolveConflict(${i}, 'server')">Keep Server</button>
      </div>
    `;
  });

  document.body.appendChild(modal);

  window.resolveConflict = function (index, choice) {
    const conflict = conflicts[index];
    const quoteToKeep = choice === 'local' ? conflict.local : conflict.server;

    // Update mergedQuotes with the chosen version
    const quoteIndex = mergedQuotes.findIndex(q => q.text === conflict.server.text);
    if (quoteIndex !== -1) {
      mergedQuotes[quoteIndex] = quoteToKeep;
    } else {
      mergedQuotes.push(quoteToKeep);
    }

    // Remove the conflict UI element
    conflictsDiv.children[index].remove();

    // If no more conflicts, update and close
    if (conflictsDiv.children.length === 0) {
      quotes = mergedQuotes;
      saveQuotes();
      populateCategories();
      modal.remove();
      notifyUser("All conflicts resolved!");
    }
  };

  modal.querySelector('#resolveAll').onclick = () => {
    conflicts.forEach((_, i) => resolveConflict(i, 'local'));
  };

  modal.querySelector('#resolveServer').onclick = () => {
    conflicts.forEach((_, i) => resolveConflict(i, 'server'));
  };
}

/* === INIT === */
document.addEventListener("DOMContentLoaded", () => {
  loadQuotes();
  populateCategories();
  createAddQuoteForm();
  createImportExportUI();

  const syncStatus = document.createElement('div');
  syncStatus.id = 'notification';
  syncStatus.style.cssText = 'position:fixed;bottom:20px;right:20px;background:rgba(0,0,0,0.8);color:white;padding:10px;border-radius:5px;display:none;';
  document.body.appendChild(syncStatus);

  startPeriodicSync();

  document.getElementById("newQuote").addEventListener("click", filterQuotes);
  const last = sessionStorage.getItem(SESSION_LAST_VIEWED);
  if (last) {
    const { text, category } = JSON.parse(last);
    document.getElementById("quoteDisplay").innerHTML = `
      <blockquote style="font-style:italic;">"${escapeHtml(text)}"</blockquote>
      <p><strong>Category:</strong> ${escapeHtml(category)}</p>
    `;
  } else {
    showRandomQuote();
  }
});


const SERVER_URL = "https://jsonplaceholder.typicode.com/posts";

async function fetchQuotesFromServer() {
  try {
    const res = await fetch(SERVER_URL);
    const data = await res.json();

    const serverQuotes = data.slice(0, 5).map(post => ({
      text: post.title,
      category: "Server"
    }));

    handleServerSync(serverQuotes);
  } catch (err) {
    console.error("Server fetch failed:", err);
  }
}

function handleServerSync(serverQuotes) {
  const localQuotes = JSON.parse(localStorage.getItem("quotes")) || [];
  const mergedQuotes = [...serverQuotes];

  localQuotes.forEach(local => {
    const exists = serverQuotes.some(sq => sq.text === local.text);
    if (!exists) mergedQuotes.push(local);
  });

  localStorage.setItem("quotes", JSON.stringify(mergedQuotes));
  quotes = mergedQuotes;

  populateCategories();
  filterQuotes();

  notifyUser("Quotes synced with server!");
}


function notifyUser(message) {
  const note = document.getElementById("notification");
  note.textContent = message;
  setTimeout(() => (note.textContent = ""), 3000);
}
