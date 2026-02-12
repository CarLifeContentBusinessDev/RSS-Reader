import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  const { url: targetUrl } = request.query;

  if (!targetUrl || typeof targetUrl !== "string") {
    return response.status(400).json({ error: "Missing url query parameter." });
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
    });

    if (!upstream.ok) {
      return response
        .status(upstream.status)
        .send(
          `Failed to fetch RSS: ${upstream.statusText}`
        );
    }

    const contentType =
      upstream.headers.get("content-type") ||
      "application/xml; charset=utf-8";
    response.setHeader("Content-Type", contentType);

    const body = await upstream.text();
    return response.status(200).send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return response.status(502).json({ error: `Proxy error: ${message}` });
  }
}
