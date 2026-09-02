// js/profanity-filter.js
// A basic decency check for user-entered list titles. NOT a security
// control — VerseList is a static, no-backend site: a title never gets
// stored server-side or listed publicly, and a shared link doesn't unfurl
// its title anywhere (no server-rendered previews). This only catches the
// casual/careless case and keeps an accidental bad word out of the browser
// tab and the page heading; it can't stop someone determined to be
// unpleasant to a person they're already sharing a link with directly.
// Exact-word matches — checked against whole words only (see normalizeWords
// below), not raw substrings. A substring check would misfire on this app's
// own domain: "rape" is a substring of "grapes", and Scripture is full of
// vineyard/grape imagery.
const BLOCKED_WORDS = new Set([
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "cunt",
  "dick",
  "piss",
  "slut",
  "whore",
  "faggot",
  "nigger",
  "nigga",
  "retard",
  "rape",
  "molest",
  "idiot",
  "moron",
  "loser",
  "worthless",
  "pathetic",
  "stupid",
  "ugly",
  "scum",
  "trash",
  "dumbass",
  "kys",
]);

// Directed-abuse phrases — deliberately not single ambiguous words like
// "hate", "kill", or "die", which have real legitimate use as verse-list
// titles in this app's own domain ("Love vs. Hate", "Kill Your Sin" per
// Romans 8:13, "Die to Self" per Luke 9:23). The combination is what makes
// intent unambiguous. Matched as a run-together substring (see
// normalizeWords/compact below), so spacing/punctuation don't matter.
const BLOCKED_PHRASES = [
  "killyourself",
  "gokillyourself",
  "ihateyou",
  "hopeyoudie",
  "nobodylikesyou",
  "noonelikesyou",
  "everyonehatesyou",
  "yourenothing",
  "youarenothing",
];

function normalizeWords(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/1|!/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5|\$/g, "s")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function isProfane(text) {
  const words = normalizeWords(text);
  if (!words.length) return false;
  if (words.some((w) => BLOCKED_WORDS.has(w))) return true;
  const compact = words.join("");
  return BLOCKED_PHRASES.some((phrase) => compact.includes(phrase));
}
