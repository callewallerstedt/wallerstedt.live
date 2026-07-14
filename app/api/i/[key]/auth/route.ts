import { randomBytes } from "crypto";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import {
  TESLA_AUTH_URL,
  TESLA_SCOPES,
  assertConnectKey,
  teslaConfig,
  teslaConfigured,
} from "@/lib/tesla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ key: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { key } = await params;
  assertConnectKey(key);
  if (!teslaConfigured()) notFound();

  const { clientId, redirectUri } = teslaConfig();
  const state = randomBytes(16).toString("hex");
  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: TESLA_SCOPES,
    state,
    locale: "en-US",
    prompt: "login",
    prompt_missing_scopes: "true",
    show_keypair_step: "true",
  });

  const response = NextResponse.redirect(`${TESLA_AUTH_URL}?${authParams.toString()}`);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set("tesla_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
