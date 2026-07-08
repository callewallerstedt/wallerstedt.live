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
