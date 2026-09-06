/** Split plain notes into text and safe http(s) links for the task UI. */

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCT_RE = /[),.!?;:'"]+$/;

export function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function trimUrl(raw: string) {
  const trimmed = raw.replace(TRAILING_PUNCT_RE, "");
  return trimmed || raw;
}

export type LinkedTextPart =
  | { type: "text"; value: string }
  | { type: "link"; value: string };

export function splitLinkedText(text: string): LinkedTextPart[] {
  if (!text) return [];
  const parts: LinkedTextPart[] = [];
  let cursor = 0;
  const matches = text.matchAll(URL_RE);
  for (const match of matches) {
    const raw = match[0] ?? "";
    const index = match.index ?? 0;
    if (index < cursor) continue;
    if (index > cursor) parts.push({ type: "text", value: text.slice(cursor, index) });
    const href = trimUrl(raw);
    const leftover = raw.slice(href.length);
    if (isSafeHttpUrl(href)) {
      parts.push({ type: "link", value: href });
      if (leftover) parts.push({ type: "text", value: leftover });
    } else {
      parts.push({ type: "text", value: raw });
    }
    cursor = index + raw.length;
  }
  if (cursor < text.length) parts.push({ type: "text", value: text.slice(cursor) });
  return parts;
}
