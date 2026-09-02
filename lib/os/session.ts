import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { assertAccessKey, hasOwnerSession } from "@/lib/accounting/auth";
import { AccountingError } from "@/lib/accounting/errors";

export { osPath, vaultPath } from "./paths";
export { configuredOsAccessKey } from "./route";

export async function requireOsAccessKey(accessKey: string) {
  try {
    assertAccessKey(accessKey);
    return accessKey;
  } catch (error) {
    if (error instanceof AccountingError && error.status === 404) notFound();
    throw error;
  }
}

export const hasOsSession = cache(async (accessKey: string) => {
  await requireOsAccessKey(accessKey);
  const headerList = await headers();
  const request = new Request("https://wallerstedt.live/bolag", {
    headers: {
      cookie: headerList.get("cookie") ?? "",
    },
  });
  return hasOwnerSession(request, accessKey);
});
