import type { OsPageSlug } from "./route";

export function vaultPath(accessKey: string, query = "") {
  return `/vault/${encodeURIComponent(accessKey)}${query}`;
}

export function osPath(accessKey: string, page: OsPageSlug | "" = "") {
  const suffix = page ? `/${page}` : "";
  return `/bolag/${encodeURIComponent(accessKey)}${suffix}`;
}

export function osLivePath(accessKey: string) {
  return `/bolag/${encodeURIComponent(accessKey)}/live`;
}

export function osLiveShortcutUrl(accessKey: string) {
  return `https://agent.wallerstedt.live/${encodeURIComponent(accessKey)}/live`;
}
