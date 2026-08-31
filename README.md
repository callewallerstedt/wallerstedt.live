# wallerstedt.live

Artist site for [Wallerstedt](https://wallerstedt.live), plus a private bookkeeping PWA at `/vault/<ACCOUNTING_ACCESS_KEY>`.

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
