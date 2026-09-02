import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { assertAccessKey, hasOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";

export { osPath, vaultPath } from "./paths";

export async function requireOsAccessKey(accessKey: string) {
  try {
    assertAccessKey(accessKey);
    return accessKey;
  } catch (error) {
    if (error instanceof AccountingError && error.status === 404) notFound();
    throw error;
  }
}

export async function hasOsSession(accessKey: string) {
  requireOsAccessKey(accessKey);
  const headerList = await headers();
  const request = new Request("https://wallerstedt.live/os", {
    headers: {
      cookie: headerList.get("cookie") ?? "",
    },
  });
  return hasOwnerSession(request, accessKey);
}
