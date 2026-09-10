# wallerstedt.live

Artist site for [Wallerstedt](https://wallerstedt.live), plus a private bookkeeping PWA at `/vault/<ACCOUNTING_ACCESS_KEY>` and the owner company app at `/bolag/<ACCOUNTING_ACCESS_KEY>`. The company app is the canonical place for vault/bokföring plus the other owner tabs. Sign in with the same owner password. The secret key stays in the address bar. Bare `/bolag` is not a public page — missing or wrong keys 404 like `/vault`. The Home Screen PWA at `/vault/<key>` still works.

## Company dashboard (`/bolag/<key>`)

A collapsible sidebar on desktop and a fixed tab bar on phones. Video work lives on **TikTok**; Tasks stays on the sidebar and via a small button on Overview.

| Tab | What it holds |
| --- | --- |
| **Overview** | Focus first — the ranked to-do list, drag a number to reprioritise — then cash, this month's revenue and result, estimated bolagsskatt, the running-result curve, upcoming tax and the latest entries. A small **Tasks** button opens the full to-do page. |
| **TikTok** | Video ideas (song + saved Treg piano-cover search), clickable links in notes, and scan tools: watched accounts, on-demand Treg profile scans, thumbs, piano-category 7d/30d lists, a piano-trending strip, ranked watch-list clips, and the Monday Berlin digest hook |
| **Tasks** | The owner's own to-do list plus everything the ledger and repos flag, and the dates ahead (sidebar + Overview button; not a phone tab) |
| **Bokföring** | The full vault app, embedded in the dashboard shell |
| **Money** | Ledger, expense breakdown, repeating costs, income by description, tax, missing receipts, and the personal trading book kept clearly apart |
| **Music** | The full streaming analytics: every song's daily history, a scrubbable chart with a drag-to-set range, growth and momentum, milestones, DistroKid payouts and the release calendar |
| **Settings** | Theme, accent, company details, data sources and sign-out |

The header holds only the logo; pressing it drops down the registry details
(org.nr, momsnummer, verksamhetsbeskrivning, säte) with a copy button on each.

`Content`, `Customers`, `Accounting`, `Investments`, `Wealth`, `Upcoming`, `Alerts` and `Projects` were merged away; their URLs redirect rather than 404.

### GPT-Live voice

The floating Live mic on every signed-in Bolag page opens fullscreen OpenAI Realtime voice with a two-sided transcript. Ask Live to use `send_to_boss`; successful delivery shows **Sent to Elon**. Configure the server-only OpenAI and ops webhook variables in `.env.example` (`gpt-realtime` by default). The browser receives only a short-lived Realtime credential. Setup follows the [OpenAI Realtime WebRTC API](https://developers.openai.com/api/docs/guides/voice-webrtc).

Elon (formerly Boss / Grok Bot) can POST `{ "text": "Reply", "imageUrls": ["https://…"] }` to `/api/os/<key>/voice/boss/inbox`, using Bearer `BOSS_VOICE_INBOX_TOKEN` (or the webhook token). The open sheet polls every 2.5 seconds and displays Elon text and HTTPS images, queues each inbox id once per open sheet, and asks Realtime to read it aloud after the current response finishes. Images without text get a brief announcement without invented captions. Inbox retention is one hour / 50 replies per owner, in process memory: restarts lose replies and separate server instances do not share them. Use a shared store for reliable delivery across instances. Closing Live stops the microphone; reopen to see and hear retained replies.

User bubbles use completed transcripts only; empty entries, punctuation, and short non-Latin noise fragments are hidden. Echo cancellation and noise suppression are requested. While Live audio plays, microphone transmission pauses to prevent speaker echo and self-interruption (wait for Live to finish before speaking). Muting suppresses incoming transcription and clears buffered input; iOS may still display its microphone indicator while the connection owns the track. Closing Live releases it.

For iPhone Action Button → Shortcuts → **Open URL**, use:

```text
https://wallerstedt.live/bolag/<key>/live
```

Replace `<key>` with your Bolag access key. This route opens the sheet, requests the microphone and connects automatically, without loading overview data or dashboard prefetches. It uses the normal owner session; if signed out, sign in on that same URL and Live continues automatically. Safari and the Home Screen app may have separate sessions. If iOS blocks automatic microphone access, close the sheet and tap the mic to retry; if playback is blocked, use **Tap to hear Live**. The Live footer also contains the direct URL.

### Refreshing the streaming numbers

The Music tab reads `lib/os/music-data.json`, built from a Spotify for Artists
scrape. After a new scrape:

```bash
npm run music:sync
```

It reads `scraped_data.json`, `categories.json` and `earnings_data.json` from
`C:/Claude Code/Spotify scraper Analytics`. Point it somewhere else with a path
argument (a folder or the scrape file itself):

```bash
npm run music:sync -- "D:/exports/2026-09"
```

Earnings come from the DistroKid **all-transactions export** (`results.csv`).
The script takes the newer of the scraper folder's copy and `~/Downloads/results.csv`,
so a freshly downloaded export is picked up without filing it first; pass one
explicitly as a second argument if you want to be sure:

```bash
npm run music:sync -- . ~/Downloads/results.csv
```

An older export can never walk the numbers backwards — the script keeps the
stored one and says so. DistroKid keeps filling a sale month in for about ten
weeks after it ends, so the newest months are marked as still reporting, drawn
faded, and left out of averages: sales falling and the post not having arrived
look identical otherwise.

The rebuild **adds on**: days already in `music-data.json` are kept, the new
scrape only overwrites the days it covers, and a song that has dropped out of the
scrape keeps the streams it earned. Own/label tags come from `categories.json`;
they can also be changed per song in the tab itself, where they are remembered on
that device. The axis stops at the last day every currently streaming song has
reported, so a half-counted final day never reads as a cliff.

### Tasks need a migration

The to-do list is stored in Postgres (`CompanyTask`). Watched TikTok accounts and scan results need `CompanyTikTokAccount` / `CompanyTikTokScan` (same deploy). Saved piano-cover searches per video idea need `CompanyTikTokSearch` (`taskId` unique; Refresh overwrites `query` + `payload`). The daily record reminder lock is `CompanyRecordNudge`. Until the migration is applied the dashboard still works — the task panel just shows a notice instead of failing, and TikTok scan tools ask for the migration:

```bash
npm run prisma:deploy
```

### Task agent API

Tasks can be written by an agent the same way ledger posts can, at
`/api/os/<ACCOUNTING_ACCESS_KEY>/agent/v1`. It takes the same
`ACCOUNTING_AGENT_API_TOKEN` bearer as the accounting agent API, and also
accepts the signed-in dashboard cookie.

```bash
BASE=https://wallerstedt.live/api/os/$ACCOUNTING_ACCESS_KEY/agent/v1

# What the API offers
curl -H "Authorization: Bearer $ACCOUNTING_AGENT_API_TOKEN" "$BASE"

# Add a to-do with a full description
curl -X POST "$BASE/tasks"   -H "Authorization: Bearer $ACCOUNTING_AGENT_API_TOKEN"   -H "Content-Type: application/json"   -d '{
        "title": "Ring revisorn om K10",
        "notes": "Fråga om utdelningsutrymmet för 2026.",
        "area": "admin",
        "priority": "high",
        "dueDate": "2026-09-30"
      }'

# Reprioritise: a partial list moves exactly those to the top, in that order.
# The first three are what the dashboard shows as Focus.
curl -X PATCH "$BASE/tasks" -H "Authorization: Bearer $TOKEN"   -H "Content-Type: application/json" -d '{"ids": ["<id-1>", "<id-2>", "<id-3>"]}'

# Read, change and remove
curl -H "Authorization: Bearer $TOKEN" "$BASE/tasks?status=open&area=admin"
curl -X PATCH "$BASE/tasks/<id>" -H "Authorization: Bearer $TOKEN"   -H "Content-Type: application/json" -d '{"done": true}'
curl -X DELETE "$BASE/tasks/<id>" -H "Authorization: Bearer $TOKEN"
```

`area` is one of `company`, `money`, `music`, `project`, `admin`; `priority` is
`low`, `normal` or `high`. `PATCH` also takes `archived`, which hides a task
from the working list without deleting it.

`list` picks which list a row belongs to: `task` for the to-dos, `video` for
TikTok video ideas. A video idea may carry a `song`, which the dashboard turns
into a one-tap Spotify search beside the row. The two lists are ordered
independently, so reordering one never disturbs the other. `GET /tasks` returns
the active working list in that order — archived Past rows are omitted unless
you pass `archived=1`.

Video ideas use a three-way check on the phone: first tap sets `inProgress`
(`status: "in_progress"`, practicing, gradient outline, pinned to the top);
second tap marks `done`; tapping a done row opens it again. Regular to-dos stay
open ↔ done. `GET /tasks?status=open` includes practicing rows. Max can PATCH
`{ "inProgress": true }` or `{ "status": "in_progress" }`. No extra column —
this reuses `CompanyTask.status`. No Prisma migration.

```bash
curl -X POST "$BASE/tasks" -H "Authorization: Bearer $TOKEN"   -H "Content-Type: application/json"   -d '{"title": "Soluppgång över Vallda, slowed", "list": "video", "song": "Memories"}'

# Active video ideas only, in the same order as the dashboard list
curl -H "Authorization: Bearer $TOKEN" "$BASE/tasks?list=video"
```

A `POST` whose title matches an existing open task
returns that task with `"created": false` instead of duplicating it, so a retry
is safe. Tasks never touch bokföring.

### TikTok watch agent API

Same bearer (`ACCOUNTING_AGENT_API_TOKEN`) and discovery document
(`GET $BASE`). Mirrors the owner TikTok tab — no cookie required. First list
call seeds `friqtao`, `alejs_tunes`, `tonyannn`, `andy_morris`, `willkim_3`,
`jon.piano`, `danny.vega18`, `alkis_ant` if they are missing.

```bash
BASE=https://wallerstedt.live/api/os/$ACCOUNTING_ACCESS_KEY/agent/v1

# Accounts + latest scan payload
curl -H "Authorization: Bearer $ACCOUNTING_AGENT_API_TOKEN" "$BASE/tiktok/watch"

# Add a handle (@ optional). Already-watched handles return the current list.
curl -X POST "$BASE/tiktok/watch" \
  -H "Authorization: Bearer $ACCOUNTING_AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"handle":"tonyannn"}'

# Remove by uuid or handle
curl -X DELETE "$BASE/tiktok/watch/<id-or-handle>" \
  -H "Authorization: Bearer $ACCOUNTING_AGENT_API_TOKEN"

# Scan now — returns immediately; poll GET until scan.status is done
curl -X POST "$BASE/tiktok/watch/scan" \
  -H "Authorization: Bearer $ACCOUNTING_AGENT_API_TOKEN"

# Optional: one account (or resume) under the function time limit
curl -X POST "$BASE/tiktok/watch/scan" \
  -H "Authorization: Bearer $ACCOUNTING_AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"handle":"friqtao"}'
curl -X POST "$BASE/tiktok/watch/scan" \
  -H "Authorization: Bearer $ACCOUNTING_AGENT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scanId":"<uuid>"}'

# Recent stored scans (up to 8). lastScan is the latest completed payload.
curl -H "Authorization: Bearer $ACCOUNTING_AGENT_API_TOKEN" "$BASE/tiktok/watch/scans"
```

`GET /tiktok/watch` returns `{ ok, count, accounts, lastScan, scan }`. Each account is
`{ id, handle, uniqueId, nickname, sortOrder }`. `lastScan` (and each item in
`scans`) is `{ scannedAt, weekKey, routine, accounts, watchAllTime, watchLast7, watchLast30, allTime, last7, last30, pianoLast7, pianoLast30, pianoTrending?, trending? }`.
`watch*` / `allTime` / `last7` / `last30` are tracked-account videos only. `pianoLast7` /
`pianoLast30` are Treg piano-category search results filtered by `createTime`.
`pianoTrending` (`trending`) is the broader piano strip, not limited to 7 or 30 days.
Video rows use `url` `https://www.tiktok.com/@{unique_id}/video/{aweme_id}` plus
`coverUrl`, `playCount`, `diggCount`, and `song` when the caption names one.

`scan` is `{ scanId, status, processed, total, nextHandle, next, error }`.
`status` is `started`, `running`, `done`, or `failed`. `next` is
`{ handle, accountId }` for the next pending account, or `null`.

`POST /tiktok/watch/scan` no longer waits for every Treg call. It returns
immediately:

```json
{
  "ok": true,
  "status": "started",
  "scanId": "<uuid>",
  "processed": 0,
  "total": 8,
  "next": { "handle": "friqtao", "accountId": "<uuid>" },
  "scan": {
    "scanId": "<uuid>",
    "status": "started",
    "processed": 0,
    "total": 8,
    "nextHandle": "friqtao",
    "next": { "handle": "friqtao", "accountId": "<uuid>" },
    "error": null
  },
  "lastScan": null
}
```

Poll `GET /tiktok/watch` or `GET /tiktok/watch/scans` until `scan.status` is
`done` (then `lastScan` is the ranked payload, including `pianoLast7` /
`pianoLast30`) or `failed`. After the watch-list accounts, later bursts run
one piano-category Treg search each. Body options:

- `{}` — start (or join) a full watch-list job
- `{ "handle" }` / `{ "accountId" }` — process that one watched account
- `{ "scanId" }` — process the next burst if the background chain stalled


## Bookkeeping web push (iPhone Home Screen)

The accounting app can send a notification when a ledger post is created, edited, or deleted (from the vault, AI approval, the agent API, or desktop sync). Tapping the notice opens that post. If the post was deleted, the app shows a short “posten är raderad” state instead of a blank editor. iOS 16.4+ only delivers Web Push to a Home Screen PWA (`display: standalone`, a service worker, and permission from a tap). Safari tabs cannot subscribe. There is no permission prompt on first visit; the opt-in lives under **Mer**.

### Environment variables

Set these in Vercel. Do not commit the keys.

```bash
# Generate once: npx web-push generate-vapid-keys
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:contact.wallerstedt@gmail.com
```

`VAPID_SUBJECT` can be a `mailto:` address or `https://wallerstedt.live`. Optional: `NEXT_PUBLIC_SITE_URL` if notification links should point somewhere other than production.

Subscriptions are stored in Postgres (`WebPushSubscription`). After deploy, apply the migration:

```bash
npm run prisma:deploy
```

On Windows against the linked production database:

```powershell
npm.cmd run prisma:deploy:local
```

### Test on iPhone

1. Deploy with the VAPID variables and the migration applied.
2. Open the bookkeeping vault in Safari (not in-app browsers).
3. Share → **Add to Home Screen** → Add.
4. Open **Bokföring** from the Home Screen (not from Safari) and sign in.
5. Go to **Mer** and tap **Slå på aviseringar**. Allow the prompt.
6. Create, edit, or delete a post (or approve an AI draft). The phone should show **Ny post**, **Ändrad**, or **Raderad**, and open that post when tapped. A deleted post shows “Posten är raderad”.

## Daily record reminder (Bolag Home Screen)

Företags-OS can nag the owner every day at **20:00 Europe/Berlin** to go record. Same VAPID keys and `WebPushSubscription` table as bokföring. The copy rotates (“You want that car or no?”, “Your piano won't play itself.”). Tap opens `/bolag/<key>/tiktok`.

iOS 16.4+ only delivers Web Push to the Home Screen PWA. Opt-in lives under **Settings → Record reminders**. A Vercel cron hits `GET /api/os/record-nudge` at 18:00 and 19:00 UTC and sends only when Berlin is 20:00. `CompanyRecordNudge` stores the last Berlin date so a retry does not double-ping.

After deploy, apply the migration (`npm run prisma:deploy`) if it has not already been applied. Then:

1. Open Bolag in Safari → Share → **Add to Home Screen**.
2. Open **Bolag** from the Home Screen and sign in.
3. Go to **Settings** and tap **Enable notifications**.
4. Optionally tap **Send a test**.
