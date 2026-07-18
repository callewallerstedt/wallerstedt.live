export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  // Public analytics now uses Vercel Analytics. Keeping this legacy endpoint
  // as a no-op prevents old browser tabs or bots from generating database IO.
  return new Response(null, { status: 204 });
}
