/**
 * Belvoir article fetcher and analyzer.
 * Fetches articles from belvoir.be and extracts structured data
 * for the content-to-campaign pipeline.
 */

import type { BelvoirArticle, BelvoirCategory } from "../types.js";

const BELVOIR_BASE = "https://belvoir.be";

/** Allowed belvoir.be hostnames */
const ALLOWED_HOSTS = ["belvoir.be", "www.belvoir.be"];

/** Category mapping from URL path segments or tags */
const CATEGORY_MAP: Record<string, BelvoirCategory> = {
  mode: "mode",
  fashion: "mode",
  schoonheid: "schoonheid",
  beauty: "schoonheid",
  beauté: "schoonheid",
  welzijn: "welzijn",
  wellness: "welzijn",
  "bien-être": "welzijn",
  verkopen: "verkopen",
  sale: "verkopen",
  soldes: "verkopen",
  deals: "verkopen",
  shopping: "verkopen",
};

/**
 * Validate that a URL points to belvoir.be.
 */
function validateBelvoirUrl(url: string): URL {
  const parsed = new URL(url);
  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw new Error(`URL must be on belvoir.be, got: ${parsed.hostname}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Invalid protocol: ${parsed.protocol}`);
  }
  return parsed;
}

/**
 * Detect article category from URL path segments, meta tags, or body content.
 */
function detectCategory(url: string, bodyText: string, tags: string[]): BelvoirCategory {
  // Check URL path segments
  const pathSegments = new URL(url).pathname.toLowerCase().split("/").filter(Boolean);
  for (const seg of pathSegments) {
    if (CATEGORY_MAP[seg]) return CATEGORY_MAP[seg];
  }
  // Check tags
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower];
  }
  // Default to mode (most common category on belvoir.be)
  return "mode";
}

/**
 * Extract structured text content from HTML body.
 */
function extractTextContent(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode HTML entities
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  text = text.replace(/&nbsp;/g, " ").replace(/&#\d+;/g, " ");
  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

/**
 * Extract meta tag content from HTML.
 */
function extractMeta(html: string, property: string): string {
  const ogMatch = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"));
  if (ogMatch) return ogMatch[1];
  const revMatch = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"));
  return revMatch?.[1] ?? "";
}

/**
 * Extract image URLs from article content.
 */
function extractImages(html: string, baseUrl: string): string[] {
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  const images: string[] = [];
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.startsWith("data:")) continue;
    try {
      const absolute = new URL(src, baseUrl).href;
      images.push(absolute);
    } catch { /* skip invalid URLs */ }
  }
  return Array.from(new Set(images));
}

/**
 * Extract affiliate/outbound links from article content.
 */
function extractAffiliateLinks(html: string): Array<{ url: string; brand: string; product?: string }> {
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  const links: Array<{ url: string; brand: string; product?: string }> = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    // Skip internal links and anchors
    if (href.startsWith("#") || href.startsWith("/") || href.includes("belvoir.be")) continue;
    // Skip common non-affiliate links
    if (href.includes("facebook.com") || href.includes("instagram.com") || href.includes("twitter.com")) continue;
    try {
      const url = new URL(href);
      const brand = url.hostname.replace(/^www\./, "").split(".")[0];
      links.push({ url: href, brand, product: text || undefined });
    } catch { /* skip invalid URLs */ }
  }
  return links;
}

/**
 * Extract tags/keywords from meta keywords or article tags.
 */
function extractTags(html: string): string[] {
  const keywords = extractMeta(html, "keywords");
  if (keywords) return keywords.split(",").map((t) => t.trim()).filter(Boolean);

  // Try article:tag meta
  const tagRegex = /<meta[^>]+property=["']article:tag["'][^>]+content=["']([^"']+)["']/gi;
  const tags: string[] = [];
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    tags.push(match[1].trim());
  }
  return tags;
}

/**
 * Extract brand names mentioned in article text.
 */
function extractBrands(text: string, affiliateLinks: Array<{ brand: string }>): string[] {
  const brands = new Set(affiliateLinks.map((l) => l.brand));
  // Also look for capitalized multi-word names (common brand pattern)
  const brandPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  let match;
  while ((match = brandPattern.exec(text)) !== null) {
    if (match[1].length > 2 && match[1].length < 30) {
      brands.add(match[1]);
    }
  }
  return Array.from(brands).slice(0, 20);
}

/**
 * Fetch and analyze a Belvoir article by URL.
 */
export async function fetchBelvoirArticle(url: string): Promise<BelvoirArticle> {
  const parsed = validateBelvoirUrl(url);

  const response = await fetch(parsed.href, {
    headers: {
      "User-Agent": "sev-ai-google-ads-agent/1.0",
      "Accept": "text/html",
      "Accept-Language": "nl-BE,nl;q=0.9,fr-BE;q=0.8,fr;q=0.7",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch article: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Extract metadata — try og: tags first, fall back to body content heuristics
  const ogTitle = extractMeta(html, "og:title");
  const htmlTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || "";
  const description = extractMeta(html, "og:description") || extractMeta(html, "description") || "";
  const ogImage = extractMeta(html, "og:image") || "";
  const publishedTime = extractMeta(html, "article:published_time") || "";
  const locale = extractMeta(html, "og:locale") || "nl_BE";

  // Extract content
  const bodyText = extractTextContent(html);
  const bodyImages = extractImages(html, parsed.href);
  const affiliateLinks = extractAffiliateLinks(html);
  const tags = extractTags(html);
  const brands = extractBrands(bodyText, affiliateLinks);
  const category = detectCategory(url, bodyText, tags);

  // For SPA sites (React/Remix), title may be generic "Belvoir" — extract from body
  let titleNl = ogTitle && ogTitle !== "Belvoir" ? ogTitle : "";
  if (!titleNl) {
    // Try extracting the first <h1> text from body
    const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
    if (h1Match) {
      titleNl = h1Match[1].replace(/<[^>]+>/g, "").trim();
    }
  }
  if (!titleNl) {
    // Fall back to first meaningful line of body text (before "Mis nooit" nav text)
    const firstLine = bodyText.split(/Mis nooit|Abonneer/)[0].trim();
    titleNl = firstLine.split("|")[0].trim() || htmlTitle;
  }

  // Featured image — og:image may contain "[object Object]" from SSR bugs
  let featuredImage = ogImage.includes("[object") ? "" : ogImage;
  if (!featuredImage && bodyImages.length > 0) {
    // Use first content image as fallback
    featuredImage = bodyImages[0];
  }

  // Derive slug from URL path
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  const slug = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2] || "article";

  // For FR title, check if there's a FR version of the page
  const titleFr = locale.startsWith("fr") ? titleNl : `${titleNl}`; // Will be enriched by LLM later

  return {
    directus_article_id: slug,
    title_nl: titleNl,
    title_fr: titleFr,
    slug,
    url: parsed.href,
    category,
    featured_image_url: featuredImage,
    body_images: bodyImages.slice(0, 10),
    excerpt_nl: description,
    excerpt_fr: description,
    body_text: bodyText.slice(0, 5000),
    tags,
    brands_mentioned: brands,
    affiliate_links: affiliateLinks.slice(0, 20),
    date_published: publishedTime || new Date().toISOString(),
  };
}

/**
 * Fetch article by Directus article ID (for webhook trigger).
 * Constructs the URL and delegates to fetchBelvoirArticle.
 */
export async function fetchBelvoirArticleById(articleId: string, lang: "nl-BE" | "fr-BE" = "nl-BE"): Promise<BelvoirArticle> {
  const url = `${BELVOIR_BASE}/${lang}/${articleId}`;
  return fetchBelvoirArticle(url);
}
