import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";
import {
  GMAIL_STATE_COOKIE,
  exchangeGmailCode,
  fetchGmailProfileEmail,
  upsertGmailAccount,
} from "@/lib/accounting/gmail";
import { accountingErrorResponse } from "@/lib/accounting/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

function statesMatch(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest, { params }: Params) {
  const { accessKey } = await params;
  const vaultUrl = `/vault/${encodeURIComponent(accessKey)}`;
  try {
    await requireOwnerSession(request, accessKey);
    const url = request.nextUrl;
    const oauthError = url.searchParams.get("error");
    if (oauthError) {
      const response = NextResponse.redirect(
        new URL(`${vaultUrl}?gmail=denied`, url.origin),
      );
      response.cookies.delete(GMAIL_STATE_COOKIE);
      return response;
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const savedState = request.cookies.get(GMAIL_STATE_COOKIE)?.value;
    if (!code || !state || !savedState || !statesMatch(state, savedState)) {
      throw new AccountingError(
        "The Gmail connection attempt is invalid or has expired. Start again from Settings.",
        400,
        "gmail_state_mismatch",
      );
    }
    const redirectUri = `${url.origin}/api/accounting/${encodeURIComponent(accessKey)}/gmail/callback`;
    const tokens = await exchangeGmailCode(code, redirectUri);
    const email = await fetchGmailProfileEmail(tokens.accessToken);
    await upsertGmailAccount(email, tokens.refreshToken, tokens.scope);
    const response = NextResponse.redirect(
      new URL(`${vaultUrl}?gmail=connected&email=${encodeURIComponent(email)}`, url.origin),
    );
    response.cookies.delete(GMAIL_STATE_COOKIE);
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
