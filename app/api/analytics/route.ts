export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  // Compatibility no-op for older clients. Do not restore database writes on
  // an unauthenticated public endpoint.
  return new Response(null, { status: 204 });
}
