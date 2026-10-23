import { handleDemoRequest, type DemoEnv } from "./demo";

export interface Env extends DemoEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  SIGNUP_LIMITER: RateLimit;
  SITE_URL: string;
  SITE_DOMAIN: string;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
}

const accepted = {
  message:
    "Check your inbox for a confirmation link. If you’ve already confirmed, you’re all set.",
};
const consentVersion = "quory-cloud-updates-2026-10-16";
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

async function digest(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Bound the actual body, including requests without a Content-Length header.
async function readBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

async function signup(
  body: Record<string, unknown>,
  request: Request,
  env: Env,
) {
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const source = body.source;
  if (
    email.length > 254 ||
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email) ||
    !["download", "cloud"].includes(String(source))
  ) {
    return json({ error: "Enter a valid email address." }, 400);
  }
  if (!env.TURNSTILE_SECRET_KEY || !env.RESEND_API_KEY || !env.SITE_DOMAIN)
    return json(
      { error: "Signup is temporarily unavailable. Please try again later." },
      503,
    );
  if (
    typeof body.turnstileToken !== "string" ||
    !body.turnstileToken ||
    body.turnstileToken.length > 2048
  ) {
    return json(
      { error: "Please complete the verification and try again." },
      400,
    );
  }
  const verification = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: body.turnstileToken,
        remoteip: request.headers.get("CF-Connecting-IP") ?? undefined,
      }),
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    },
  );
  const challenge = (await verification.json()) as {
    success?: boolean;
    hostname?: string;
    action?: string;
  };
  if (
    !verification.ok ||
    !challenge.success ||
    challenge.hostname !== new URL(env.SITE_URL).hostname ||
    challenge.action !== "waitlist"
  ) {
    return json({ error: "Verification failed. Please try again." }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const tokenHash = await digest(token);
  // Atomic claim: concurrent submissions cannot send multiple messages. Confirmed
  // contacts are never reset, and pending contacts can retry after ten minutes.
  const claimed = await env.DB.prepare(
    `
    INSERT INTO signups (email, source, consent_version, created_at, requested_at, token_hash, token_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET requested_at = excluded.requested_at,
      token_hash = excluded.token_hash, token_expires_at = excluded.token_expires_at,
      email_sent_at = NULL
    WHERE signups.confirmed_at IS NULL AND signups.requested_at <= ?
    RETURNING email
  `,
  )
    .bind(
      email,
      source,
      consentVersion,
      now,
      now,
      tokenHash,
      now + 86400,
      now - 600,
    )
    .first();
  if (!claimed) return json(accepted);

  const confirmationURL = `${new URL(env.SITE_URL).origin}/confirm/#${token}`;
  try {
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `quory-confirmation/${tokenHash}`,
      },
      body: JSON.stringify({
        to: email,
        from: `Quory <hello@${env.SITE_DOMAIN}>`,
        subject: "Confirm your interest in Quory Cloud",
        text: `Thanks for your interest in Quory Cloud. Confirm your email to receive updates:\n\n${confirmationURL}\n\nThis link expires in 24 hours. If you didn’t request this, you can ignore this email. Your desktop download does not depend on confirming.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!sent.ok) throw new Error("Email send failed");
    const result = (await sent.json()) as { id?: string };
    if (typeof result.id !== "string" || !result.id)
      throw new Error("Email send was not acknowledged");
  } catch {
    // Keep the signup, but release the claim so a failed send can be retried.
    await env.DB.prepare(
      "UPDATE signups SET requested_at = 0 WHERE email = ? AND token_hash = ? AND confirmed_at IS NULL",
    )
      .bind(email, tokenHash)
      .run();
    return json(
      {
        error:
          "We couldn’t send the confirmation email. Please try again, or skip to download.",
      },
      503,
    );
  }
  await env.DB.prepare(
    "UPDATE signups SET email_sent_at = ? WHERE email = ? AND token_hash = ?",
  )
    .bind(now, email, tokenHash)
    .run();
  return json(accepted);
}

async function confirm(body: Record<string, unknown>, env: Env) {
  if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token))
    return json(
      {
        error:
          "This confirmation link is invalid or expired. Please sign up again.",
      },
      400,
    );
  const tokenHash = await digest(body.token);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `UPDATE signups SET confirmed_at = COALESCE(confirmed_at, ?)
    WHERE token_hash = ? AND (token_expires_at > ? OR confirmed_at IS NOT NULL)
    RETURNING confirmed_at`,
  )
    .bind(now, tokenHash, now)
    .first();
  return row
    ? json({
        message: "You’re on the list. We’ll keep you posted about Quory Cloud.",
      })
    : json(
        {
          error:
            "This confirmation link is invalid or expired. Please sign up again.",
        },
        400,
      );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/demo/")) return handleDemoRequest(request, env);
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (path !== "/api/signup" && path !== "/api/confirm")
      return json({ error: "Not found." }, 404);
    if (request.method !== "POST")
      return new Response(null, {
        status: 405,
        headers: { Allow: "POST", "Cache-Control": "no-store" },
      });
    try {
      if (request.headers.get("Origin") !== new URL(env.SITE_URL).origin)
        return json({ error: "Request not allowed." }, 403);
      const { success } = await env.SIGNUP_LIMITER.limit({
        key: `${path}:${request.headers.get("CF-Connecting-IP") ?? "local"}`,
      });
      if (!success)
        return json(
          { error: "Too many attempts. Please wait a minute and try again." },
          429,
        );
      const body = await readBody(request);
      if (!body) return json({ error: "Invalid request." }, 400);
      return path === "/api/signup"
        ? await signup(body, request, env)
        : await confirm(body, env);
    } catch {
      // Do not log request bodies, email addresses, tokens, or provider errors.
      return json(
        { error: "Signup is temporarily unavailable. Please try again later." },
        503,
      );
    }
  },
} satisfies ExportedHandler<Env>;
