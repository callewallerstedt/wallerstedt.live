import {
  parseTradingBook,
  positionFromDraft,
  positionPnlUsd,
  type ClosedTrade,
  type TradingBook,
} from "@/lib/trading";

export type TradingAgentHold = {
  symbol: string;
  name?: string;
  shares?: number;
  side?: "long" | "short";
  fill: number;
  filledAt?: string;
  stop?: number;
  stopPct?: number;
  target?: number;
  targetPct?: number;
};

export type TradingAgentClose = {
  symbol: string;
  exit?: number;
  closedAt?: string;
};

export type TradingAgentBody = {
  commands?: string[];
  command?: string;
  text?: string;
  hold?: TradingAgentHold[];
  close?: Array<string | TradingAgentClose>;
  capitalSek?: number;
  replace?: boolean;
};

function syncPortfolio(book: TradingBook): TradingBook {
  const symbols = book.positions.map((position) => position.symbol);
  const portfolios = book.portfolios.length
    ? book.portfolios.map((portfolio, index) =>
        index === 0 ? { ...portfolio, symbols, capitalSek: book.experiment.capitalSek } : portfolio,
      )
    : [
        {
          id: "live",
          name: book.experiment.title,
          style: book.experiment.style,
          capitalSek: book.experiment.capitalSek,
          symbols,
        },
      ];
  return { ...book, portfolios };
}

function bump(book: TradingBook): TradingBook {
  return {
    ...book,
    version: book.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function upsertHold(book: TradingBook, draft: TradingAgentHold): TradingBook {
  const symbol = draft.symbol.toUpperCase();
  const existing = book.positions.find((item) => item.symbol === symbol);
  const position = positionFromDraft({
    ...existing,
    ...draft,
    symbol,
    name: draft.name || existing?.name,
    filledAt: draft.filledAt || existing?.filledAt,
  });
  if (!position.symbol || !position.fill || !position.shares) {
    throw new Error("hold needs symbol, shares, and fill");
  }
  const rest = book.positions.filter((item) => item.symbol !== position.symbol);
  return syncPortfolio({ ...book, positions: [...rest, position] });
}

export function closeHold(book: TradingBook, input: TradingAgentClose): TradingBook {
  const symbol = input.symbol.toUpperCase();
  const position = book.positions.find((item) => item.symbol === symbol);
  if (!position) return book;
  const exit = input.exit ?? position.last ?? position.fill;
  const pnlUsd = positionPnlUsd(position, exit);
  const pnlPct = position.fill ? (pnlUsd / (position.fill * position.shares)) * 100 : 0;
  const closed: ClosedTrade = {
    symbol: position.symbol,
    name: position.name,
    side: position.side,
    shares: position.shares,
    fill: position.fill,
    exit,
    pnlPct: Number(pnlPct.toFixed(2)),
    result: pnlPct >= 0 ? "win" : "loss",
    closedAt: input.closedAt || new Date().toISOString(),
  };
  const wins = (book.stats.wins ?? 0) + (closed.result === "win" ? 1 : 0);
  const losses = (book.stats.losses ?? 0) + (closed.result === "loss" ? 1 : 0);
  return syncPortfolio({
    ...book,
    positions: book.positions.filter((item) => item.symbol !== symbol),
    closed: [...book.closed.filter((item) => item.symbol !== symbol || item.closedAt !== closed.closedAt), closed],
    stats: { ...book.stats, wins, losses, openPnlSek: null },
  });
}

export function parseTradingCommand(command: string): { hold?: TradingAgentHold; close?: TradingAgentClose; capitalSek?: number } {
  const text = command.trim();
  const hold = text.match(
    /^(?:hold|buy|add|update)\s+(\S+)\s+(\d+(?:\.\d+)?)\s*(long|short)?\s*@\s*(\d+(?:\.\d+)?)(?:\s+stop\s+(\d+(?:\.\d+)?))?(?:\s+target\s+(\d+(?:\.\d+)?))?(?:\s+name\s+(.+))?$/i,
  );
  if (hold) {
    return {
      hold: {
        symbol: hold[1]!.toUpperCase(),
        shares: Number(hold[2]),
        side: hold[3]?.toLowerCase() === "short" ? "short" : "long",
        fill: Number(hold[4]),
        stop: hold[5] ? Number(hold[5]) : undefined,
        target: hold[6] ? Number(hold[6]) : undefined,
        name: hold[7]?.trim(),
      },
    };
  }
  const close = text.match(/^(?:close|sell|exit)\s+(\S+)(?:\s*@\s*(\d+(?:\.\d+)?))?$/i);
  if (close) {
    return { close: { symbol: close[1]!.toUpperCase(), exit: close[2] ? Number(close[2]) : undefined } };
  }
  const capital = text.match(/^(?:capital|cash)\s+(\d+(?:\.\d+)?)\s*(kr|sek)?$/i);
  if (capital) return { capitalSek: Number(capital[1]) };
  throw new Error(`Unknown command: ${text}`);
}

function commandList(body: TradingAgentBody) {
  const extra = [body.command, body.text]
    .flatMap((value) => (value ? value.split(/\n+/) : []))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...(body.commands ?? []), ...extra];
}

export function applyTradingAgentBody(book: TradingBook, body: TradingAgentBody): { book: TradingBook; notes: string[] } {
  let next = parseTradingBook(book);
  const notes: string[] = [];

  if (body.replace) {
    next = { ...next, positions: [] };
    notes.push("cleared positions");
  }

  for (const command of commandList(body)) {
    const parsed = parseTradingCommand(command);
    if (parsed.hold) {
      next = upsertHold(next, parsed.hold);
      notes.push(`hold ${parsed.hold.symbol}`);
    }
    if (parsed.close) {
      next = closeHold(next, parsed.close);
      notes.push(`close ${parsed.close.symbol}`);
    }
    if (parsed.capitalSek != null) {
      next = {
        ...next,
        experiment: { ...next.experiment, capitalSek: parsed.capitalSek },
      };
      notes.push(`capital ${parsed.capitalSek}`);
    }
  }

  for (const hold of body.hold ?? []) {
    next = upsertHold(next, hold);
    notes.push(`hold ${hold.symbol.toUpperCase()}`);
  }

  for (const item of body.close ?? []) {
    const close = typeof item === "string" ? { symbol: item } : item;
    next = closeHold(next, close);
    notes.push(`close ${close.symbol.toUpperCase()}`);
  }

  if (body.capitalSek != null) {
    next = {
      ...next,
      experiment: { ...next.experiment, capitalSek: body.capitalSek },
    };
    notes.push(`capital ${body.capitalSek}`);
  }

  if (!notes.length) return { book: next, notes };

  return { book: bump(syncPortfolio(next)), notes };
}

export function publicTradingBook(book: TradingBook) {
  return {
    version: book.version,
    updatedAt: book.updatedAt,
    timezone: book.timezone,
    capitalSek: book.experiment.capitalSek,
    title: book.experiment.title,
    positions: book.positions.map((position) => ({
      symbol: position.symbol,
      name: position.name,
      side: position.side,
      shares: position.shares,
      fill: position.fill,
      filledAt: position.filledAt,
      stop: position.stop,
      target: position.target,
      last: position.last,
    })),
    closed: book.closed,
  };
}
