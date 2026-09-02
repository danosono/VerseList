// js/verse-list.js
// Parses a block of pasted Bible references, resolves book names against
// bible-utils.js's alias map (so "matt", "1 corinthians", "Song of Solomon",
// etc. all work — this app is meant to be usable by anyone typing a
// reference in whatever common format they know, not just links generated
// by a sibling gospelgo.org app), fetches the small per-book JSON files on
// demand, and returns the actual verse text for each reference.
import { bookNames, bookOrder, resolveBookAlias } from "./bible-utils.js";

// The separator between the book name and the chapter number is \s* (not
// \s+) so free-typed no-space forms work too — "eph1", "eph1:15", "1cor13:4"
// all parse the same as their spaced equivalents, since the lazy book-name
// group always stops at the earliest point where a chapter number can follow.
const REF_RE =
  /^([1-3]?\s?[A-Za-z][A-Za-z. ]*?)\s*(\d+):(\d+)(?:\s*[-–]\s*(?:(\d+):)?(\d+))?\s*(?:\([^()]*\))?$/;
const CHAPTER_ONLY_RE = /^([1-3]?\s?[A-Za-z][A-Za-z. ]*?)\s*(\d+)$/;
const MAX_TOTAL_VERSES = 3000;

const bookDataCache = new Map(); // bookId -> Promise<bookJson | null>

function fetchBookData(bookId) {
  if (!bookDataCache.has(bookId)) {
    bookDataCache.set(
      bookId,
      fetch(`data/books/${bookId}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return bookDataCache.get(bookId);
}

// Splits a pasted block into individual reference tokens. Accepts one
// reference per line, comma-separated on one line, or both — and strips
// wrapping quote marks so `"Matthew 5:11-12", "Luke 6:22-23"` works as-is.
export function splitReferenceTokens(rawText) {
  return String(rawText || "")
    .split(/[\n,;]/)
    .map((s) => s.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim())
    .filter(Boolean);
}

function getChapter(bookData, chapterNum) {
  return (bookData.chapters || []).find((c) => c.number === chapterNum) || null;
}

function versesInRange(bookData, chapter1, verse1, chapter2, verse2) {
  const out = [];
  for (let cn = chapter1; cn <= chapter2; cn++) {
    const chapter = getChapter(bookData, cn);
    if (!chapter) continue;
    const startV = cn === chapter1 ? verse1 : 1;
    const endV = cn === chapter2 ? verse2 : Infinity;
    (chapter.verses || []).forEach((v) => {
      const n = parseInt(v.n, 10);
      if (!isNaN(n) && n >= startV && n <= endV) {
        out.push({ chapter: cn, n: v.n, text: v.text });
      }
    });
  }
  return out;
}

function wholeChapterVerses(bookData, chapterNum) {
  const chapter = getChapter(bookData, chapterNum);
  if (!chapter) return [];
  return (chapter.verses || []).map((v) => ({ chapter: chapterNum, n: v.n, text: v.text }));
}

function buildLabel(bookName, chapter1, verse1, chapter2, verse2, isWholeBook) {
  if (isWholeBook) return bookName;
  if (verse1 == null) return `${bookName} ${chapter1}`;
  if (chapter2 != null && chapter2 !== chapter1) {
    return `${bookName} ${chapter1}:${verse1}-${chapter2}:${verse2}`;
  }
  if (verse2 != null && verse2 !== verse1) {
    return `${bookName} ${chapter1}:${verse1}-${verse2}`;
  }
  return `${bookName} ${chapter1}:${verse1}`;
}

let entryCounter = 0;
function nextEntryId() {
  entryCounter += 1;
  return `ref-${Date.now()}-${entryCounter}`;
}

// Parses one token into { bookId, chapter1, verse1, chapter2, verse2 } or null.
function parseToken(token) {
  const refMatch = token.match(REF_RE);
  if (refMatch) {
    const bookId = resolveBookAlias(refMatch[1]);
    if (!bookId) return { error: `Unrecognized book name in "${token}"` };
    const chapter1 = parseInt(refMatch[2], 10);
    const verse1 = parseInt(refMatch[3], 10);
    const chapter2 = refMatch[4] ? parseInt(refMatch[4], 10) : chapter1;
    const verse2 = refMatch[5] ? parseInt(refMatch[5], 10) : verse1;
    return { bookId, chapter1, verse1, chapter2, verse2 };
  }
  const chapterMatch = token.match(CHAPTER_ONLY_RE);
  if (chapterMatch) {
    const bookId = resolveBookAlias(chapterMatch[1]);
    if (!bookId) return { error: `Unrecognized book name in "${token}"` };
    const chapter1 = parseInt(chapterMatch[2], 10);
    return { bookId, chapter1, verse1: null, chapter2: chapter1, verse2: null };
  }
  // No chapter/verse at all — a bare book name means "the whole book"
  // ("Ephesians", "Genesis", "Psalms").
  const wholeBookId = resolveBookAlias(token);
  if (wholeBookId) {
    return { bookId: wholeBookId, isWholeBook: true };
  }
  return { error: `Couldn't understand "${token}" — try a format like "John 3:16", "Romans 8", or "Ephesians".` };
}

// Parses a full pasted block and resolves verse text for every valid
// reference. Bad tokens are reported in `errors` but never block the good
// ones from resolving — a typo in one line shouldn't hide the rest of the
// list.
export async function parseReferenceList(rawText) {
  const tokens = splitReferenceTokens(rawText);
  const entries = [];
  const errors = [];
  const seen = new Set();
  let totalVerses = 0;

  for (const token of tokens) {
    const parsed = parseToken(token);
    if (parsed.error) {
      errors.push({ token, reason: parsed.error });
      continue;
    }

    const { bookId, isWholeBook } = parsed;
    const bookData = await fetchBookData(bookId);
    if (!bookData) {
      errors.push({ token, reason: `Couldn't load data for ${bookNames[bookId] || bookId}.` });
      continue;
    }

    let { chapter1, verse1, chapter2, verse2 } = parsed;
    if (isWholeBook) {
      chapter1 = 1;
      chapter2 = bookData.chapterCount;
      verse1 = null;
      verse2 = null;
    }

    if (chapter1 < 1 || chapter1 > bookData.chapterCount) {
      errors.push({ token, reason: `${bookNames[bookId]} doesn't have chapter ${chapter1}.` });
      continue;
    }
    if (chapter2 < 1 || chapter2 > bookData.chapterCount) {
      errors.push({ token, reason: `${bookNames[bookId]} doesn't have chapter ${chapter2}.` });
      continue;
    }
    if (chapter2 < chapter1 || (chapter2 === chapter1 && verse2 != null && verse2 < verse1)) {
      errors.push({ token, reason: `"${token}" is a reversed range.` });
      continue;
    }

    const dedupeKey = `${bookId}|${chapter1}|${verse1}|${chapter2}|${verse2}`;
    if (seen.has(dedupeKey)) {
      errors.push({ token, reason: `"${token}" is already in your list — skipping the duplicate.` });
      continue;
    }

    const verses = isWholeBook
      ? versesInRange(bookData, 1, 1, bookData.chapterCount, Infinity)
      : verse1 == null
        ? wholeChapterVerses(bookData, chapter1)
        : versesInRange(bookData, chapter1, verse1, chapter2, verse2);

    if (!verses.length) {
      errors.push({ token, reason: `No verses found for "${token}" — check the chapter/verse numbers.` });
      continue;
    }

    if (totalVerses + verses.length > MAX_TOTAL_VERSES) {
      errors.push({
        token,
        reason: `"${token}" skipped — the list is already at the ${MAX_TOTAL_VERSES}-verse limit.`,
      });
      continue;
    }

    seen.add(dedupeKey);
    totalVerses += verses.length;

    entries.push({
      id: nextEntryId(),
      raw: token,
      bookId,
      bookName: bookNames[bookId] || bookId,
      bookOrderIndex: bookOrder.indexOf(bookId),
      chapter1,
      verse1: verse1 == null ? 1 : verse1,
      chapter2,
      verse2: verse2 == null ? chapter1 : verse2,
      label: buildLabel(bookNames[bookId] || bookId, chapter1, verse1, chapter2, verse2, isWholeBook),
      verses,
    });
  }

  return { entries, errors };
}

export function sortByBibleOrder(entries) {
  return [...entries].sort((a, b) => {
    if (a.bookOrderIndex !== b.bookOrderIndex) return a.bookOrderIndex - b.bookOrderIndex;
    if (a.chapter1 !== b.chapter1) return a.chapter1 - b.chapter1;
    return a.verse1 - b.verse1;
  });
}

// Compact serialization used for both the paste box and the shareable URL —
// one pipeline for both input paths.
export function serializeEntries(entries) {
  return entries.map((e) => e.raw).join(";");
}
