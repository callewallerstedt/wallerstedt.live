export function vaultPath(accessKey: string, query = "") {
  return `/vault/${encodeURIComponent(accessKey)}${query}`;
}

export function osPath(accessKey: string, page: string = "") {
  const suffix = page ? `/${page}` : "";
  return `/bolag/${encodeURIComponent(accessKey)}${suffix}`;
}
