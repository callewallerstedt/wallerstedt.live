import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { assertConnectKey, exchangeTeslaCode } from "@/lib/tesla";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ key: string }> };

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET(request: NextRequest, { params }: Params) {
  const { key } = await params;
  assertConnectKey(key);

  const url = request.nextUrl;
  const error = url.searchParams.get("error");
  if (error) notFound();

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = request.cookies.get("tesla_oauth_state")?.value;
  if (!code || !state || !savedState || state !== savedState) notFound();

  try {
    const tokens = await exchangeTeslaCode(code);
    const refresh = tokens.refresh_token ?? "";
    if (!refresh) notFound();
    const safeRefresh = escapeHtml(refresh);
    const deepLink = `aios://tesla/callback?refresh_token=${encodeURIComponent(refresh)}`;

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Done</title>
  <style>
    body { font-family: system-ui, sans-serif; background:#0b0b0b; color:#f2f2f2; padding:24px; }
    textarea { width:100%; min-height:120px; background:#171717; color:#fff; border:1px solid #333; padding:12px; }
    button { margin-top:12px; padding:10px 14px; background:#fff; color:#000; border:0; cursor:pointer; }
  </style>
</head>
<body>
  <textarea readonly>${safeRefresh}</textarea>
  <button type="button" onclick="navigator.clipboard.writeText(document.querySelector('textarea').value)">Copy</button>
  <script>setTimeout(function(){ window.location.href = ${JSON.stringify(deepLink)}; }, 500);</script>
</body>
</html>`;

    const response = new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
    response.cookies.delete("tesla_oauth_state");
    return response;
  } catch {
    notFound();
  }
}
