"use client";

import { AccountingApp } from "@/components/accounting/AccountingApp";
import "@/components/accounting/accounting.css";

export function OsVault({ accessKey }: { accessKey: string }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AccountingApp accessKey={accessKey} embedded />
    </div>
  );
}
