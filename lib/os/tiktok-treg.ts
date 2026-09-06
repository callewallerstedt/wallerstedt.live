import { AccountingError } from "@/lib/accounting/errors";
import {
  TIKTOK_SEARCH_DEFAULT_LIMIT,
  TIKTOK_SEARCH_MAX_LIMIT,
} from "./tiktok-search";

const TREG_TIKTOK_SEARCH_URL = "https://treg.to/call/treg.tiktok.search.videos";
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

export async function fetchTregTikTokSearch(q: string, limit = TIKTOK_SEARCH_DEFAULT_LIMIT) {
  const token = tregToken();
  const capped = Math.min(Math.max(1, Math.round(limit)), TIKTOK_SEARCH_MAX_LIMIT);

  let response: Response;
  try {
    response = await fetch(TREG_TIKTOK_SEARCH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Treg-Token": token,
      },
      body: JSON.stringify({ q, limit: capped }),
      cache: "no-store",
      signal: AbortSignal.timeout(TREG_TIMEOUT_MS),
    });
  } catch {
    throw new AccountingError("TikTok search timed out. Try again.", 504, "treg_unreachable");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) throw tregFailure(response.status);
  return body;
}
