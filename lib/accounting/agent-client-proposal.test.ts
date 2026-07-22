import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAgentProposal } from "../../components/accounting/api";

test("client preserves an AI-proposed Bilaga behövs toggle", () => {
  const proposal = normalizeAgentProposal({
    token: "signed-token",
    expiresAt: "2026-07-22T20:00:00.000Z",
    edits: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        version: 2,
        current: {
          id: "11111111-1111-4111-8111-111111111111",
          date: "2026-07-22",
          description: "Testpost",
          amount: 100,
          receiptRequired: true,
          version: 2,
        },
        proposed: {
          id: "11111111-1111-4111-8111-111111111111",
          date: "2026-07-22",
          description: "Testpost",
          amount: 100,
          receiptRequired: false,
          version: 2,
        },
        explanation: "Bilaga behövs inte.",
      },
    ],
    deletes: [],
  });

  assert.equal(proposal?.edits[0].current.receiptRequired, true);
  assert.equal(proposal?.edits[0].proposed.receiptRequired, false);
});
