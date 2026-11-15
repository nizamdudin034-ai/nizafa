// Google Trends — daily trending searches, US + Pakistan.
// Source: the public Google Trends daily RSS feeds (no key, no scraping of
// private data). Fetched server-side, cached in Supabase (trending_snapshots)
// once per day, so the home page never waits on a live fetch.

export type TrendItem = {
  geo: string;
  title: string;
  traffic: string;
  newsSource?: string;
  newsTitle?: string;
  newsUrl?: string;
  publishedAt?: string;
};

function pick(tag: string, block: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!m) return undefined;
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseRss(xml: string, geo: string): TrendItem[] {
  const items: TrendItem[] = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of blocks) {
    const title = pick("title", block);
    if (!title) continue;
    items.push({
      geo,
      title,
      traffic: pick("ht:approx_traffic", block) ?? "",
      newsTitle: pick("ht:news_item_title", block),
      newsSource: pick("ht:news_item_source", block),
      newsUrl: pick("ht:news_item_url", block),
      publishedAt: pick("pubDate", block),
    });
  }
  return items;
}

export async function fetchTrendsGeo(geo: "US" | "PK"): Promise<TrendItem[]> {
  const url = `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Nizafa/1.0 (YouTube SEO tool)" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Trends RSS ${geo} failed: ${res.status}`);
  const xml = await res.text();
  return parseRss(xml, geo);
}

/** US + Pakistan in parallel. Returns [] on failure (caller falls back to cache). */
export async function fetchTrendsAll(): Promise<TrendItem[]> {
  const [us, pk] = await Promise.allSettled([
    fetchTrendsGeo("US"),
    fetchTrendsGeo("PK"),
  ]);
  const out: TrendItem[] = [];
  if (us.status === "fulfilled") out.push(...us.value);
  if (pk.status === "fulfilled") out.push(...pk.value);
  return out;
}
