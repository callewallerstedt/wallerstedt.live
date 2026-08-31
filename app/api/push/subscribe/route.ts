import { NextResponse } from "next/server";

import { isWebPushConfigured, parsePushSubscription, savePushSubscription, deletePushSubscription } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  if (!isWebPushConfigured()) {
    return jsonError("Notifications are not configured.", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid subscription.", 400);
  }

  const subscription = parsePushSubscription(body);
  if (!subscription) {
    return jsonError("Invalid subscription.", 400);
  }

  await savePushSubscription(subscription);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!isWebPushConfigured()) {
    return jsonError("Notifications are not configured.", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid subscription.", 400);
  }

  const endpoint =
    body && typeof body === "object" && "endpoint" in body && typeof body.endpoint === "string"
      ? body.endpoint.trim()
      : "";

  if (!endpoint) {
    return jsonError("Invalid subscription.", 400);
  }

  await deletePushSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
