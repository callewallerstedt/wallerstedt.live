import assert from "node:assert/strict";
import test from "node:test";
import {
  signAgentProposal,
  verifyAgentProposal,
} from "./agent-token";

process.env.ACCOUNTING_AGENT_SIGNING_SECRET =
  "test-only-accounting-agent-signing-secret-2026";

const proposed = {
  date: "2026-07-17",
  description: "Testpost",
  debitName: "Programvaror",
  debitAccount: 6540,
  creditName: "Företagskonto",
  creditAccount: 1930,
  amountExVat: 100,
  vatAmount: 25,
  vatAccount: 2641,
  amount: 125,
  type: "Utbetalning",
  source: "test",
  notes: null,
  status: "Bokförd",
};

test("agent proposals are signed and round-trip without trusting the browser", () => {
  const signed = signAgentProposal({
    edits: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        version: 2,
        proposed,
        explanation: "Rätta konto.",
      },
    ],
    deletes: [],
  });
  const verified = verifyAgentProposal(signed.token);
  assert.equal(verified.edits[0].proposed.debitAccount, 6540);
  assert.equal(verified.edits[0].version, 2);
});

test("agent proposal tampering is rejected", () => {
  const signed = signAgentProposal({ edits: [], deletes: [] });
  const [payload, signature] = signed.token.split(".");
  const replacement = payload.endsWith("A") ? "B" : "A";
  const tampered = `${payload.slice(0, -1)}${replacement}.${signature}`;
  assert.throws(() => verifyAgentProposal(tampered));
});

test("expired agent proposals are rejected", () => {
  const signed = signAgentProposal({ edits: [], deletes: [] }, -1);
  assert.throws(() => verifyAgentProposal(signed.token));
});
