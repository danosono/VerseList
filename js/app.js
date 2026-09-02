// js/app.js
// UI orchestration for VerseList: parses pasted references (js/verse-list.js),
// renders verse cards, toggles "As Entered" vs "Bible Order", drag-to-reorder
// in As Entered mode, and keeps the current list/order shareable via the URL
// hash (#refs=...) and restorable via localStorage.
import { parseReferenceList, sortByBibleOrder, serializeEntries } from "./verse-list.js";

const STORAGE_KEY = "vlLastList";

const els = {
  inputSection: document.getElementById("vl-input-section"),
  inputBox: document.getElementById("vl-input-box"),
  loadBtn: document.getElementById("vl-load-btn"),
  errors: document.getElementById("vl-errors"),
  listSection: document.getElementById("vl-list-section"),
  orderEnteredBtn: document.getElementById("vl-order-entered"),
  orderBibleBtn: document.getElementById("vl-order-bible"),
  copyLinkBtn: document.getElementById("vl-copy-link-btn"),
  editBtn: document.getElementById("vl-edit-btn"),
  dragHint: document.getElementById("vl-drag-hint"),
  cards: document.getElementById("vl-cards"),
  empty: document.getElementById("vl-empty"),
};

// enteredOrder: array of entries in the user's custom/pasted order (the
// order drag-to-reorder edits). orderMode: "entered" | "bible" — a view
// toggle, never destroys enteredOrder.
let enteredOrder = [];
let orderMode = "entered";

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

function updateOrderButtons() {
  els.orderEnteredBtn.classList.toggle("is-active", orderMode === "entered");
  els.orderBibleBtn.classList.toggle("is-active", orderMode === "bible");
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ refs: enteredOrder.map((e) => e.raw), orderMode }),
    );
  } catch (_) {
    /* storage unavailable — sharing/reload restore just won't persist */
  }
  syncHash();
}

function syncHash() {
  const text = serializeEntries(enteredOrder);
  const hash = `#refs=${encodeURIComponent(text)}${orderMode === "bible" ? "&order=bible" : ""}`;
  history.replaceState(null, "", hash);
}

async function loadFromText(rawText) {
  const { entries, errors } = await parseReferenceList(rawText);
  showErrors(errors);
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

els.loadBtn.addEventListener("click", () => {
  loadFromText(els.inputBox.value);
});

els.editBtn.addEventListener("click", () => {
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
  const hashMatch = location.hash.match(/#refs=([^&]*)(?:&order=(\w+))?/);
  if (hashMatch) {
    const text = decodeURIComponent(hashMatch[1]);
    orderMode = hashMatch[2] === "bible" ? "bible" : "entered";
    await loadFromText(text);
    return;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Array.isArray(saved.refs) && saved.refs.length) {
      orderMode = saved.orderMode === "bible" ? "bible" : "entered";
      await loadFromText(saved.refs.join("\n"));
    }
  } catch (_) {
    /* ignore malformed storage */
  }
}

init();
