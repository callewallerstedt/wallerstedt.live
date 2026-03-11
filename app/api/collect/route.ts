import { recordAnalyticsEvent } from "@/lib/analytics";

function isBotUserAgent(userAgent: string) {
  return /(bot|spider|crawler|preview|facebookexternalhit|slackbot|discordbot|whatsapp)/i.test(userAgent);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (isBotUserAgent(userAgent)) {
    return new Response(null, { status: 204 });
  }

  try {
    const payload = (await request.json()) as {
      type?: string;
      path?: string;
      label?: string;
      href?: string;
      title?: string;
    };

    if (payload.type !== "pageview" && payload.type !== "button_click") {
      return new Response("Invalid analytics event.", { status: 400 });
    }

    if (!payload.path) {
      return new Response("Missing path.", { status: 400 });
    }

    await recordAnalyticsEvent({
      type: payload.type,
      path: payload.path,
      label: payload.label,
      href: payload.href,
      title: payload.title,
      at: new Date().toISOString(),
    });

    return new Response(null, { status: 204 });
  } catch {
    return new Response("Could not record analytics event.", { status: 400 });
  }
}
