import { runAccountingAgent, type AgentStreamEvent } from "@/lib/accounting/agent";
import { requireOwnerSession } from "@/lib/accounting/auth";
import { isAccountingError } from "@/lib/accounting/errors";
import { parseJson, privateStream, route } from "@/lib/accounting/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ accessKey: string }> };

export async function POST(request: Request, { params }: Params) {
  return route(async () => {
    const { accessKey } = await params;
    await requireOwnerSession(request, accessKey, true);
    const body = await parseJson(request, 1_500_000);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: AgentStreamEvent | { type: "final"; result: unknown }) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        try {
          const result = await runAccountingAgent(body, send);
          send({ type: "final", result });
        } catch (error) {
          send({
            type: "error",
            message: isAccountingError(error) && error.status < 500
              ? error.message
              : "AI-agenten kunde inte slutföra uppdraget. Ingenting ändrades; försök igen.",
          });
        } finally {
          controller.close();
        }
      },
    });

    return privateStream(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
