// js/profanity-filter.js
// A basic decency check for user-entered list titles. NOT a security
// control — VerseList is a static, no-backend site: a title never gets
// stored server-side or listed publicly, and a shared link doesn't unfurl
// its title anywhere (no server-rendered previews). This only catches the
// casual/careless case and keeps an accidental bad word out of the browser
// tab and the page heading; it can't stop someone determined to be
// unpleasant to a person they're already sharing a link with directly.
const BLOCKED = [
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
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/1|!/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5|\$/g, "s")
    .replace(/[^a-z]/g, "");
}

export function isProfane(text) {
  const normalized = normalize(text);
  if (!normalized) return false;
  return BLOCKED.some((word) => normalized.includes(word));
}
