# wallerstedt.live

Artist site for [Wallerstedt](https://wallerstedt.live). The public catalog is edited in `/admin`. Adding a song there is what publishes a new piece.

## Web Push (iPhone Home Screen PWA)

Visitors who add the site to their iPhone Home Screen can opt in to a notification when a new song is published. There is no permission prompt on first visit. The opt-in lives on `/updates`.

iOS 16.4+ only delivers Web Push to a real Home Screen app (`display: standalone`, a service worker, and permission from a tap). Safari tabs cannot subscribe.

### Environment variables

Set these in Vercel (Production and Preview). Do not commit the keys.

```bash
# Generate once: npx web-push generate-vapid-keys
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:contact.wallerstedt@gmail.com
```

`VAPID_SUBJECT` can be a `mailto:` address or `https://wallerstedt.live`. Optional: `NEXT_PUBLIC_SITE_URL` if notification links should point somewhere other than `https://wallerstedt.live` (local/preview).

Subscriptions are stored in Postgres (`WebPushSubscription`). After deploy, apply the migration:

```bash
npm run prisma:deploy
```

### Test on iPhone

1. Deploy with the VAPID variables and the migration applied.
2. Open https://wallerstedt.live in Safari (not in-app browsers).
3. Share → **Add to Home Screen** → Add.
4. Open **Wallerstedt** from the Home Screen (not from Safari).
5. Go to **Updates** (footer) and tap **Enable notifications**. Allow the prompt.
6. In `/admin`, add a song. The phone should show the song title, a short body, and open that song when tapped.

Desktop Chrome can also enable notifications from `/updates` without installing, which is useful for a smoke test of subscribe + send.
