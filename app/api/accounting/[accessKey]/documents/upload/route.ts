import { route } from "@/lib/accounting/http";
import { handleOwnerUploadToken } from "@/lib/accounting/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ accessKey: string }> };

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    return handleOwnerUploadToken(request, accessKey);
  });
}
