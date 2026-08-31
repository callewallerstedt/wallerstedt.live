import { NextResponse } from "next/server";

import { getVapidPublicKey, isWebPushConfigured } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isWebPushConfigured()) {
    return NextResponse.json({ configured: false, publicKey: "" }, { status: 200 });
  }

  return NextResponse.json({
    configured: true,
    publicKey: getVapidPublicKey(),
  });
}
