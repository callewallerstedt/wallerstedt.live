import { getAccountingDb } from "@/lib/accounting/db";
import { AccountingError } from "@/lib/accounting/errors";
import { TESLA_TOKEN_URL, teslaConfig } from "@/lib/tesla";
import {
  allowedTeslaCommands,
  decryptToken,
  encryptToken,
  isTeslaCommandName,
  parseExtraCommands,
  teslaCommandAllowed,
} from "@/lib/tesla-fleet";

/**
 * Server-side Tesla Fleet API connection used by agents (Grokbot).
 *
 * The owner connects once through /api/i/<TESLA_CONNECT_SECRET>/auth?for=agents.
 * The refresh token is stored encrypted in Postgres and rotated on every
 * refresh. It is never shown to the browser or returned by any endpoint.
 */

const OWNER_ROW = "owner";
const ACCESS_SKEW_MS = 2 * 60_000;
const VEHICLE_DATA_ENDPOINTS = [
  "charge_state",
  "climate_state",
  "closures_state",
  "drive_state",
  "gui_settings",
  "location_data",
  "vehicle_config",
  "vehicle_state",
].join(";");

export const TESLA_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS "TeslaFleetToken" (
    "id" TEXT NOT NULL,
    "refreshCipher" TEXT NOT NULL,
    "accessCipher" TEXT NOT NULL DEFAULT '',
    "accessExpiresAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeslaFleetToken_pkey" PRIMARY KEY ("id")
  )`,
];

type TokenRow = {
  refreshCipher: string;
  accessCipher: string;
  accessExpiresAt: Date | null;
};

type TeslaTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

let schemaReady: Promise<void> | null = null;

function ensureTeslaSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getAccountingDb();
      for (const statement of TESLA_SCHEMA_SQL) {
        await db.$executeRawUnsafe(statement);
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function db() {
  await ensureTeslaSchema();
  return getAccountingDb();
}

function tokenSecret() {
  const secret = process.env.TESLA_TOKEN_KEY?.trim() || teslaConfig().clientSecret;
  if (!secret) {
    throw new AccountingError(
      "Tesla is not configured on the server (TESLA_CLIENT_SECRET is missing).",
      503,
      "tesla_not_configured",
    );
  }
  return secret;
}

function accessExpiry(tokens: TeslaTokens) {
  return new Date(Date.now() + Math.max(60, tokens.expires_in ?? 8 * 3600) * 1000);
}

/** Save tokens from the OAuth callback; replaces any earlier connection. */
export async function saveTeslaAgentTokens(tokens: TeslaTokens) {
  if (!tokens.refresh_token) throw new Error("Tesla did not return a refresh token.");
  const secret = tokenSecret();
  const client = await db();
  const data = {
    refreshCipher: encryptToken(tokens.refresh_token, secret),
    accessCipher: tokens.access_token ? encryptToken(tokens.access_token, secret) : "",
    accessExpiresAt: tokens.access_token ? accessExpiry(tokens) : null,
    lastError: "",
  };
  await client.teslaFleetToken.upsert({
    where: { id: OWNER_ROW },
    create: { id: OWNER_ROW, ...data },
    update: { ...data, connectedAt: new Date() },
  });
}

export async function disconnectTeslaAgent() {
  const client = await db();
  await client.teslaFleetToken.deleteMany({ where: { id: OWNER_ROW } });
}

export async function teslaAgentConnection() {
  const client = await db();
  const row = await client.teslaFleetToken.findUnique({ where: { id: OWNER_ROW } });
  return row
    ? { connected: true, connectedAt: row.connectedAt.toISOString(), lastError: row.lastError || null }
    : { connected: false, connectedAt: null, lastError: null };
}

function notConnected(): never {
  throw new AccountingError(
    "Tesla is not connected for agents yet. The owner must open /api/i/<TESLA_CONNECT_SECRET>/auth?for=agents once.",
    409,
    "tesla_not_connected",
  );
}

async function refreshTokens(refreshToken: string): Promise<TeslaTokens> {
  const response = await fetch(TESLA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: teslaConfig().clientId,
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    const reconnect = response.status === 400 || response.status === 401;
    throw new AccountingError(
      reconnect
        ? "Tesla rejected the stored login. Reconnect at /api/i/<TESLA_CONNECT_SECRET>/auth?for=agents."
        : `Tesla token refresh failed (${response.status}).`,
      reconnect ? 409 : 502,
      reconnect ? "tesla_reconnect_required" : "tesla_token_refresh_failed",
    );
  }
  return JSON.parse(text) as TeslaTokens;
}

/**
 * A valid access token. Refreshes under a row lock so parallel requests never
 * spend the same (single-use) refresh token twice.
 */
async function accessToken(forceRefresh = false): Promise<string> {
  const secret = tokenSecret();
  const client = await db();
  const unexpired = (row: TokenRow) =>
    Boolean(row.accessCipher) &&
    row.accessExpiresAt !== null &&
    row.accessExpiresAt.getTime() - ACCESS_SKEW_MS > Date.now();
  const fresh = (row: TokenRow) => !forceRefresh && unexpired(row);

  const current = await client.teslaFleetToken.findUnique({ where: { id: OWNER_ROW } });
  if (!current) notConnected();
  if (fresh(current)) return decryptToken(current.accessCipher, secret);

  try {
    return await client.$transaction(
      async (tx) => {
        const [locked] = await tx.$queryRaw<TokenRow[]>`
          SELECT "refreshCipher", "accessCipher", "accessExpiresAt"
          FROM "TeslaFleetToken" WHERE "id" = ${OWNER_ROW} FOR UPDATE`;
        if (!locked) notConnected();
        // Another request may have refreshed while this one waited for the lock.
        const replaced = locked.accessCipher !== current.accessCipher;
        if (unexpired(locked) && (replaced || !forceRefresh)) {
          return decryptToken(locked.accessCipher, secret);
        }
        const tokens = await refreshTokens(decryptToken(locked.refreshCipher, secret));
        if (!tokens.access_token) throw new Error("Tesla refresh returned no access token.");
        await tx.teslaFleetToken.update({
          where: { id: OWNER_ROW },
          data: {
            refreshCipher: tokens.refresh_token
              ? encryptToken(tokens.refresh_token, secret)
              : locked.refreshCipher,
            accessCipher: encryptToken(tokens.access_token, secret),
            accessExpiresAt: accessExpiry(tokens),
            lastError: "",
          },
        });
        return tokens.access_token;
      },
      { timeout: 25_000, maxWait: 10_000 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await client.teslaFleetToken
      .update({ where: { id: OWNER_ROW }, data: { lastError: message.slice(0, 500) } })
      .catch(() => undefined);
    throw error;
  }
}

/* ------------------------------------------------------------------------ */
/* Fleet API                                                                  */
/* ------------------------------------------------------------------------ */

type FleetResult = { status: number; body: Record<string, unknown> };

async function fleetRequest(base: string, path: string, init: RequestInit = {}): Promise<FleetResult> {
  let retried = false;
  for (;;) {
    const token = await accessToken(retried);
    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/+$/, "")}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
      const code = typeof cause?.code === "string" ? cause.code : (error as Error)?.name ?? "unknown";
      throw new AccountingError(
        `Could not reach the Tesla ${base === fleetBase() ? "Fleet API" : "command proxy"} (${code}).`,
        502,
        "tesla_upstream_unreachable",
      );
    }
    if (response.status === 401 && !retried) {
      retried = true;
      continue;
    }
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = { error: text.slice(0, 500) };
    }
    return { status: response.status, body };
  }
}

function fleetError(result: FleetResult, action: string): never {
  const detail = [result.body.error, result.body.error_description]
    .filter((part) => typeof part === "string" && part)
    .join(": ");
  if (result.status === 408) {
    throw new AccountingError(
      "The car is asleep or offline. POST .../wake first, wait ~10-30 s, then retry.",
      409,
      "tesla_vehicle_asleep",
    );
  }
  if (result.status === 429) {
    throw new AccountingError("Tesla rate limit hit. Try again in a minute.", 429, "tesla_rate_limited");
  }
  if (/vehicle command protocol/i.test(detail)) {
    throw new AccountingError(
      "This car only accepts signed commands. Set TESLA_COMMAND_PROXY_URL to a running tesla-http-proxy that has the wallerstedt.live private key.",
      501,
      "tesla_signed_commands_required",
      { tesla: detail },
    );
  }
  if (/public key|virtual key|not paired/i.test(detail)) {
    throw new AccountingError(
      "The car has not accepted the wallerstedt.live virtual key. Open https://tesla.com/_ak/wallerstedt.live on the phone with the Tesla app and approve it in the car.",
      403,
      "tesla_key_not_paired",
      { tesla: detail },
    );
  }
  throw new AccountingError(
    `Tesla ${action} failed (${result.status})${detail ? `: ${detail}` : ""}.`,
    result.status >= 500 ? 502 : result.status,
    "tesla_request_failed",
  );
}

function fleetBase() {
  return teslaConfig().audience;
}

type VehicleListItem = {
  id?: number;
  vin?: string;
  display_name?: string;
  state?: string;
  access_type?: string;
};

export async function listTeslaVehicles() {
  const result = await fleetRequest(fleetBase(), "/api/1/vehicles");
  if (result.status !== 200) fleetError(result, "vehicle list");
  const vehicles = Array.isArray(result.body.response)
    ? (result.body.response as VehicleListItem[])
    : [];
  return vehicles.map((vehicle) => ({
    vin: vehicle.vin ?? "",
    name: vehicle.display_name ?? "",
    state: vehicle.state ?? "unknown",
    accessType: vehicle.access_type ?? null,
  }));
}

/** "default" (or "car") resolves to TESLA_DEFAULT_VIN or the first vehicle on the account. */
export async function resolveTeslaVin(input: string) {
  const value = decodeURIComponent(input).trim();
  if (!["default", "car", ""].includes(value.toLowerCase())) {
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(value)) {
      throw new AccountingError("Use a 17-character VIN or 'default'.", 400, "tesla_invalid_vin");
    }
    return value.toUpperCase();
  }
  const configured = process.env.TESLA_DEFAULT_VIN?.trim();
  if (configured) return configured.toUpperCase();
  const [first] = await listTeslaVehicles();
  if (!first?.vin) {
    throw new AccountingError("No vehicles on the connected Tesla account.", 404, "tesla_no_vehicles");
  }
  return first.vin;
}

export async function teslaVehicleData(vin: string) {
  const path = `/api/1/vehicles/${encodeURIComponent(vin)}/vehicle_data?endpoints=${encodeURIComponent(VEHICLE_DATA_ENDPOINTS)}`;
  const result = await fleetRequest(fleetBase(), path);
  if (result.status !== 200) fleetError(result, "vehicle data");
  return result.body.response ?? null;
}

export async function wakeTeslaVehicle(vin: string) {
  const result = await fleetRequest(fleetBase(), `/api/1/vehicles/${encodeURIComponent(vin)}/wake_up`, {
    method: "POST",
  });
  if (result.status !== 200) fleetError(result, "wake");
  const response = (result.body.response ?? {}) as VehicleListItem;
  return { vin, state: response.state ?? "unknown" };
}

export function teslaAgentCommandPolicy() {
  const extra = parseExtraCommands(process.env.TESLA_AGENT_EXTRA_COMMANDS);
  return {
    extra,
    allowed: allowedTeslaCommands(extra),
    signedProxy: Boolean(process.env.TESLA_COMMAND_PROXY_URL?.trim()),
  };
}

/**
 * Send a vehicle command. Cars from 2021 on only accept commands signed with
 * the wallerstedt.live key, so they go through TESLA_COMMAND_PROXY_URL
 * (Tesla's tesla-http-proxy) when it is set.
 */
export async function sendTeslaCommand(vin: string, command: string, params: Record<string, unknown>) {
  const name = command.trim().toLowerCase();
  if (!isTeslaCommandName(name)) {
    throw new AccountingError("Unknown command name.", 400, "tesla_invalid_command");
  }
  const { extra } = teslaAgentCommandPolicy();
  if (!teslaCommandAllowed(name, extra)) {
    throw new AccountingError(
      `The command "${name}" is not allowed for agents. The owner can add it to TESLA_AGENT_EXTRA_COMMANDS.`,
      403,
      "tesla_command_not_allowed",
    );
  }
  const base = process.env.TESLA_COMMAND_PROXY_URL?.trim() || fleetBase();
  const result = await fleetRequest(
    base,
    `/api/1/vehicles/${encodeURIComponent(vin)}/command/${name}`,
    { method: "POST", body: JSON.stringify(params) },
  );
  if (result.status !== 200) fleetError(result, `command ${name}`);
  const response = (result.body.response ?? {}) as { result?: boolean; reason?: string };
  return {
    vin,
    command: name,
    result: response.result ?? false,
    reason: response.reason ?? "",
  };
}
