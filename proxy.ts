import { NextResponse, type NextRequest } from "next/server";

function requestHostname(request: NextRequest) {
  return (request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
    .split(",", 1)[0]
    .trim()
    .split(":", 1)[0]
    .toLocaleLowerCase("en");
}

export function proxy(request: NextRequest) {
  const configuredHost = (process.env.ACCOUNTING_AGENT_HOST || "agent.wallerstedt.live")
    .trim()
    .toLocaleLowerCase("en");
  if (requestHostname(request) !== configuredHost) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/agent/") || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const vaultMatch = /^\/vault\/([^/]+)\/?$/.exec(pathname);
  const directMatch = /^\/([^/]+)\/?$/.exec(pathname);
  const accessKey = vaultMatch?.[1] || directMatch?.[1];
  if (!accessKey) return NextResponse.next();

  const target = request.nextUrl.clone();
  target.pathname = `/agent/${accessKey}`;
  return NextResponse.rewrite(target);
}

export const proxyConfig = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
