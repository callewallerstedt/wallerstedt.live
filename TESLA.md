# Private Tesla hookup for aiOS (not linked from the public site)

## Tesla Developer Portal

| Field | Value |
|-------|-------|
| OAuth grant | Authorization Code and Machine-to-Machine |
| Allowed Origin | `https://www.wallerstedt.live` |
| Redirect URI | `https://www.wallerstedt.live/api/i/YOUR_SECRET/callback` |

Replace `YOUR_SECRET` with the same value as `TESLA_CONNECT_SECRET`.

## Vercel env vars

- `TESLA_CLIENT_ID`
- `TESLA_CLIENT_SECRET`
- `TESLA_CONNECT_SECRET` — long random string; only you + aiOS know it
- `TESLA_FLEET_AUDIENCE` — EU default for Sweden

Wrong or missing secret → normal site 404. Nothing Tesla-related appears on the homepage.

The public key at `/.well-known/appspecific/com.tesla.3p.public-key.pem` must stay reachable for Tesla, but it is not linked anywhere on the site.

## Connect from phone

1. Deploy with env vars (`npx vercel deploy --prod`)
2. Run `npx prisma db push` when schema changes (Tesla live table)
3. In aiOS settings, paste the same connect secret
4. Tap **Connect Tesla account**
5. Pair key in Tesla app if asked: `https://tesla.com/_ak/wallerstedt.live`

## Grokbot access (agent API)

Grokbot reads and controls the car through the same agent API it already uses
for tasks and finance, with the same bearer token:

```bash
BASE=https://wallerstedt.live/api/os/$ACCOUNTING_ACCESS_KEY/agent/v1
AUTH="Authorization: Bearer $ACCOUNTING_AGENT_API_TOKEN"

curl -H "$AUTH" "$BASE/tesla"                                   # connected?, cars, online/asleep, bridge telemetry
curl -H "$AUTH" "$BASE/tesla/vehicles/default"                  # live battery, range, climate, locks, location
curl -X POST -H "$AUTH" "$BASE/tesla/vehicles/default/wake"
curl -X POST -H "$AUTH" -H "Content-Type: application/json" "$BASE/tesla/vehicles/default/command" \
  -d '{"command":"set_temps","params":{"driver_temp":21,"passenger_temp":21}}'
```

`default` is `TESLA_DEFAULT_VIN` or the first car on the account; a VIN also works.
`GET $BASE` lists every endpoint for the agent.

### Connect the car (once)

1. Open `https://www.wallerstedt.live/api/i/<TESLA_CONNECT_SECRET>/auth?for=agents`
   and log in with the Tesla account that owns the car.
2. The page confirms the login is stored and lists your cars. The refresh token
   is kept encrypted in Postgres (`TeslaFleetToken`) and never shown. This is a
   separate login from aiOS, so the two never invalidate each other.
3. Tap **Add virtual key to car** (`https://tesla.com/_ak/wallerstedt.live`) on the
   phone with the Tesla app and approve it in the car with the key card.
   Reading data works without the key; commands need it.

Reconnect the same way whenever `GET /tesla` shows `lastError` or a call returns
`tesla_reconnect_required`. `DELETE $BASE/tesla` forgets the login.

### Commands

Allowed by default: climate and seat/wheel heat, charging start/stop/limit/amps,
charge port, schedules, lock, sentry, honk, flash, navigation and media.
Unlock, trunk/frunk, windows, remote start, valet and PIN changes are blocked
unless listed in `TESLA_AGENT_EXTRA_COMMANDS` (comma list, or `*`).

Cars from 2021 onward only accept **signed** commands. Run Tesla's
[`tesla-http-proxy`](https://github.com/teslamotors/vehicle-command) with the
private key that matches `/.well-known/appspecific/com.tesla.3p.public-key.pem`
(the home PC already has it as `tesla-private-key.pem`), expose it over HTTPS with a
publicly trusted certificate (for example a Cloudflare Tunnel), and set
`TESLA_COMMAND_PROXY_URL`. Without it, a new car answers
`tesla_signed_commands_required`; data reads still work.

Each data read and command is billed by Tesla. `GET /tesla` does not wake the car.

## Fleet Telemetry (live dash)

Phone API (Vercel, already on this project):

- `GET /api/tesla/live` — aiOS dashboard (header `X-Aios-Token: TESLA_CONNECT_SECRET`)
- `POST /api/tesla/ingest` — home PC bridge pushes car data here

Car receiver runs on **your home PC** (Docker), not Vercel. See `C:\aiOS\tesla-telemetry\README.md`.

## Register domain (once)

```powershell
$env:TESLA_CLIENT_ID="..."
$env:TESLA_CLIENT_SECRET="..."
node scripts/register-tesla-partner.mjs
```

## iPhone Drive PWA

The private mobile dashboard lives at `/tesla`. It only reads from this app's
existing Tesla APIs and Prisma tables. It never requests vehicle data directly
from Tesla, so normal dashboard refreshes do not create Fleet API polling cost.

### First-time iPhone setup

1. Open `https://www.wallerstedt.live/tesla` in Safari.
2. Open **Setup**, paste `TESLA_CONNECT_SECRET`, and tap **Save and connect**.
3. Allow Precise Location and Microphone when iOS asks.
4. Tap **Voice** once. The default wake phrase is `Hey Tesla`.
5. In Safari, tap **Share**, then **Add to Home Screen**.

The connection token and optional personal OpenAI key are stored only in that
browser's local storage. For the voice agent, setting `OPENAI_API_KEY` in Vercel
is safer than entering a key on the phone. `TESLA_VOICE_MODEL` is optional and
defaults to `gpt-5-nano`. Speed, battery, range, status, trip, app, refresh, and
map voice commands are handled locally and do not use OpenAI.

Wake phrase recognition automatically resumes while the PWA is visible. iOS
does not allow a web app to keep the microphone active after it is backgrounded
or the phone is locked, so tap Voice again after returning if Safari stopped it.

### Real GPS routes

Route data appears after the laptop bridge has a current Tesla refresh token and
the vehicle Fleet Telemetry configuration includes Location again. Until then,
the dashboard shows an explicit empty state and can use iPhone GPS as a speed
fallback. No new OAuth app, Fleet key, or database is required.

### Read-only safety boundary

The PWA currently displays live state and launches trusted iPhone apps. It does
not send lock, climate, trunk, or drive commands to the vehicle. Those actions
should only be added after the existing backend has secure refresh-token storage
and Tesla's signed vehicle-command proxy configured.
