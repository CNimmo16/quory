import { afterEach, describe, expect, it, vi } from "vitest";
import { handleDemoRequest, type DemoEnv } from "./demo";
import { getSchemas } from "@quory/core";
import { applyToBrowserSqlite } from "../src/lib/demo/database";
import { createDemoTestDatabase } from "../test/demo-database";
import { examplePlan } from "../src/lib/demo/examples";
import { generationPlan } from "../test/generation-plan";
const env: DemoEnv = {
  SITE_URL: "https://quory.example",
  OPENAI_API_KEY: "test-server-only",
  DEMO_LIMITER: { limit: async () => ({ success: true }) },
};
const request = (
  path = "generate",
  body: unknown = { description: "An online coffee shop" },
  origin = "https://quory.example",
) =>
  new Request(`https://quory.example/api/demo/${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("demo AI boundary", () => {
  it("enforces same origin, rate limits and configuration before contacting a provider", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await handleDemoRequest(
          request("generate", {}, "https://elsewhere.example"),
          env,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleDemoRequest(request(), {
          ...env,
          DEMO_LIMITER: { limit: async () => ({ success: false }) },
        })
      ).status,
    ).toBe(429);
    expect(
      (
        await handleDemoRequest(request(), {
          ...env,
          OPENAI_API_KEY: undefined,
        })
      ).status,
    ).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects oversized descriptions and bodies including streamed bodies", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await handleDemoRequest(
          request("generate", { description: "x".repeat(241) }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleDemoRequest(
          request("generate", { description: "x".repeat(49_000) }),
          env,
        )
      ).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("validates the database recipe and never returns provider credentials", async () => {
    const plan = generationPlan();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: { content: JSON.stringify(plan) },
            },
          ],
        }),
      ),
    );
    const response = await handleDemoRequest(request(), env);
    expect(response.status).toBe(200);
    const requested = JSON.parse(
      String(vi.mocked(fetch).mock.calls[0]![1]!.body),
    );
    expect(requested.model).toBe("gpt-6-luna");
    expect(requested.reasoning_effort).toBe("none");
    expect(requested.max_completion_tokens).toBe(1400);
    expect(response.headers.get("Server-Timing")).toContain("ai;dur=");
    const body = await response.text();
    expect(body).toContain('"recipe"');
    expect(body).not.toContain("rowsByTable");
    expect(body).not.toContain(env.OPENAI_API_KEY!);
  });
  it("does not leak upstream provider errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("provider error containing a secret");
      }),
    );
    const response = await handleDemoRequest(request(), env);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret");
  });
  it("rejects generated plans with broken foreign keys", async () => {
    const plan = generationPlan();
    plan.tables[2]!.columns[0]![1] = "@missing_table";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: JSON.stringify(plan) } }],
        }),
      ),
    );
    expect((await handleDemoRequest(request(), env)).status).toBe(502);
  });
  it.each(["headers", "body"])(
    "stops a provider stalled on %s after eight seconds",
    async (stage) => {
      vi.useFakeTimers();
      // Node's native AbortSignal.timeout bypasses the fake clock.
      vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
        const controller = new AbortController();
        setTimeout(
          () => controller.abort(new DOMException("Timed out", "TimeoutError")),
          ms,
        );
        return controller.signal;
      });
      const provider = vi.fn((_url, init: RequestInit) => {
        if (stage === "body")
          return Promise.resolve(
            new Response(
              new ReadableStream({
                start(controller) {
                  init.signal!.addEventListener(
                    "abort",
                    () =>
                      controller.error(
                        new DOMException("Aborted", "AbortError"),
                      ),
                    { once: true },
                  );
                },
              }),
            ),
          );
        return new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener(
            "abort",
            () => reject(init.signal!.reason),
            { once: true },
          );
        });
      });
      vi.stubGlobal("fetch", provider);
      const pending = handleDemoRequest(request(), env);
      await vi.waitFor(() => expect(provider).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(8_000);
      const response = await pending;
      expect(response.status).toBe(504);
      expect(await response.text()).toContain("took too long");
      expect(provider.mock.calls[0]![1].signal!.aborted).toBe(true);
    },
  );
  it("translates a free-text relationship query and validates it against the real schema", async () => {
    const driver = await createDemoTestDatabase();
    try {
      applyToBrowserSqlite(driver, examplePlan("shop"));
      const schemas = await getSchemas(driver);
      const plan = {
        tables: [
          {
            tableRef: "main.orders",
            parent: null,
            columns: ["id", "status", "total"],
            filters: [],
            orderBy: [],
          },
          {
            tableRef: "main.customers",
            parent: 0,
            columns: ["email"],
            filters: [
              {
                column: "email",
                operator: "=",
                value: "alex.morgan@example.com",
              },
            ],
            orderBy: [],
          },
        ],
        limit: 50,
        error: "",
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            choices: [{ message: { content: JSON.stringify(plan) } }],
          }),
        ),
      );
      const response = await handleDemoRequest(
        request("query", {
          prompt: "Show orders for alex.morgan@example.com",
          schemas,
        }),
        env,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        query: {
          base: {
            tableRef: string;
            joins: { where: { conditions: { value: string }[] } }[];
          };
        };
      };
      expect(body.query.base.tableRef).toBe("main.orders");
      expect(body.query.base.joins[0]!.where.conditions[0]!.value).toBe(
        "alex.morgan@example.com",
      );
      const requested = JSON.parse(
        String(vi.mocked(fetch).mock.calls[0]![1]!.body),
      );
      expect(requested.model).toBe("gpt-6-luna");
      expect(requested.reasoning_effort).toBe("none");
      expect(requested.response_format.type).toBe("json_schema");
      expect(requested.response_format.json_schema.strict).toBe(true);
      const { filters: _filters, ...withoutFilters } = plan.tables[0]!;
      const incompletePlan = {
        ...plan,
        tables: [withoutFilters, plan.tables[1]!],
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            choices: [{ message: { content: JSON.stringify(incompletePlan) } }],
          }),
        ),
      );
      expect(
        (
          await handleDemoRequest(
            request("query", { prompt: "Show delayed orders", schemas }),
            env,
          )
        ).status,
      ).toBe(422);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            choices: [{ message: { content: JSON.stringify(plan) } }],
          }),
        ),
      );
      plan.tables[0]!.columns = ["invented_column"];
      expect(
        (
          await handleDemoRequest(
            request("query", { prompt: "Show orders", schemas }),
            env,
          )
        ).status,
      ).toBe(422);
    } finally {
      await driver.teardown();
    }
  });
  it("returns a clear explanation for an unsupported query without inventing results", async () => {
    const driver = await createDemoTestDatabase();
    try {
      applyToBrowserSqlite(driver, examplePlan("shop"));
      const schemas = await getSchemas(driver);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    error:
                      "This playground supports read-only queries. Try showing all orders.",
                  }),
                },
              },
            ],
          }),
        ),
      );
      const response = await handleDemoRequest(
        request("query", { prompt: "Delete all customers", schemas }),
        env,
      );
      expect(response.status).toBe(422);
      expect(await response.text()).toContain("read-only");
    } finally {
      await driver.teardown();
    }
  });
});
