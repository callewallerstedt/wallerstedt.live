import { NextResponse, type NextRequest } from "next/server";

import { agentHostRewritePath } from "@/lib/os/agent-host";

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

  const destination = agentHostRewritePath(request.nextUrl.pathname);
  if (!destination) return NextResponse.next();

  const target = request.nextUrl.clone();
  target.pathname = destination;
  return NextResponse.rewrite(target);
}

export const proxyConfig = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
