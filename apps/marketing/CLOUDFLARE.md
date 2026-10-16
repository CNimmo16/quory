# Cloudflare hosting and email signup

The Astro output and one small Worker deploy as `quory-marketing-production`.
The Worker stores addresses in D1 and sends a confirmation email through Resend.
Both forms collect interest in **Quory Cloud**, matching their copy;
`source` records whether a signup came from the download modal or Cloud section.

## One-time setup

1. Create the GitHub environment **production** under Settings → Environments.
   Optionally restrict it to `main` and add reviewers. Put all the values below
   in this environment, not repository-wide settings.
2. Create a D1 database named `quory-marketing-production`. Copy its database ID.
   The workflow creates the schema through migrations; do not create tables by hand.
3. Verify the exact `SITE_DOMAIN` in Resend by adding its required DNS records.
   Create a Resend API key with sending access for that domain. Confirmation
   emails always come from `Quory <hello@SITE_DOMAIN>`.
4. Create a **Managed Turnstile** widget with your website hostname allowed.
   Copy its site key and secret. This protects the public endpoint from being
   used to send unwanted confirmation emails.
5. Add the production settings below, then run the Marketing workflow on `main`.
6. For a custom website domain, attach it to `quory-marketing-production` under
   Workers → Settings → Domains & Routes → Add → Custom Domain. Set `SITE_DOMAIN`
   to that hostname, without `https://` or a trailing slash. The deployment
   derives `SITE_URL` as `https://SITE_DOMAIN` for the Worker and Astro build.
   The signup API accepts only the configured origin.
7. Submit your own email once on the deployed site and follow the confirmation
   link. Verify `confirmed_at` is set in D1. Check the Resend email logs
   if the message does not arrive. This live check requires your account setup;
   local tests mock email sending.

**Cost:** Resend's free tier currently includes 3,000 emails per month with a
100-email daily limit. Cloudflare Workers and D1 can use their free tiers within
their quotas; Cloudflare Email Service is not used. When Resend rejects a send,
the form offers a retry and downloads can still be skipped straight through.
See [Resend pricing](https://resend.com/pricing) and
[domain setup](https://resend.com/docs/dashboard/domains/introduction).

## GitHub `production` settings

Environment **secrets**:

| Name                   | Value                                                                           |
| ---------------------- | ------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` | Account-scoped token with Workers Scripts: Edit and D1: Edit. Already supplied. |
| `RESEND_API_KEY`       | Resend API key with sending access to `SITE_DOMAIN`. Already supplied.          |
| `TURNSTILE_SECRET_KEY` | Secret for the production Turnstile widget.                                     |

Environment **variables** (not secrets):

| Name                        | Value                                                                         |
| --------------------------- | ----------------------------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID`     | Your Cloudflare account ID. Already supplied.                                 |
| `D1_DATABASE_ID`            | UUID of the production D1 database.                                           |
| `SITE_DOMAIN`               | Canonical hostname, e.g. `quory.example`. Verify this exact domain in Resend. |
| `PUBLIC_TURNSTILE_SITE_KEY` | Public key for the production Turnstile widget.                               |

The deploy script generates an ignored `wrangler.deploy.json` from these values.
The Turnstile and Resend secrets are placed in a temporary file and uploaded with
`wrangler deploy --secrets-file`, then the file is removed. Only the public
Turnstile key is included in browser code. The deployment token needs no DNS
permissions because custom domains and email-domain onboarding are manual.
`SITE_URL` is an internal derived value, not a GitHub setting. There is no
`EMAIL_FROM` setting. Remove either old environment variable if previously added.

## Local development and checks

The marketing package pins Node 22 for Wrangler; desktop packages retain their
existing runtime. `pnpm install` installs both required runtimes.

```sh
pnpm --filter @quory/marketing check:worker
pnpm --filter @quory/marketing test:worker
pnpm --filter @quory/marketing build
pnpm --filter @quory/marketing exec wrangler deploy --dry-run --env=""
pnpm --filter @quory/marketing exec wrangler d1 migrations apply DB --local
pnpm --filter @quory/marketing dev:worker
```

Visit `http://localhost:8787` for the static site plus API. The regular Astro
server on port 4321 remains useful for UI work but does not serve the Worker API.
Local Wrangler uses its own D1 database under `.wrangler/`; it does not modify
production. Without `RESEND_API_KEY`, signup returns an unavailable response
before storing an address or sending mail.

For manual form verification, use a separate development Turnstile widget that
allows `localhost`, build with its `PUBLIC_TURNSTILE_SITE_KEY`, and put its secret
in `.dev.vars`. To intentionally test delivery, also set a Resend key and a
verified `SITE_DOMAIN` in `.dev.vars`; this sends real emails even in local
Wrangler. The local `SITE_URL` stays `http://localhost:8787` so confirmation links
return to the local site. Do not add localhost to the production widget.
Automated tests mock Turnstile and Resend, and use a real isolated local D1 database.

## Data and behavior

- `signups` stores one normalized address per email, source, consent-copy version,
  creation/request/confirmation timestamps, a hashed confirmation token, expiry,
  and email-send timestamp. Raw confirmation tokens and IP addresses are not
  stored. The Worker does not log email addresses or request bodies.
- Signups start pending. Confirmation links expire after 24 hours and require a
  deliberate button click. The token is in a URL fragment so it is not sent in
  HTTP request URLs or referrers. A confirmed address is never reset by signup.
- Each IP can make five signup requests per minute per Cloudflare location.
  A pending address receives at most one confirmation every ten minutes.
  Concurrent duplicate submissions claim the D1 row atomically. Failed sends
  retain the signup and release the claim for retry.
- The API validates same-origin requests, bounded JSON bodies, Turnstile
  hostname/action, and email format. It returns generic responses for existing
  addresses. Confirmation and signup responses are not cached.
- Downloading never requires an email, CAPTCHA, or email confirmation. Skip
  bypasses the signup API; entering no email also downloads directly.
- No bulk marketing sender is included. Use only confirmed addresses for future
  updates, and add unsubscribe handling before sending marketing campaigns.

## Export and deletion

Use the D1 console to select confirmed signups:

```sql
SELECT email, source, created_at, confirmed_at
FROM signups
WHERE confirmed_at IS NOT NULL
ORDER BY created_at;
```

For a local JSON export, from `apps/marketing`, generate the deployment config
with the production variables available, then run:

```sh
pnpm exec wrangler d1 execute DB --remote --env production --config wrangler.deploy.json \
  --command "SELECT email, source, created_at, confirmed_at FROM signups WHERE confirmed_at IS NOT NULL ORDER BY created_at" \
  --json > confirmed-signups.json
```

The JSON contains personal data: keep it outside version control. To remove a
contact on request, delete its row in the D1 console. Old unconfirmed rows can be
removed using a chosen retention period; no automatic purge is configured yet.

## Adding staging later

Create a separate GitHub `staging` environment, Worker, D1 database, Turnstile
widget, Resend key, and site domain. Add an explicit `env.staging` block, extend the config
generator, and add a separate deployment job/concurrency group. Do not reuse the
production database or secrets in preview builds. Environment bindings are
intentionally explicit; the current workflow only targets production.
