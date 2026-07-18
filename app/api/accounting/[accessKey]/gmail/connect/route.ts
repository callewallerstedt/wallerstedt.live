import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/accounting/auth";
import {
  GMAIL_STATE_COOKIE,
  buildGmailAuthUrl,
  gmailConfigured,
} from "@/lib/accounting/gmail";
import { accountingErrorResponse } from "@/lib/accounting/http";
import { AccountingError } from "@/lib/accounting/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    if (!gmailConfigured()) {
      throw new AccountingError(
        "Gmail is not configured on the server yet.",
        503,
        "gmail_not_configured",
      );
    }
    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/accounting/${encodeURIComponent(accessKey)}/gmail/callback`;
    const state = randomBytes(16).toString("hex");
    const response = NextResponse.redirect(buildGmailAuthUrl(redirectUri, state));
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(GMAIL_STATE_COOKIE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
      path: `/api/accounting/${encodeURIComponent(accessKey)}/gmail`,
    });
    return response;
  } catch (error) {
    return accountingErrorResponse(error);
  }
}
