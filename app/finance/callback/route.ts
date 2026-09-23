import { configuredOsAccessKey } from "@/lib/os/route";
import { osPath } from "@/lib/os/paths";
import { completeBankConnection, psuFromRequest, syncFinance } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * The bank sends the browser back here after BankID. The owner cookie is
 * SameSite=Strict, so it is not sent on this cross-site hop: the single-use
 * `state` proves the flow was started from the signed-in dashboard instead.
 * The page then navigates on its own (a same-site navigation), which does
 * carry the cookie into the dashboard.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const accessKey = configuredOsAccessKey();
  const back = accessKey ? `${osPath(accessKey)}/finance` : "/";
  let status = "connected";
  let message = "Bank connected. Fetching your transactions…";

  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (error) {
    status = "error";
    message = url.searchParams.get("error_description") || error;
  } else if (!code || !state) {
    status = "error";
    message = "The bank did not return an authorisation code.";
  } else {
    try {
      const psu = psuFromRequest(request);
      const result = await completeBankConnection({ code, state, psu });
      message = `${result.aspspName} connected with ${result.accounts} account${result.accounts === 1 ? "" : "s"}.`;
      try {
        // Fresh BankID: the one moment the bank hands out long history.
        await syncFinance({ psu, force: true, history: true });
      } catch {
        // The dashboard retries; the connection itself worked.
      }
    } catch (caught) {
      status = "error";
      message = caught instanceof Error ? caught.message : "Could not finish connecting the bank.";
    }
  }

  const target = `${back}?bank=${status}&message=${encodeURIComponent(message.slice(0, 300))}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta http-equiv="refresh" content="1;url=${escapeHtml(target)}"><title>Bank connection</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#161616;color:#eee;font:16px system-ui,sans-serif;padding:24px;text-align:center}a{color:#f97316}</style></head>
<body><div><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(target)}">Continue to the dashboard</a></p></div>
<script>setTimeout(function(){location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")})},300)</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
