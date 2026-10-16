import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPlatformProxy, type PlatformProxy } from "wrangler";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import worker, { type Env } from "./index";

let proxy: PlatformProxy<Env>;
let env: Env;
const send = vi.fn();
const limit = vi.fn();
const verify = vi.fn();
const origin = "https://quory.example";
const request = (body: unknown, path = "/api/signup", headers = {}) =>
  new Request(`${origin}${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const signup = (email = "hello@example.com") => ({
  email,
  source: "download",
  turnstileToken: "test-token",
});
const tokenFromEmail = () =>
  send.mock.calls[0][0].text.match(/\/confirm\/#([a-f0-9]{64})/)[1];

beforeAll(async () => {
  proxy = await getPlatformProxy<Env>({
    configPath: fileURLToPath(new URL("../wrangler.json", import.meta.url)),
    persist: false,
    remoteBindings: false,
  });
  const sql = await readFile(
    new URL("../migrations/0001_signups.sql", import.meta.url),
    "utf8",
  );
  await proxy.env.DB.batch(
    sql
      .split(";")
      .filter((q) => q.trim())
      .map((q) => proxy.env.DB.prepare(q)),
  );
}, 30000);
afterAll(async () => {
  await proxy?.dispose();
});
beforeEach(async () => {
  await proxy.env.DB.prepare("DELETE FROM signups").run();
  send
    .mockReset()
    .mockImplementation(async () => Response.json({ id: "test-email" }));
  limit.mockReset().mockResolvedValue({ success: true });
  verify.mockReset().mockImplementation(async () =>
    Response.json({
      success: true,
      hostname: "quory.example",
      action: "waitlist",
    }),
  );
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    if (url === "https://api.resend.com/emails")
      return send(JSON.parse(init.body as string), init);
    if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify")
      return verify(url, init);
    throw new Error(`Unexpected network request: ${url}`);
  });
  env = {
    ...proxy.env,
    SIGNUP_LIMITER: { limit },
    SITE_URL: origin,
    SITE_DOMAIN: "quory.example",
    RESEND_API_KEY: "test-resend-secret",
    TURNSTILE_SECRET_KEY: "test-secret",
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signup endpoint with local D1", () => {
  it("stores a normalized pending signup, hashes its token, and confirms only on POST", async () => {
    expect(
      (await worker.fetch(request(signup("  Hello@Example.com  ")), env))
        .status,
    ).toBe(200);
    const row = await env.DB.prepare("SELECT * FROM signups").first();
    expect(row).toMatchObject({
      email: "hello@example.com",
      source: "download",
      confirmed_at: null,
    });
    const token = tokenFromEmail();
    expect(row!.token_hash).not.toBe(token);
    expect(send.mock.calls[0][0].to).toBe("hello@example.com");
    expect(send.mock.calls[0][0].from).toBe("Quory <hello@quory.example>");
    expect(send.mock.calls[0][0].text).toContain(`${origin}/confirm/#${token}`);
    expect(send.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer test-resend-secret",
      "Idempotency-Key": `quory-confirmation/${row!.token_hash}`,
    });
    expect(
      (
        await worker.fetch(
          new Request(`${origin}/api/confirm?token=${token}`),
          env,
        )
      ).status,
    ).toBe(405);
    expect(
      (await worker.fetch(request({ token }, "/api/confirm"), env)).status,
    ).toBe(200);
    expect(
      (await env.DB.prepare("SELECT confirmed_at FROM signups").first())!
        .confirmed_at,
    ).toBeTypeOf("number");
    // Confirmation is idempotent, and signing up again never resets it.
    expect(
      (await worker.fetch(request({ token }, "/api/confirm"), env)).status,
    ).toBe(200);
    await worker.fetch(request(signup()), env);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("deduplicates simultaneous and case-insensitive submissions", async () => {
    await Promise.all([
      worker.fetch(request(signup()), env),
      worker.fetch(request(signup("HELLO@example.com")), env),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (await env.DB.prepare("SELECT COUNT(*) AS count FROM signups").first())!
        .count,
    ).toBe(1);
  });
  it("retains failed signups and allows a retry when sending fails", async () => {
    send.mockRejectedValueOnce(
      new Error("provider failure containing sensitive data"),
    );
    const failed = await worker.fetch(request(signup()), env);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("sensitive");
    expect(
      await env.DB.prepare(
        "SELECT requested_at, email_sent_at FROM signups",
      ).first(),
    ).toMatchObject({ requested_at: 0, email_sent_at: null });
    expect((await worker.fetch(request(signup()), env)).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("resends after cooldown and invalidates the old token", async () => {
    await worker.fetch(request(signup()), env);
    const oldToken = tokenFromEmail();
    await env.DB.prepare("UPDATE signups SET requested_at = 0").run();
    await worker.fetch(request(signup()), env);
    expect(send).toHaveBeenCalledTimes(2);
    expect(
      (await worker.fetch(request({ token: oldToken }, "/api/confirm"), env))
        .status,
    ).toBe(400);
  });
  it.each([401, 429, 500])(
    "handles Resend HTTP %s without exposing provider details",
    async (status) => {
      send.mockResolvedValueOnce(
        Response.json({ message: "private provider detail" }, { status }),
      );
      const failed = await worker.fetch(request(signup()), env);
      expect(failed.status).toBe(503);
      expect(await failed.text()).not.toContain("private provider detail");
      expect(
        await env.DB.prepare(
          "SELECT requested_at, email_sent_at FROM signups",
        ).first(),
      ).toMatchObject({ requested_at: 0, email_sent_at: null });
      expect((await worker.fetch(request(signup()), env)).status).toBe(200);
    },
  );
  it("does not mark an unacknowledged email as sent", async () => {
    send.mockResolvedValueOnce(Response.json({}));
    expect((await worker.fetch(request(signup()), env)).status).toBe(503);
    expect(
      await env.DB.prepare("SELECT email_sent_at FROM signups").first(),
    ).toMatchObject({ email_sent_at: null });
  });
  it("rejects signup before network calls or storage when the Resend key is absent", async () => {
    env.RESEND_API_KEY = "";
    expect((await worker.fetch(request(signup()), env)).status).toBe(503);
    expect(verify).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM signups").first(),
    ).toMatchObject({ count: 0 });
  });
  it("rejects expired or invalid confirmation tokens", async () => {
    await worker.fetch(request(signup()), env);
    await env.DB.prepare("UPDATE signups SET token_expires_at = 0").run();
    expect(
      (
        await worker.fetch(
          request({ token: tokenFromEmail() }, "/api/confirm"),
          env,
        )
      ).status,
    ).toBe(400);
    expect(
      (await worker.fetch(request({ token: "bad" }, "/api/confirm"), env))
        .status,
    ).toBe(400);
  });
  it("rejects invalid input, cross-origin requests, and large bodies before storage", async () => {
    expect(
      (await worker.fetch(request(signup("not-an-email")), env)).status,
    ).toBe(400);
    expect(
      (await worker.fetch(request({ ...signup(), source: "other" }), env))
        .status,
    ).toBe(400);
    expect(
      (
        await worker.fetch(
          request(signup(), "/api/signup", {
            Origin: "https://elsewhere.example",
          }),
          env,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await worker.fetch(
          request({ ...signup(), extra: "x".repeat(4096) }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
  it("requires a valid Turnstile token for the correct hostname and action", async () => {
    for (const result of [
      { success: false },
      { success: true, hostname: "evil.example", action: "waitlist" },
      { success: true, hostname: "quory.example", action: "other" },
    ]) {
      verify.mockResolvedValueOnce(Response.json(result));
      expect((await worker.fetch(request(signup()), env)).status).toBe(400);
    }
    expect(send).not.toHaveBeenCalled();
    expect(
      (await env.DB.prepare("SELECT COUNT(*) AS count FROM signups").first())!
        .count,
    ).toBe(0);
  });
  it("enforces rate limits before verification or writes", async () => {
    limit.mockResolvedValue({ success: false });
    expect((await worker.fetch(request(signup()), env)).status).toBe(429);
    expect(verify).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it("serves assets and rejects unknown API routes", async () => {
    const assets = vi.fn().mockResolvedValue(new Response("static page"));
    env.ASSETS = { fetch: assets } as unknown as Env["ASSETS"];
    expect(await (await worker.fetch(new Request(origin), env)).text()).toBe(
      "static page",
    );
    expect(
      (await worker.fetch(new Request(`${origin}/api/unknown`), env)).status,
    ).toBe(404);
  });
});
