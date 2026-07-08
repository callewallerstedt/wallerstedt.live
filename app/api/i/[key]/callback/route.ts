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
  <title>Tesla connected</title>
  <style>
    body { font-family: system-ui, sans-serif; background:#0b0b0b; color:#f2f2f2; padding:24px; max-width:640px; margin:0 auto; }
    h1 { font-size:1.25rem; font-weight:600; margin:0 0 8px; }
    p { color:#aaa; line-height:1.5; margin:0 0 16px; }
    textarea { width:100%; min-height:120px; background:#171717; color:#fff; border:1px solid #333; padding:12px; font-size:14px; box-sizing:border-box; }
    .row { display:flex; gap:10px; flex-wrap:wrap; margin-top:12px; }
    button { padding:12px 16px; background:#fff; color:#000; border:0; cursor:pointer; font-size:15px; border-radius:6px; }
    button.secondary { background:#242424; color:#fff; }
    #status { margin-top:12px; color:#7dd3fc; min-height:1.2em; }
  </style>
</head>
<body>
  <h1>Tesla connected</h1>
  <p>Your refresh token is below. It is copied to your clipboard automatically when possible. Tap <strong>Open aiOS</strong> when you are ready — nothing redirects until you choose.</p>
  <textarea id="token" readonly>${safeRefresh}</textarea>
  <div class="row">
    <button type="button" id="copy">Copy token</button>
    <button type="button" id="open" class="secondary">Open aiOS</button>
  </div>
  <div id="status"></div>
  <script>
    var tokenEl = document.getElementById("token");
    var statusEl = document.getElementById("status");
    function setStatus(msg) { statusEl.textContent = msg; }
    function copyToken() {
      tokenEl.focus();
      tokenEl.select();
      tokenEl.setSelectionRange(0, tokenEl.value.length);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(tokenEl.value).then(function() {
          setStatus("Copied to clipboard.");
        }).catch(function() {
          setStatus("Select the token above and copy manually.");
        });
      }
      setStatus("Select the token above and copy manually.");
      return Promise.resolve();
    }
    document.getElementById("copy").addEventListener("click", copyToken);
    document.getElementById("open").addEventListener("click", function() {
      window.location.href = ${JSON.stringify(deepLink)};
    });
    copyToken();
  </script>
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
