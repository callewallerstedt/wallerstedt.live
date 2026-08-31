import assert from "node:assert/strict";
import test from "node:test";

import { fileFromPublicUrl } from "./remote-document";

test("remote attachments reject non-HTTPS and loopback URLs before download", async () => {
  await assert.rejects(
    fileFromPublicUrl("http://example.com/receipt.pdf"),
    (error: unknown) => error instanceof Error && error.message.includes("public HTTPS"),
  );
  await assert.rejects(
    fileFromPublicUrl("https://127.0.0.1/receipt.pdf"),
    (error: unknown) => error instanceof Error && error.message.includes("Private attachment"),
  );
});
