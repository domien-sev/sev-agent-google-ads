/**
 * Discover article URLs across belvoir.be by scraping category index pages.
 *
 * The site is a Remix SPA without a real sitemap, but its homepage and
 * category pages (/{lang}/categorie/{slug}) ARE server-rendered HTML
 * containing /{lang}/blog/{slug} hrefs. This mirrors mcp-belvoir's logic
 * so the agent can run the pipeline without the MCP.
 */

const BASE = "https://belvoir.be";
const ALLOWED_HOSTS = new Set(["belvoir.be", "www.belvoir.be"]);
const USER_AGENT = "sev-ai-google-ads-agent/1.0";

export interface BelvoirArticleSummary {
  url: string;
  slug: string;
  category: string;
  lang: "nl" | "fr";
}

function assertBelvoirUrl(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`Only https:// allowed, got: ${parsed.protocol}`);
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`Only belvoir.be allowed, got: ${parsed.hostname}`);
  }
  return parsed;
}

async function fetchHtml(url: string): Promise<string> {
  assertBelvoirUrl(url);
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html",
      "Accept-Language": "nl-BE,nl;q=0.9,fr-BE;q=0.8,fr;q=0.7",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  return res.text();
}

function extractArticleHrefs(html: string, lang: "nl" | "fr"): string[] {
  const re = new RegExp(`/${lang}-BE/blog/([a-z0-9][a-z0-9-]*[a-z0-9])`, "g");
  const slugs = new Set<string>();
  for (const match of html.matchAll(re)) slugs.add(match[1]);
  return Array.from(slugs).map((slug) => `${BASE}/${lang}-BE/blog/${slug}`);
}

function extractCategoryHrefs(html: string, lang: "nl" | "fr"): string[] {
  const re = new RegExp(`/${lang}-BE/categorie/([a-z0-9][a-z0-9-]*[a-z0-9])`, "g");
  const slugs = new Set<string>();
  for (const match of html.matchAll(re)) slugs.add(match[1]);
  return Array.from(slugs);
}

/**
 * Enumerate every article reachable from the homepage + category index pages.
 * Articles seen only on the homepage get category="home" (best-effort label;
 * the article fetcher resolves the real category from URL path).
 */
export async function discoverBelvoirArticles(opts: {
  lang?: "nl" | "fr";
  category?: string;
  limit?: number;
} = {}): Promise<BelvoirArticleSummary[]> {
  const lang = opts.lang ?? "nl";

  const homeHtml = await fetchHtml(`${BASE}/${lang}-BE`);
  const categories = opts.category ? [opts.category] : extractCategoryHrefs(homeHtml, lang);

  const found = new Map<string, BelvoirArticleSummary>();

  for (const url of extractArticleHrefs(homeHtml, lang)) {
    const slug = url.split("/").pop()!;
    found.set(slug, { url, slug, category: "home", lang });
  }

  for (const cat of categories) {
    let catHtml: string;
    try {
      catHtml = await fetchHtml(`${BASE}/${lang}-BE/categorie/${cat}`);
    } catch {
      continue;
    }
    for (const url of extractArticleHrefs(catHtml, lang)) {
      const slug = url.split("/").pop()!;
      const existing = found.get(slug);
      if (existing && existing.category === "home") {
        existing.category = cat;
      } else if (!existing) {
        found.set(slug, { url, slug, category: cat, lang });
      }
    }
  }

  const results = Array.from(found.values());
  return opts.limit ? results.slice(0, opts.limit) : results;
}
