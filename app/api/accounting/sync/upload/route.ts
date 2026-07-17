import { route } from "@/lib/accounting/http";
import { handleSyncUploadToken } from "@/lib/accounting/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return route(() => handleSyncUploadToken(request));
}
