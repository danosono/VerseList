// js/app.js
// UI orchestration for VerseList: parses pasted references (js/verse-list.js),
// renders verse cards, toggles "As Entered" vs "Bible Order", drag-to-reorder
// in As Entered mode, and keeps the current list/order shareable via the URL
// hash (#refs=...) and restorable via localStorage.
import { parseReferenceList, sortByBibleOrder, serializeEntries } from "./verse-list.js";
import { isProfane } from "./profanity-filter.js";

const STORAGE_KEY = "vlLastList";

const els = {
  inputSection: document.getElementById("vl-input-section"),
  inputBox: document.getElementById("vl-input-box"),
  loadBtn: document.getElementById("vl-load-btn"),
  errors: document.getElementById("vl-errors"),
  listSection: document.getElementById("vl-list-section"),
  listTitle: document.getElementById("vl-list-title"),
  orderEnteredBtn: document.getElementById("vl-order-entered"),
  orderBibleBtn: document.getElementById("vl-order-bible"),
  copyLinkBtn: document.getElementById("vl-copy-link-btn"),
  editBtn: document.getElementById("vl-edit-btn"),
  dragHint: document.getElementById("vl-drag-hint"),
  cards: document.getElementById("vl-cards"),
  empty: document.getElementById("vl-empty"),
};

const DEFAULT_DOCUMENT_TITLE = document.title;

// enteredOrder: array of entries in the user's custom/pasted order (the
// order drag-to-reorder edits). orderMode: "entered" | "bible" — a view
// toggle, never destroys enteredOrder. currentTitle: the list's name.
// Deliberately settable only via an incoming link's title= param (or
// localStorage carrying one forward) — never by typing into the paste box
// — so VerseList's own UI doesn't invite free-text title entry. A title
// arrives here from a sibling app (e.g. Bible Peruser's planned "copy
// list" button) generating a link, not from this page.
let enteredOrder = [];
let orderMode = "entered";
let currentTitle = null;
// Set by the Edit List button so the very next submit carries the current
// title through unchanged (editing an already-titled list shouldn't lose
// its name). Any other submit clears the title — pasting a fresh,
// unrelated list shouldn't keep showing an old one's name.
let pendingExplicitTitle;

function showErrors(errors) {
  els.errors.innerHTML = "";
  if (!errors.length) {
    els.errors.hidden = true;
    return;
  }
  errors.forEach((e) => {
    const li = document.createElement("li");
    li.textContent = e.reason;
    els.errors.appendChild(li);
  });
  els.errors.hidden = false;
}

function currentEntries() {
  return orderMode === "bible" ? sortByBibleOrder(enteredOrder) : enteredOrder;
}

function renderCards() {
  const entries = currentEntries();
  els.cards.innerHTML = "";

  entries.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "vl-card";
    card.dataset.id = entry.id;

    const header = document.createElement("div");
    header.className = "vl-card__header";

    if (orderMode === "entered") {
      const handle = document.createElement("span");
      handle.className = "vl-drag-handle";
      handle.setAttribute("aria-hidden", "true");
      handle.innerHTML = "&#9776;";
      header.appendChild(handle);
    }

    const title = document.createElement("h2");
    title.className = "vl-card__title";
    title.textContent = entry.label;
    header.appendChild(title);

    card.appendChild(header);

    const body = document.createElement("p");
    body.className = "vl-card__body";
    let lastChapter = null;
    entry.verses.forEach((v) => {
      const sup = document.createElement("sup");
      sup.textContent = v.chapter !== lastChapter ? `${v.chapter}:${v.n}` : v.n;
      lastChapter = v.chapter;
      body.appendChild(sup);
      body.appendChild(document.createTextNode(`${v.text} `));
    });
    card.appendChild(body);

    els.cards.appendChild(card);
  });

  els.dragHint.hidden = orderMode !== "entered" || entries.length < 2;
}

function renderTitle() {
  if (currentTitle) {
    els.listTitle.textContent = currentTitle;
    els.listTitle.hidden = false;
    document.title = `${currentTitle} — VerseList`;
  } else {
    els.listTitle.hidden = true;
    document.title = DEFAULT_DOCUMENT_TITLE;
  }
}

function updateOrderButtons() {
  els.orderEnteredBtn.classList.toggle("is-active", orderMode === "entered");
  els.orderBibleBtn.classList.toggle("is-active", orderMode === "bible");
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ refs: enteredOrder.map((e) => e.raw), orderMode, title: currentTitle }),
    );
  } catch (_) {
    /* storage unavailable — sharing/reload restore just won't persist */
  }
  syncHash();
}

function syncHash() {
  const params = new URLSearchParams();
  params.set("refs", serializeEntries(enteredOrder));
  if (orderMode === "bible") params.set("order", "bible");
  if (currentTitle) params.set("title", currentTitle);
  history.replaceState(null, "", `#${params.toString()}`);
}

// explicitTitle carries a title in from a shared link, localStorage, or an
// Edit-List resubmit (see pendingExplicitTitle above) — the paste box
// itself never sets one, so any submit without an explicitTitle clears it.
async function loadFromText(rawText, explicitTitle) {
  const { entries, errors } = await parseReferenceList(rawText);
  let title = explicitTitle || null;
  if (title && isProfane(title)) {
    errors.push({ token: title, reason: "That title wasn't used — please keep it appropriate." });
    title = null;
  }
  currentTitle = title;
  showErrors(errors);
  renderTitle();
  if (!entries.length) {
    els.listSection.hidden = true;
    els.empty.hidden = false;
    return;
  }
  enteredOrder = entries;
  els.empty.hidden = true;
  els.listSection.hidden = false;
  renderCards();
  updateOrderButtons();
  persist();
}

function handleShowVerses() {
  const explicitTitle = pendingExplicitTitle;
  pendingExplicitTitle = undefined;
  loadFromText(els.inputBox.value, explicitTitle);
  els.loadBtn.classList.add("is-flashing");
  setTimeout(() => els.loadBtn.classList.remove("is-flashing"), 350);
}

els.loadBtn.addEventListener("click", handleShowVerses);

// Keyboard-only submit, since the paste box is the whole point of this app
// and reaching for the mouse to click Show Verses breaks flow. Ctrl/Cmd+Enter
// is the standard "submit this textarea" convention (Gmail, Slack, GitHub
// comment boxes); plain Enter twice from a blank trailing line is a second,
// more discoverable path — scoped to the very end of the text so it can't
// misfire while editing earlier lines in a multi-line paste.
els.inputBox.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    handleShowVerses();
    return;
  }

  if (e.shiftKey || e.altKey) return;
  const { selectionStart, selectionEnd, value } = els.inputBox;
  const atEnd = selectionStart === selectionEnd && selectionStart === value.length;
  const onBlankTrailingLine = /(^|\n)[ \t]*$/.test(value.slice(0, selectionStart));
  if (atEnd && onBlankTrailingLine && value.trim().length > 0) {
    e.preventDefault();
    handleShowVerses();
  }
});

els.editBtn.addEventListener("click", () => {
  pendingExplicitTitle = currentTitle;
  els.inputBox.value = enteredOrder.map((e) => e.raw).join("\n");
  els.inputSection.scrollIntoView({ behavior: "smooth", block: "start" });
  els.inputBox.focus();
});

els.orderEnteredBtn.addEventListener("click", () => {
  if (orderMode === "entered") return;
  orderMode = "entered";
  updateOrderButtons();
  renderCards();
  persist();
});

els.orderBibleBtn.addEventListener("click", () => {
  if (orderMode === "bible") return;
  orderMode = "bible";
  updateOrderButtons();
  renderCards();
  persist();
});

els.copyLinkBtn.addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}${location.hash}`;
  try {
    await navigator.clipboard.writeText(url);
    const original = els.copyLinkBtn.textContent;
    els.copyLinkBtn.textContent = "Copied!";
    setTimeout(() => {
      els.copyLinkBtn.textContent = original;
    }, 1500);
  } catch (_) {
    window.prompt("Copy this link:", url);
  }
});

// --- Drag-to-reorder (As Entered mode only) ---------------------------
// Native Pointer Events, no library. Uses a lightweight FLIP-style
// transform compensation so the dragged card keeps tracking the pointer
// smoothly across DOM reorders instead of visually jumping.
(function attachDragReorder() {
  let dragEl = null;
  let originClientY = 0;
  let baseOffset = 0;

  function onPointerDown(e) {
    if (orderMode !== "entered") return;
    const handle = e.target.closest(".vl-drag-handle");
    if (!handle) return;
    const card = handle.closest(".vl-card");
    if (!card) return;

    e.preventDefault();
    dragEl = card;
    originClientY = e.clientY;
    baseOffset = 0;
    dragEl.classList.add("is-dragging");
    dragEl.style.pointerEvents = "none";
    els.cards.setPointerCapture(e.pointerId);
    els.cards.addEventListener("pointermove", onPointerMove);
    els.cards.addEventListener("pointerup", onPointerUp);
    els.cards.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragEl) return;
    const transformY = baseOffset + (e.clientY - originClientY);
    dragEl.style.transform = `translateY(${transformY}px)`;

    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest(".vl-card");
    if (!target || target === dragEl) return;

    const rect = target.getBoundingClientRect();
    const insertBeforeTarget = e.clientY < rect.top + rect.height / 2;
    const referenceNode = insertBeforeTarget ? target : target.nextElementSibling;
    if (referenceNode === dragEl || dragEl.nextElementSibling === referenceNode) return;

    const prevRect = dragEl.getBoundingClientRect();
    els.cards.insertBefore(dragEl, referenceNode);
    dragEl.style.transform = "none";
    const newRect = dragEl.getBoundingClientRect();
    const diff = prevRect.top - newRect.top;
    baseOffset = diff;
    originClientY = e.clientY;
    dragEl.style.transform = `translateY(${diff}px)`;
  }

  function onPointerUp(e) {
    if (!dragEl) return;
    els.cards.releasePointerCapture(e.pointerId);
    els.cards.removeEventListener("pointermove", onPointerMove);
    els.cards.removeEventListener("pointerup", onPointerUp);
    els.cards.removeEventListener("pointercancel", onPointerUp);

    dragEl.style.transform = "";
    dragEl.style.pointerEvents = "";
    dragEl.classList.remove("is-dragging");

    const newOrderIds = Array.from(els.cards.children).map((c) => c.dataset.id);
    enteredOrder = newOrderIds
      .map((id) => enteredOrder.find((entry) => entry.id === id))
      .filter(Boolean);
    dragEl = null;
    persist();
  }

  els.cards.addEventListener("pointerdown", onPointerDown);
})();

// --- Restore on load: URL hash takes priority over localStorage --------
async function init() {
  if (location.hash.length > 1) {
    const params = new URLSearchParams(location.hash.slice(1));
    const refs = params.get("refs");
    if (refs) {
      orderMode = params.get("order") === "bible" ? "bible" : "entered";
      await loadFromText(refs, params.get("title") || undefined);
      return;
    }
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Array.isArray(saved.refs) && saved.refs.length) {
      orderMode = saved.orderMode === "bible" ? "bible" : "entered";
      await loadFromText(saved.refs.join("\n"), saved.title || undefined);
    }
  } catch (_) {
    /* ignore malformed storage */
  }
}

init();
