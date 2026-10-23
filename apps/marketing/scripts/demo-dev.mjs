import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";

// The same API implementation runs in Astro development and the production Worker.
export function demoDevApi() {
  return {
    name: "quory-demo-api",
    configureServer(server) {
      const env = {
        ...loadEnv(
          "development",
          fileURLToPath(new URL("../../../", import.meta.url)),
          "",
        ),
        ...loadEnv(
          "development",
          fileURLToPath(new URL("../", import.meta.url)),
          "",
        ),
        ...process.env,
      };
      const attempts = new Map();
      const limiter = {
        async limit({ key }) {
          const now = Date.now();
          const recent = (attempts.get(key) ?? []).filter(
            (t) => now - t < 60_000,
          );
          recent.push(now);
          attempts.set(key, recent);
          return { success: recent.length <= 10 };
        },
      };
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/demo/")) return next();
        try {
          const { handleDemoRequest } =
            await server.ssrLoadModule("/worker/demo.ts");
          const origin = `http://${req.headers.host}`;
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 80_000) {
              res.writeHead(413);
              res.end(JSON.stringify({ error: "Request too large." }));
              return;
            }
            chunks.push(chunk);
          }
          const controller = new AbortController();
          res.on("close", () => controller.abort());
          const request = new Request(new URL(req.url, origin), {
            method: req.method,
            headers: req.headers,
            ...(!["GET", "HEAD"].includes(req.method)
              ? { body: Buffer.concat(chunks) }
              : {}),
            signal: controller.signal,
          });
          const response = await handleDemoRequest(request, {
            ...env,
            SITE_URL: origin,
            DEMO_LIMITER: limiter,
          });
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
        } catch {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error:
                "The demo service is unavailable. Please try an example product.",
            }),
          );
        }
      });
    },
  };
}
