import assert from "node:assert/strict";
import test from "node:test";
import { unusedOwnedDocumentIds } from "./ai";
import { documentAssignSchema, parseWithSchema } from "./validation";

test("documentAssignSchema requires a target post and optimistic version", () => {
  const parsed = parseWithSchema(documentAssignSchema, {
    entryId: "11111111-1111-4111-8111-111111111111",
    version: 3,
  });
  assert.equal(parsed.entryId, "11111111-1111-4111-8111-111111111111");
  assert.equal(parsed.version, 3);
});

test("documentAssignSchema rejects a missing target post", () => {
  assert.throws(
    () => parseWithSchema(documentAssignSchema, { version: 1 }),
    (error: unknown) =>
      error instanceof Error && /Invalid accounting data/i.test(error.message),
  );
});

test("assigned chat uploads are not treated as unused owned documents", () => {
  const owned = [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ];
  const unused = unusedOwnedDocumentIds(owned, [
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ]);
  assert.deepEqual(unused, ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]);
});
