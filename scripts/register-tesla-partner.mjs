#!/usr/bin/env node
/** One-time Tesla partner domain registration after PEM is live on wallerstedt.live */

const clientId = process.env.TESLA_CLIENT_ID?.trim();
const clientSecret = process.env.TESLA_CLIENT_SECRET?.trim();
const audience = process.env.TESLA_FLEET_AUDIENCE?.trim()
  ?? "https://fleet-api.prd.eu.vn.cloud.tesla.com";
const domain = process.env.TESLA_DOMAIN?.trim() ?? "wallerstedt.live";

if (!clientId || !clientSecret) {
  console.error("Set TESLA_CLIENT_ID and TESLA_CLIENT_SECRET.");
  process.exit(1);
}

const tokenRes = await fetch("https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    audience,
    scope: "openid vehicle_device_data vehicle_cmds vehicle_charging_cmds",
  }),
});
const tokenText = await tokenRes.text();
if (!tokenRes.ok) {
  console.error("Partner token failed:", tokenText);
  process.exit(1);
}
const { access_token: partnerToken } = JSON.parse(tokenText);

const registerRes = await fetch(`${audience}/api/1/partner_accounts`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${partnerToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ domain }),
});
const registerText = await registerRes.text();
console.log("register", registerRes.status, registerText);

const verifyRes = await fetch(
  `${audience}/api/1/partner_accounts/public_key?domain=${encodeURIComponent(domain)}`,
  { headers: { Authorization: `Bearer ${partnerToken}` } },
);
console.log("public_key", verifyRes.status, await verifyRes.text());
