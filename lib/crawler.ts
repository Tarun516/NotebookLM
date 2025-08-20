// lib/crawler.ts
import * as cheerio from "cheerio";

export type CrawlOptions = {
  maxDepth?: number; // default 2
  maxPages?: number; // default 200
  concurrency?: number; // default 4
  sameHostOnly?: boolean; // default true
  stripQuery?: boolean; // default true
  includePatterns?: RegExp[]; // optional allow-list
  excludePatterns?: RegExp[]; // optional block-list
  userAgent?: string; // optional UA
};

type QueueItem = { url: string; depth: number };

function normalizeUrl(
  href: string,
  base: string,
  stripQuery: boolean
): string | null {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/i.test(u.protocol)) return null;
    u.hash = "";
    if (stripQuery) u.search = "";
    return u.toString();
  } catch {
    return null;
  }
}

function shouldVisit(url: string, base: URL, opts: CrawlOptions): boolean {
  try {
    const u = new URL(url);
    if (opts.sameHostOnly && u.host !== base.host) return false;
    // Skip non-HTML-ish extensions quickly
    if (
      /\.(jpg|jpeg|png|gif|svg|webp|ico|pdf|zip|tar|gz|rar|7z|mp4|mp3|wav)$/i.test(
        u.pathname
      )
    )
      return false;
    if (opts.excludePatterns?.some((re) => re.test(url))) return false;
    if (
      opts.includePatterns &&
      !opts.includePatterns.some((re) => re.test(url))
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchHtml(
  url: string,
  userAgent?: string
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: userAgent ? { "User-Agent": userAgent } : undefined,
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function crawlSite(
  startUrl: string,
  opts: CrawlOptions = {}
): Promise<string[]> {
  const {
    maxDepth = 2,
    maxPages = 200,
    concurrency = 4,
    sameHostOnly = true,
    stripQuery = true,
    includePatterns,
    excludePatterns,
    userAgent,
  } = opts;

  const base = new URL(startUrl);
  const visited = new Set<string>();
  const queue: QueueItem[] = [{ url: startUrl, depth: 0 }];

  const takeBatch = () => {
    const batch: QueueItem[] = [];
    while (batch.length < concurrency && queue.length > 0) {
      const item = queue.shift()!;
      if (!visited.has(item.url)) batch.push(item);
    }
    return batch;
  };

  while (visited.size < maxPages && queue.length > 0) {
    const batch = takeBatch();
    if (batch.length === 0) break;

    await Promise.all(
      batch.map(async ({ url, depth }) => {
        visited.add(url);
        const html = await fetchHtml(url, userAgent);
        if (!html || depth >= maxDepth || visited.size >= maxPages) return;

        const $ = cheerio.load(html);
        const links = $("a[href]")
          .map((_, a) => $(a).attr("href") || "")
          .get();

        for (const href of links) {
          const norm = normalizeUrl(href, url, stripQuery);
          if (!norm) continue;
          if (
            !shouldVisit(norm, base, {
              sameHostOnly,
              includePatterns,
              excludePatterns,
            })
          )
            continue;
          if (!visited.has(norm)) {
            queue.push({ url: norm, depth: depth + 1 });
          }
        }
      })
    );
  }

  return Array.from(visited);
}
