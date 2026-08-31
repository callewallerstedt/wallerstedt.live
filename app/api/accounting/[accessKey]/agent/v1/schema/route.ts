import { requireAgentOrOwnerSession } from "@/lib/accounting/auth";
import { privateJson, route } from "@/lib/accounting/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function GET(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireAgentOrOwnerSession(request, accessKey);
    return privateJson({
      ok: true,
      createEntry: {
        required: ["bankText", "date", "amount"],
        fields: {
          bankText: "string (idempotency input)",
          date: "YYYY-MM-DD",
          amount: "number|string, max 2 decimals",
          description: "string",
          debitAccount: "BAS account number|null",
          debitName: "string|null",
          creditAccount: "BAS account number|null",
          creditName: "string|null",
          amountExVat: "number|string|null",
          vatAmount: "number|string|null",
          vatAccount: "BAS account number|null",
          type: "Utbetalning|Inbetalning|Överföring|Övrigt",
          source: "string|null; defaults to bankText",
          notes: "string|null",
          status: "string|null",
          receiptRequired: "boolean",
        },
      },
      updateEntry: {
        required: ["version"],
        note: "Fields are partial. Include bankText when changing date or amount so the idempotency fingerprint can be updated.",
      },
      attachment: {
        multipart: { files: "one or more files", entryId: "optional UUID" },
        json: { url: "public HTTPS URL", filename: "optional", entryId: "optional UUID" },
        types: ["pdf", "jpeg", "png", "txt", "csv"],
        maxBytesPerFile: 10 * 1024 * 1024,
      },
    });
  });
}
