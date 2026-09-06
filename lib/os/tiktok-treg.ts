import { AccountingError } from "@/lib/accounting/errors";
import {
  TIKTOK_SEARCH_DEFAULT_LIMIT,
  TIKTOK_SEARCH_MAX_LIMIT,
} from "./tiktok-search";

const TREG_CALL = "https://treg.to/call";
const TREG_TIMEOUT_MS = 25_000;

function tregToken() {
  const token = process.env.TREG_TOKEN?.trim() ?? "";
  if (!token) {
    throw new AccountingError(
      "TikTok search is not configured.",
      503,
      "treg_not_configured",
    );
  }
  return token;
}

function tregFailure(status: number) {
  if (status === 401 || status === 403) {
    return new AccountingError("TikTok search is not authorized.", 502, "treg_unauthorized");
  }
  if (status === 402) {
    return new AccountingError(
      "TikTok search is out of credit. Top up Treg and try again.",
      502,
      "treg_out_of_credit",
    );
  }
  if (status === 429) {
    return new AccountingError(
      "TikTok search is rate-limited. Try again in a moment.",
      429,
      "treg_rate_limited",
    );
  }
  if (status >= 500) {
    return new AccountingError(
      "TikTok search is temporarily unavailable.",
      502,
      "treg_unavailable",
    );
  }
  return new AccountingError("TikTok search failed. Try again.", 502, "treg_failed");
}

export async function callTreg(endpoint: string, body: Record<string, unknown>) {
  const token = tregToken();
  let response: Response;
  try {
    response = await fetch(`${TREG_CALL}/${endpoint}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Treg-Token": token,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TREG_TIMEOUT_MS),
    });
  } catch {
    throw new AccountingError("TikTok search timed out. Try again.", 504, "treg_unreachable");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) throw tregFailure(response.status);
  return payload;
}

export async function fetchTregTikTokSearch(q: string, limit = TIKTOK_SEARCH_DEFAULT_LIMIT) {
  const capped = Math.min(Math.max(1, Math.round(limit)), TIKTOK_SEARCH_MAX_LIMIT);
  return callTreg("treg.tiktok.search.videos", { q, limit: capped });
}

export async function fetchTregTikTokProfile(username: string) {
  return callTreg("treg.tiktok.user.profile", { username });
}

export async function fetchTregTikTokUserVideos(secUid: string, limit = 20) {
  const capped = Math.min(Math.max(1, Math.round(limit)), TIKTOK_SEARCH_MAX_LIMIT);
  return callTreg("treg.tiktok.user.videos", { sec_uid: secUid, limit: capped });
}
