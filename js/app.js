// js/app.js
// UI orchestration for VerseList: parses pasted references (js/verse-list.js),
// renders verse cards, toggles "As Entered" vs "Bible Order", drag-to-reorder
// in As Entered mode, and keeps the current list/order shareable via the URL
// hash (#refs=...) and restorable via localStorage.
import { parseReferenceList, sortByBibleOrder, serializeEntries } from "./verse-list.js";
import { isProfane } from "./profanity-filter.js";

const STORAGE_KEY = "vlLastList";
const PERUSER_BASE = "https://bible-peruser.gospelgo.org/";

const els = {
  inputSection: document.getElementById("vl-input-section"),
  inputBox: document.getElementById("vl-input-box"),
  loadBtn: document.getElementById("vl-load-btn"),
  revertBtn: document.getElementById("vl-revert-btn"),
  sync: document.getElementById("vl-sync"),
  undo: document.getElementById("vl-undo"),
  undoText: document.getElementById("vl-undo-text"),
  undoBtn: document.getElementById("vl-undo-btn"),
  bibleHint: document.getElementById("vl-bible-hint"),
  errors: document.getElementById("vl-errors"),
  errorsList: document.getElementById("vl-errors-list"),
  errorsClose: document.getElementById("vl-errors-close"),
  listSection: document.getElementById("vl-list-section"),
  listTitle: document.getElementById("vl-list-title"),
  orderEnteredBtn: document.getElementById("vl-order-entered"),
  orderBibleBtn: document.getElementById("vl-order-bible"),
  copyAllBtn: document.getElementById("vl-copy-all-btn"),
  copyLinkBtn: document.getElementById("vl-copy-link-btn"),
  copyListBtn: document.getElementById("vl-copy-list-btn"),
  copyArrayBtn: document.getElementById("vl-copy-array-btn"),
  clearBtn: document.getElementById("vl-clear-btn"),
  loading: document.getElementById("vl-loading"),
  dragHint: document.getElementById("vl-drag-hint"),
  cards: document.getElementById("vl-cards"),
  empty: document.getElementById("vl-empty"),
  reopenBtn: document.getElementById("vl-reopen-btn"),
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

// --- The box mirrors the cards -------------------------------------------
// There is one list. The cards are its view; the box is the same list as
// text, always in As Entered order. Editing via the cards (drag, remove,
// undo) rewrites the box; editing the box and pressing Update List rebuilds
// the cards. syncedText is the list as last written to / read from the box,
// so "box differs from syncedText" means the user has typed something the
// cards don't show yet — in that state card edits leave the box alone
// rather than overwrite work in progress, and the status line says so.
let syncedText = "";

function listText() {
  return enteredOrder.map((e) => e.raw).join("\n");
}

function isBoxDirty() {
  return els.inputBox.value.trim() !== syncedText;
}

// Call after any card-side change to the list.
function mirrorBox() {
  if (!isBoxDirty()) {
    syncedText = listText();
    els.inputBox.value = syncedText;
  }
  refreshBoxState();
}

function refreshBoxState() {
  const hasList = enteredOrder.length > 0;
  const dirty = isBoxDirty();
  const boxEmpty = !els.inputBox.value.trim();

  // Lit only when pressing it would do something: there's text to look up
  // (Show Verses) or the box differs from the cards (Update List).
  els.loadBtn.textContent = hasList ? "Update List" : "Show Verses";
  els.loadBtn.disabled = isLoading || (hasList ? !dirty : boxEmpty);
  els.loadBtn.title = !hasList
    ? boxEmpty
      ? "Nothing to show yet — type or paste references in the box first."
      : "Look up the references in the box and show their verses"
    : dirty
      ? "Rebuilds the cards from the box: new lines are added, deleted lines are removed, and the order follows the box"
      : "Nothing to update — the box and the cards already match. Edit the box first.";

  els.revertBtn.hidden = !(hasList && dirty);
  els.sync.hidden = !hasList;
  els.sync.classList.toggle("is-dirty", dirty);
  els.sync.textContent = dirty
    ? "The box has changes the cards don't show yet — press Update List to apply them."
    : orderMode === "bible"
      ? "The box and the cards match. (The box keeps your As Entered order; the cards are showing Bible Order.)"
      : "The box and the cards match.";
}

function showErrors(errors) {
  els.errorsList.innerHTML = "";
  if (!errors.length) {
    els.errors.hidden = true;
    return;
  }
  errors.forEach((e) => {
    const li = document.createElement("li");
    li.textContent = e.reason;
    els.errorsList.appendChild(li);
  });
  els.errors.hidden = false;
}

els.errorsClose.addEventListener("click", () => showErrors([]));

function currentEntries() {
  return orderMode === "bible" ? sortByBibleOrder(enteredOrder) : enteredOrder;
}

// Deep-links to Bible Peruser's ?book=&chapter=&verse= reader (see that
// project's js/bible-loader.js parseChapterDeepLink/parseDeepLinkVerseParam).
// verse= only ever targets a single chapter there, so it's only added when
// the reference doesn't span chapters; entry.label lacking ":" means a
// chapter/book-only reference (verse1/verse2 get normalized to non-null
// placeholder values for sorting even then — see verse-list.js — so the
// label is the reliable signal here, not the numeric fields).
function buildPeruserUrl(entry) {
  const params = new URLSearchParams();
  params.set("book", entry.bookId);
  params.set("chapter", entry.chapter1);
  if (entry.label.includes(":") && entry.chapter1 === entry.chapter2) {
    params.set("verse", entry.verse2 !== entry.verse1 ? `${entry.verse1}-${entry.verse2}` : `${entry.verse1}`);
  } else if (entry.label.includes(":")) {
    params.set("verse", `${entry.verse1}`);
  }
  return `${PERUSER_BASE}?${params.toString()}`;
}

function formatEntryVerses(entry) {
  let lastChapter = null;
  return entry.verses
    .map((v) => {
      const marker = v.chapter !== lastChapter ? `${v.chapter}:${v.n}` : v.n;
      lastChapter = v.chapter;
      return `${marker} ${v.text}`;
    })
    .join(" ");
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
      handle.title = "Drag to move this reference up or down the list";
      handle.innerHTML = "&#9776;";
      header.appendChild(handle);
    }

    const title = document.createElement("h2");
    title.className = "vl-card__title";
    const titleLink = document.createElement("a");
    titleLink.className = "vl-card__title-link";
    titleLink.href = buildPeruserUrl(entry);
    titleLink.target = "_blank";
    titleLink.rel = "noopener noreferrer";
    titleLink.textContent = entry.label;
    title.appendChild(titleLink);
    header.appendChild(title);

    // "×" is U+00D7 (Latin-1), present in every text font — unlike the
    // dingbat crosses, which can render empty.
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "vl-card__remove";
    removeBtn.textContent = "×";
    removeBtn.title = `Remove ${entry.label} from the list (you can undo)`;
    removeBtn.setAttribute("aria-label", `Remove ${entry.label} from list`);
    header.appendChild(removeBtn);

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
  els.bibleHint.hidden = orderMode !== "bible" || entries.length < 2;
  updateTooltips();
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

// pushHistory: true adds a new back/forward entry (a genuinely new list —
// "Show Verses" or Clear); false (default) replaces the current entry in
// place (order-mode toggle, drag-reorder, or restoring from the hash on
// load/popstate) so those don't clutter back/forward with every minor tweak.
function persist({ pushHistory = false } = {}) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ refs: enteredOrder.map((e) => e.raw), orderMode, title: currentTitle }),
    );
  } catch (_) {
    /* storage unavailable — sharing/reload restore just won't persist */
  }
  syncHash(pushHistory);
}

function syncHash(pushHistory) {
  const params = new URLSearchParams();
  params.set("refs", serializeEntries(enteredOrder));
  if (orderMode === "bible") params.set("order", "bible");
  if (currentTitle) params.set("title", currentTitle);
  const hash = `#${params.toString()}`;
  if (pushHistory) {
    history.pushState(null, "", hash);
  } else {
    history.replaceState(null, "", hash);
  }
}

// Fetching each referenced book's JSON (verse-list.js) can take a second or
// more on a cold cache or a long list spanning many books — without this the
// app just sits there after "Show Verses" with no feedback, looking hung.
let isLoading = false;
function setLoading(loading) {
  isLoading = loading;
  els.loading.hidden = !loading;
  refreshBoxState();
}

// Clear All only makes sense once there's a list to clear — it lives next
// to the main button, not in the list's own toolbar, so its visibility has
// to be driven explicitly rather than inherited from vl-list-section's
// hidden state.
function setListVisible(visible) {
  els.listSection.hidden = !visible;
  els.empty.hidden = visible;
  els.clearBtn.hidden = !visible;
  updateReopenBtn();
  updateTooltips();
}

// The last list saved by any tab in this browser, or null. A bare URL starts
// empty (so a new tab is a clean slate for a second list) and offers this
// back via "Reopen last list" rather than loading it automatically.
function readStoredList() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && Array.isArray(saved.refs) && saved.refs.length) return saved;
  } catch (_) {
    /* storage unavailable or malformed — nothing to reopen */
  }
  return null;
}

function updateReopenBtn() {
  els.reopenBtn.hidden = !els.listSection.hidden || !readStoredList();
}

// --- Remove a card (with Undo) ------------------------------------------
// No confirm dialog: removing is one tap, so the safety net is a short-lived
// Undo bar instead. Only the most recent removal is undoable, and any
// wholesale list change (new list, Clear, Back/Forward) drops it.
let lastRemoved = null; // { entry, index } — index is into enteredOrder
let undoTimer = 0;

function hideUndo() {
  clearTimeout(undoTimer);
  lastRemoved = null;
  els.undo.hidden = true;
}

function clearStoredList() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    /* storage unavailable */
  }
  updateReopenBtn();
}

function removeEntry(id) {
  const index = enteredOrder.findIndex((e) => e.id === id);
  if (index === -1) return;
  const [entry] = enteredOrder.splice(index, 1);

  clearTimeout(undoTimer);
  lastRemoved = { entry, index };
  els.undoText.textContent = `Removed ${entry.label}.`;
  els.undo.hidden = false;
  undoTimer = setTimeout(hideUndo, 8000);

  mirrorBox();
  if (enteredOrder.length) {
    renderCards();
    persist();
    return;
  }
  // Removed the last card — same end state as Clear All, minus the confirm
  // (Undo covers it) and minus a history entry.
  setListVisible(false);
  clearStoredList();
  history.replaceState(null, "", location.pathname + location.search);
}

els.cards.addEventListener("click", (e) => {
  const btn = e.target.closest(".vl-card__remove");
  if (!btn) return;
  removeEntry(btn.closest(".vl-card").dataset.id);
});

els.undoBtn.addEventListener("click", () => {
  if (!lastRemoved) return;
  const { entry, index } = lastRemoved;
  hideUndo();
  enteredOrder.splice(Math.min(index, enteredOrder.length), 0, entry);
  setListVisible(true);
  renderCards();
  updateOrderButtons();
  persist();
  mirrorBox();
});

// Rebuilds the list from text. fromBox: the text is what the user typed in
// the box (Show Verses / Update List); otherwise it came from a link or
// localStorage, and `title` carries that source's title.
//
// Titles: the box never sets one. An update from the box keeps the current
// title only if at least one reference survives into the new list — that's
// an edit of the titled list; a wholesale paste of an unrelated list
// shouldn't keep showing the old one's name.
async function loadFromText(rawText, { title: explicitTitle, fromBox = false, pushHistory = false } = {}) {
  setLoading(true);
  try {
    const { entries, errors } = await parseReferenceList(rawText);

    // Nothing in the box resolved, but there's a list on screen: keep it
    // rather than blank the page over a typo. The box stays as typed (and
    // so reads as "has changes") for the user to fix.
    if (!entries.length && fromBox && enteredOrder.length) {
      showErrors(errors);
      return;
    }

    hideUndo();
    const previousKeys = new Set(enteredOrder.map((e) => e.dedupeKey));
    let title = fromBox
      ? entries.some((e) => previousKeys.has(e.dedupeKey))
        ? currentTitle
        : null
      : explicitTitle || null;
    if (title && isProfane(title)) {
      errors.push({ token: title, reason: "That title wasn't used — please keep it appropriate." });
      title = null;
    }
    currentTitle = title;
    showErrors(errors);
    renderTitle();

    enteredOrder = entries;
    syncedText = listText();
    // Normalize the box to the list — unless something the user typed
    // failed, in which case leave their text alone so the bad line can be
    // fixed in place. (Duplicates aren't worth keeping; they just drop.)
    if (!fromBox || !errors.some((e) => !e.duplicate)) {
      els.inputBox.value = syncedText;
    }

    if (!entries.length) {
      setListVisible(false);
      return;
    }
    setListVisible(true);
    renderCards();
    if (fromBox && previousKeys.size) {
      const newIds = new Set(entries.filter((e) => !previousKeys.has(e.dedupeKey)).map((e) => e.id));
      Array.from(els.cards.children).forEach((c) => c.classList.toggle("is-new", newIds.has(c.dataset.id)));
    }
    updateOrderButtons();
    persist({ pushHistory });
  } finally {
    setLoading(false);
  }
}

function handleShowVerses() {
  if (isLoading) return;
  const text = els.inputBox.value;
  if (enteredOrder.length) {
    if (!isBoxDirty()) return;
    // Emptying the box and updating means "no list" — same as Clear All.
    if (!text.trim()) {
      clearAll();
      return;
    }
  }
  loadFromText(text, { fromBox: true, pushHistory: true });
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

els.inputBox.addEventListener("input", refreshBoxState);

// Throw away unapplied typing and put the box back to what the cards show.
els.revertBtn.addEventListener("click", () => {
  syncedText = listText();
  els.inputBox.value = syncedText;
  showErrors([]);
  refreshBoxState();
});

// Shared by the Clear button and by popstate landing on a hash with no
// `refs` (back past the first list ever shown, or forward past a Clear).
function resetToEmpty() {
  hideUndo();
  enteredOrder = [];
  orderMode = "entered";
  currentTitle = null;
  syncedText = "";
  els.inputBox.value = "";
  showErrors([]);
  renderTitle();
  updateOrderButtons();
  setListVisible(false);
}

function clearAll() {
  if (!enteredOrder.length) return;
  if (!window.confirm("Clear all verses in this list?")) return;

  resetToEmpty();
  clearStoredList();
  // Pushed (not replaced) so Back restores the list that was just cleared.
  history.pushState(null, "", location.pathname + location.search);
  els.inputBox.focus();
}

els.clearBtn.addEventListener("click", clearAll);

// The title is a real link to the bare URL, so middle-click / Ctrl-click
// opens a fresh, empty VerseList in a new tab. A plain click is "home":
// put this tab's list away and start a new one. Unlike Clear All there's
// no confirm and the saved list is kept, because nothing is lost — Back
// restores the list and Reopen Last List offers it again.
document.getElementById("vl-home-link").addEventListener("click", (e) => {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  if (isLoading) return;
  if (enteredOrder.length) {
    resetToEmpty();
    history.pushState(null, "", location.pathname + location.search);
  }
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

async function copyWithFeedback(button, text) {
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => {
      button.textContent = original;
    }, 1500);
  } catch (_) {
    window.prompt("Copy this text:", text);
  }
}

// One builder per copy button, used by both the click handler and the
// button's tooltip, so the tooltip can never describe something other than
// what actually lands on the clipboard.
const copyBuilders = {
  all: () =>
    currentEntries()
      .map((entry) => `${entry.label}\n${formatEntryVerses(entry)}`)
      .join("\n\n"),
  link: () => `${location.origin}${location.pathname}${location.hash}`,
  list: () =>
    currentEntries()
      .map((entry) => `"${entry.label}"`)
      .join(", "),
  array: () =>
    `[${currentEntries()
      .map((entry) => JSON.stringify(entry.label))
      .join(", ")}]`,
};

els.copyAllBtn.addEventListener("click", () => copyWithFeedback(els.copyAllBtn, copyBuilders.all()));
els.copyLinkBtn.addEventListener("click", () => copyWithFeedback(els.copyLinkBtn, copyBuilders.link()));
els.copyListBtn.addEventListener("click", () => copyWithFeedback(els.copyListBtn, copyBuilders.list()));
els.copyArrayBtn.addEventListener("click", () => copyWithFeedback(els.copyArrayBtn, copyBuilders.array()));

const TOOLTIP_PREVIEW_CHARS = 260;
function preview(text) {
  return text.length > TOOLTIP_PREVIEW_CHARS ? `${text.slice(0, TOOLTIP_PREVIEW_CHARS).trimEnd()}…` : text;
}

// Called after anything that changes the list, its order, or the order view
// (renderCards, and drag-end, which reorders the DOM without re-rendering).
function updateTooltips() {
  const count = enteredOrder.length;
  const hasList = count > 0;
  const refs = `${count} reference${count === 1 ? "" : "s"}`;
  const order = "in the order shown";

  refreshBoxState();
  els.orderEnteredBtn.title = "Show the list in your own order — the same order as the box";
  els.orderBibleBtn.title = "Show the list sorted Genesis to Revelation. Your own order is kept for when you switch back";

  if (!hasList) return;
  els.copyAllBtn.title = `Copies ${refs} with their verse text, ${order}:\n\n${preview(copyBuilders.all())}`;
  els.copyListBtn.title = `Copies ${refs} as a quoted, comma-separated list, ${order}:\n\n${preview(copyBuilders.list())}`;
  els.copyArrayBtn.title = `Copies ${refs} as a JSON string array, ${order}:\n\n${preview(copyBuilders.array())}`;
  els.copyLinkBtn.title = `Copies a link that reopens these ${refs} ${order}:\n\n${preview(copyBuilders.link())}`;
}

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
    mirrorBox();
    updateTooltips();
  }

  els.cards.addEventListener("pointerdown", onPointerDown);
})();

// --- About dialog -------------------------------------------------------
// Native <dialog>: showModal() gives Escape-to-close, focus trapping and
// the backdrop for free. Backdrop clicks are reported with the dialog as
// their target, the same as clicks on the dialog's own padding, so tell
// them apart by position.
(function attachAbout() {
  const dialog = document.getElementById("vl-about");
  document.querySelectorAll("[data-about-open]").forEach((opener) => {
    opener.addEventListener("click", () => dialog.showModal());
  });
  document.getElementById("vl-about-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });

  // Install as an app (window.vlInstall, js/install.js). The button shows
  // only while the browser says installing is possible right now — never a
  // dead button.
  const install = window.vlInstall;
  if (!install) return;
  const installBtn = document.getElementById("vl-install-btn");
  const syncInstallBtn = () => {
    installBtn.hidden = !install.canPrompt();
  };
  installBtn.addEventListener("click", () => install.prompt());
  document.addEventListener("vl-install-change", syncInstallBtn);
  syncInstallBtn();

  // Browsers that can't prompt get one line instead. Not shown in Chromium:
  // there a missing button almost always means it's already installed.
  // iOS (every browser there is WebKit; iPadOS reports itself as a Mac) has
  // no install prompt at all, only the manual Share-sheet route.
  if (install.isStandalone()) return;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isChromium = !!navigator.userAgentData || /Chrome\//.test(ua);
  const note = document.getElementById("vl-install-note");
  if (isIOS) {
    note.textContent = "To install VerseList as an app: Share → Add to Home Screen.";
  } else if (!isChromium) {
    note.textContent = "VerseList can be installed as an app from Chrome or Edge.";
  } else {
    return;
  }
  note.hidden = false;
})();

// --- Restore from the URL hash (shared by initial load and popstate) ---
// Returns true if the hash had a list to restore, false if there was
// nothing there (caller shows the empty state).
async function tryLoadFromHash() {
  if (location.hash.length <= 1) return false;
  const params = new URLSearchParams(location.hash.slice(1));
  const refs = params.get("refs");
  if (!refs) return false;
  orderMode = params.get("order") === "bible" ? "bible" : "entered";
  // pushHistory stays false: we're syncing state to a URL that's already
  // there (on load) or that the browser just navigated to (on popstate),
  // not creating a new back/forward step.
  await loadFromText(refs, { title: params.get("title") || undefined });
  return true;
}

// --- Restore on load: only from the URL hash ----------------------------
// With no hash the page starts empty; the last saved list is one click away
// via "Reopen last list" (see readStoredList).
async function init() {
  if (await tryLoadFromHash()) return;
  updateReopenBtn();
  refreshBoxState();
}

els.reopenBtn.addEventListener("click", () => {
  if (isLoading) return;
  const saved = readStoredList();
  if (!saved) {
    updateReopenBtn();
    return;
  }
  orderMode = saved.orderMode === "bible" ? "bible" : "entered";
  // Pushed so Back returns to the empty page.
  loadFromText(saved.refs.join("\n"), { title: saved.title || undefined, pushHistory: true });
});

// Another tab saved or cleared its list while this one sits empty.
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY || e.key === null) updateReopenBtn();
});

// Show Verses and Clear push a history entry (see persist()/clearBtn above),
// so Back/Forward now actually have somewhere to go — restore whichever
// list's hash the browser just navigated to.
window.addEventListener("popstate", async () => {
  if (await tryLoadFromHash()) return;
  resetToEmpty();
});

init();
