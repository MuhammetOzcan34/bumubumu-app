import { onRequest } from "firebase-functions/v2/https";
import * as corsLib from "cors";

const cors = corsLib({ origin: true });

export const fetchOgImage = onRequest(
  {
    cors: true,
    minInstances: 0,
    maxInstances: 10,
    memory: "256MiB"
  },
  (req, res) => {
    cors(req, res, async () => {
      const targetUrl = (req.query.url || req.body.url) as string;
      if (!targetUrl) {
        res.status(400).json({ error: "URL is required" });
        return;
      }

      try {
        const response = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Sec-Ch-Ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": "\"Windows\"",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1"
          }
        });

        if (!response.ok) {
          res.status(response.status).json({ error: `Target URL returned status: ${response.status}` });
          return;
        }

        const html = await response.text();

        const ogPattern = /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i;
        const ogPatternAlt = /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i;
        const twitterPattern = /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i;
        const twitterPatternAlt = /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i;
        const relPattern = /<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["']/i;

        const match = html.match(ogPattern) || html.match(ogPatternAlt) || html.match(twitterPattern) || html.match(twitterPatternAlt) || html.match(relPattern);
        const imageUrl = match ? match[1] : null;

        if (!imageUrl) {
          res.status(404).json({ error: "OpenGraph image metadata not found" });
          return;
        }

        res.json({ imageUrl });
      } catch (err: any) {
        console.error("fetchOgImage error:", err);
        res.status(500).json({ error: err.message || "Internal Server Error" });
      }
    });
  }
);
