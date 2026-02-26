import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

interface IncomingMessageWithBody extends IncomingMessage {
  body?: {
    folder?: string;
    filename?: string;
    contentType?: string;
    file?: string;
  };
}
const rssProxy = (env: Record<string, string>): Plugin => ({
  name: "rss-proxy",
  configureServer(server) {
    server.middlewares.use(
      "/api/uploadImage",
      async (req: IncomingMessageWithBody, res: ServerResponse) => {
        console.log("[uploadImage] 요청 들어옴");

        process.env.CLOUDFLARE_R2_ENDPOINT = env.CLOUDFLARE_R2_ENDPOINT;
        process.env.CLOUDFLARE_R2_BUCKET = env.CLOUDFLARE_R2_BUCKET;
        process.env.CLOUDFLARE_R2_ACCESS_KEY_ID =
          env.CLOUDFLARE_R2_ACCESS_KEY_ID;
        process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY =
          env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
        process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL =
          env.CLOUDFLARE_R2_PUBLIC_BASE_URL;

        const { default: handler } = await import("./api/uploadImage.ts");
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", async () => {
          try {
            req.body = JSON.parse(body);
          } catch {
            req.body = {};
          }
          try {
            await handler(req, res);
          } catch (e) {
            console.error("[uploadImage] handler error:", e);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: "uploadImage handler error",
                details: e instanceof Error ? e.message : String(e),
              }),
            );
          }
        });
      },
    );

    server.middlewares.use("/api/rss", async (req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "", "http://localhost");
        const targetUrl = requestUrl.searchParams.get("url");

        if (!targetUrl) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Missing url query parameter.");
          return;
        }

        const upstream = await fetch(targetUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
          },
        });

        res.statusCode = upstream.status;
        res.setHeader(
          "Content-Type",
          upstream.headers.get("content-type") ||
            "application/xml; charset=utf-8",
        );

        const body = await upstream.text();
        res.end(body);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        res.statusCode = 502;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(`Proxy error: ${message}`);
      }
    });

    server.middlewares.use("/api/download", async (req, res) => {
      try {
        const requestUrl = new URL(req.url ?? "", "http://localhost");
        const targetUrl = requestUrl.searchParams.get("url");

        if (!targetUrl) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Missing url query parameter.");
          return;
        }

        const upstream = await fetch(targetUrl);
        res.statusCode = upstream.status;
        res.setHeader(
          "Content-Type",
          upstream.headers.get("content-type") || "application/octet-stream",
        );
        const contentLength = upstream.headers.get("content-length");
        if (contentLength) {
          res.setHeader("Content-Length", contentLength);
        }
        const disposition = upstream.headers.get("content-disposition");
        if (disposition) {
          res.setHeader("Content-Disposition", disposition);
        }

        if (!upstream.body) {
          res.end();
          return;
        }

        Readable.fromWeb(upstream.body).pipe(res);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        res.statusCode = 502;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(`Proxy error: ${message}`);
      }
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [tailwindcss(), react(), rssProxy(env)],
  };
});
