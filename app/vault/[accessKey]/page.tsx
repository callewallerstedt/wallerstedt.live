import { AccountingApp } from "@/components/accounting/AccountingApp";

export const dynamic = "force-dynamic";

export default async function AccountingVaultPage({
  params,
}: {
  params: Promise<{ accessKey: string }>;
}) {
  const { accessKey } = await params;
  return <AccountingApp accessKey={accessKey} />;
}
