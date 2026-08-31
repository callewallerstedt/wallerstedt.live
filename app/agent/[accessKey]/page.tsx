import { AgentWorkspace } from "@/components/accounting/AgentWorkspace";

export const dynamic = "force-dynamic";

export default async function AgentVaultPage({
  params,
}: {
  params: Promise<{ accessKey: string }>;
}) {
  const { accessKey } = await params;
  return <AgentWorkspace accessKey={accessKey} />;
}
