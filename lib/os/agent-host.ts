const PASSTHROUGH_PREFIXES = ["/agent/", "/api/", "/bolag/"];

/**
 * Path rewrites for ACCOUNTING_AGENT_HOST (default agent.wallerstedt.live).
 * Returns the internal destination, or null to leave the request unchanged.
 */
export function agentHostRewritePath(pathname: string): string | null {
  if (PASSTHROUGH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  const vaultMatch = /^\/vault\/([^/]+)\/?$/.exec(pathname);
  if (vaultMatch?.[1]) return `/agent/${vaultMatch[1]}`;

  const liveAlias = /^\/live\/([^/]+)\/?$/.exec(pathname);
  if (liveAlias?.[1]) return `/bolag/${liveAlias[1]}/live`;

  const liveDirect = /^\/([^/]+)\/live\/?$/.exec(pathname);
  if (liveDirect?.[1]) return `/bolag/${liveDirect[1]}/live`;

  const directMatch = /^\/([^/]+)\/?$/.exec(pathname);
  if (directMatch?.[1]) return `/agent/${directMatch[1]}`;

  return null;
}
