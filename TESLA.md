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
