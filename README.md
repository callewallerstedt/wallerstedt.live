# wallerstedt.live

Artist site for [Wallerstedt](https://wallerstedt.live), plus a private bookkeeping PWA at `/vault/<ACCOUNTING_ACCESS_KEY>` and the owner company app at `/bolag/<ACCOUNTING_ACCESS_KEY>`. The company app is the canonical place for vault/bokföring plus the other owner tabs. Sign in with the same owner password. The secret key stays in the address bar. Bare `/bolag` is not a public page — missing or wrong keys 404 like `/vault`. The Home Screen PWA at `/vault/<key>` still works.

## Company dashboard (`/bolag/<key>`)

Six tabs, a collapsible sidebar on desktop and a fixed tab bar on phones:

| Tab | What it holds |
| --- | --- |
| **Overview** | Focus first — the ranked to-do list, drag a number to reprioritise — then cash, this month's revenue and result, estimated bolagsskatt, the running-result curve, upcoming tax and the latest entries |
| **Tasks** | The owner's own to-do list plus everything the ledger and repos flag, and the dates ahead |
| **Bokföring** | The full vault app, embedded in the dashboard shell |
| **Money** | Ledger, expense breakdown, repeating costs, income by description, tax, missing receipts, and the personal trading book kept clearly apart |
| **Music** | Spotify for Artists export, DistroKid payouts and the release calendar |
| **Settings** | Theme, accent, company details, data sources and sign-out |

The header holds only the logo; pressing it drops down the registry details
(org.nr, momsnummer, verksamhetsbeskrivning, säte) with a copy button on each.

`Content`, `Customers`, `Accounting`, `Investments`, `Wealth`, `Upcoming`, `Alerts` and `Projects` were merged away; their URLs redirect rather than 404.

### Tasks need a migration

The to-do list is stored in Postgres (`CompanyTask`). Until the migration is applied the dashboard still works — the task panel just shows a notice instead of failing:

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
independently, so reordering one never disturbs the other.

```bash
curl -X POST "$BASE/tasks" -H "Authorization: Bearer $TOKEN"   -H "Content-Type: application/json"   -d '{"title": "Soluppgång över Vallda, slowed", "list": "video", "song": "Memories"}'

curl -H "Authorization: Bearer $TOKEN" "$BASE/tasks?list=video"
``` A `POST` whose title matches an existing open task
returns that task with `"created": false` instead of duplicating it, so a retry
is safe. Tasks never touch bokföring.


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
