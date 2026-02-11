import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const rssProxy = (): Plugin => ({
  name: "rss-proxy",
  configureServer(server) {
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
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), rssProxy()],
});
