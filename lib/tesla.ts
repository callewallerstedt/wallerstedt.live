import { notFound } from "next/navigation";

export const TESLA_AUTH_URL = "https://auth.tesla.com/oauth2/v3/authorize";
export const TESLA_TOKEN_URL = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token";
export const TESLA_FLEET_EU = "https://fleet-api.prd.eu.vn.cloud.tesla.com";
export const TESLA_FLEET_NA = "https://fleet-api.prd.na.vn.cloud.tesla.com";

export const TESLA_SCOPES = [
  "openid",
  "offline_access",
  "user_data",
  "vehicle_device_data",
  "vehicle_location",
  "vehicle_cmds",
  "vehicle_charging_cmds",
].join(" ");

export function connectSecret() {
  return process.env.TESLA_CONNECT_SECRET?.trim() ?? "";
}

export function assertConnectKey(key: string) {
  const expected = connectSecret();
  if (!expected || key !== expected) notFound();
}

export function teslaConfig() {
  const clientId = process.env.TESLA_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.TESLA_CLIENT_SECRET?.trim() ?? "";
  const secret = connectSecret();
  const redirectUri =
    process.env.TESLA_REDIRECT_URI?.trim() ??
    (secret
      ? `https://www.wallerstedt.live/api/i/${secret}/callback`
      : "");
  const audience = process.env.TESLA_FLEET_AUDIENCE?.trim() ?? TESLA_FLEET_EU;
  return { clientId, clientSecret, redirectUri, audience, secret };
}

export function teslaConfigured() {
  const { clientId, clientSecret, redirectUri, secret } = teslaConfig();
  return Boolean(clientId && clientSecret && secret && redirectUri);
}

export async function exchangeTeslaCode(code: string) {
  const { clientId, clientSecret, redirectUri, audience } = teslaConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    audience,
    redirect_uri: redirectUri,
    scope: TESLA_SCOPES,
  });
  const response = await fetch(TESLA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Tesla token exchange failed (${response.status}): ${text}`);
  }
  return JSON.parse(text) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
}
