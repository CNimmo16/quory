import { readFile, writeFile } from "node:fs/promises";
import { siteSettings } from "./site-config.mjs";

const required = [
  "CLOUDFLARE_ACCOUNT_ID",
  "D1_DATABASE_ID",
  "SITE_DOMAIN",
  "PUBLIC_TURNSTILE_SITE_KEY",
];
for (const name of required)
  if (!process.env[name])
    throw new Error(`Missing production environment setting: ${name}`);
const site = siteSettings(process.env.SITE_DOMAIN);
if (!/^[a-f0-9-]{36}$/i.test(process.env.D1_DATABASE_ID))
  throw new Error("D1_DATABASE_ID must be a UUID.");
if (/^[123]x000/.test(process.env.PUBLIC_TURNSTILE_SITE_KEY))
  throw new Error("Production cannot use a Turnstile test site key.");
const config = JSON.parse(
  await readFile(new URL("../wrangler.json", import.meta.url), "utf8"),
);
config.account_id = process.env.CLOUDFLARE_ACCOUNT_ID;
const production = config.env.production;
production.vars = site;
production.d1_databases = [
  {
    binding: "DB",
    database_name: "quory-marketing-production",
    database_id: process.env.D1_DATABASE_ID,
    migrations_dir: "migrations",
  },
];
// Attach the root hostname to this same Worker on deploy. Cloudflare manages
// the Custom Domain's DNS record and TLS certificate.
production.routes = [{ pattern: site.SITE_DOMAIN, custom_domain: true }];
await writeFile(
  new URL("../wrangler.deploy.json", import.meta.url),
  JSON.stringify(config, null, 2),
);
