import { z } from "zod";
import {
  authenticatePassword,
  clearSessionCookie,
  hasOwnerSession,
  revokeAllOwnerSessions,
  revokeCurrentOwnerSession,
  setSessionCookie,
} from "@/lib/accounting/auth";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    return privateJson({
      ok: true,
      authenticated: await hasOwnerSession(request, accessKey),
    });
  });
}

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    const body = parseWithSchema(
      z.object({ password: z.string().min(1).max(4096) }),
      await parseJson(request, 16_000),
    );
    const token = await authenticatePassword(request, accessKey, body.password);
    const response = privateJson({ ok: true, authenticated: true });
    setSessionCookie(response, token);
    return response;
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    const scope = parseWithSchema(
      z.enum(["current", "all"]),
      new URL(request.url).searchParams.get("scope") ?? "current",
    );
    let revokedSessions: number;
    if (scope === "all") {
      revokedSessions = await revokeAllOwnerSessions(request, accessKey);
    } else {
      revokedSessions = await revokeCurrentOwnerSession(request, accessKey);
    }
    const response = privateJson({
      ok: true,
      authenticated: false,
      revokedSessions,
    });
    clearSessionCookie(response);
    return response;
  });
}
