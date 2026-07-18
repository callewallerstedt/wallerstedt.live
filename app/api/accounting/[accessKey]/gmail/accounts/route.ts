import { z } from "zod";
import { requireOwnerSession } from "@/lib/accounting/auth";
import {
  addGmailAccount,
  gmailConfigured,
  listGmailAccounts,
} from "@/lib/accounting/gmail";
import { parseJson, privateJson, route } from "@/lib/accounting/http";
import { parseWithSchema } from "@/lib/accounting/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ accessKey: string }> };

const connectSchema = z.object({
  email: z.string().trim().min(3).max(320),
  appPassword: z.string().min(8).max(128),
});

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey);
    return privateJson({
      ok: true,
      configured: gmailConfigured(),
      accounts: await listGmailAccounts(),
    });
  });
}

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    const input = parseWithSchema(connectSchema, await parseJson(request, 10_000));
    const account = await addGmailAccount(input.email, input.appPassword);
    return privateJson({ ok: true, account });
  });
}
