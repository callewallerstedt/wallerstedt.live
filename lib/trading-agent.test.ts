import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { parseTradingBook } from "./trading";
import { applyTradingAgentBody, parseTradingCommand } from "./trading-agent";

function seed() {
  return parseTradingBook(JSON.parse(readFileSync(path.join(process.cwd(), "data/trading/book.json"), "utf8")));
}

test("plain commands parse hold, close, and capital", () => {
  assert.deepEqual(parseTradingCommand("hold NVDA 1 @ 172.40 stop 166 target 185 name NVIDIA"), {
    hold: {
      symbol: "NVDA",
      shares: 1,
      side: "long",
      fill: 172.4,
      stop: 166,
      target: 185,
      name: "NVIDIA",
    },
  });
  assert.deepEqual(parseTradingCommand("buy KO 2 long @ 88.1"), {
    hold: {
      symbol: "KO",
      shares: 2,
      side: "long",
      fill: 88.1,
      stop: undefined,
      target: undefined,
      name: undefined,
    },
  });
  assert.deepEqual(parseTradingCommand("close KO @ 88.10"), {
    close: { symbol: "KO", exit: 88.1 },
  });
  assert.deepEqual(parseTradingCommand("capital 5000 kr"), { capitalSek: 5000 });
});

test("agent hold/close/capital update the live book", () => {
  const book = seed();
  const held = applyTradingAgentBody(book, {
    commands: ["hold NVDA 1 @ 172.4 stop 166 target 185 name NVIDIA", "capital 6000"],
  });
  const nvda = held.book.positions.find((position) => position.symbol === "NVDA");
  assert.ok(nvda);
  assert.equal(nvda.fill, 172.4);
  assert.equal(nvda.stop, 166);
  assert.equal(nvda.target, 185);
  assert.equal(held.book.experiment.capitalSek, 6000);
  assert.ok(held.book.portfolios[0]?.symbols.includes("NVDA"));

  const closed = applyTradingAgentBody(held.book, { command: "close KO @ 88.1" });
  assert.equal(closed.book.positions.some((position) => position.symbol === "KO"), false);
  assert.ok(closed.book.closed.some((trade) => trade.symbol === "KO" && trade.exit === 88.1));
});

test("updating an existing hold keeps the original fill date", () => {
  const book = seed();
  const gm = book.positions.find((position) => position.symbol === "GM");
  assert.ok(gm);
  const updated = applyTradingAgentBody(book, {
    hold: [{ symbol: "GM", fill: gm.fill, shares: 3, stop: 50, target: 100 }],
  });
  const next = updated.book.positions.find((position) => position.symbol === "GM");
  assert.equal(next?.shares, 3);
  assert.equal(next?.filledAt, gm.filledAt);
  assert.equal(next?.stop, 50);
  assert.equal(next?.target, 100);
});
