/**
 * Belvoir Demand Gen pipeline handler.
 *
 * One DG campaign per category, one ad group per article, image-only ads.
 * Per-article attribution comes from sub4={adgroupid} in the RedTrack
 * tracking template — no need for per-article RT campaigns.
 *
 * POST /belvoir-demand-gen  — { mode: "preview" | "execute", lang?: "nl" | "fr", category?: string, limit?: number }
 */

import Anthropic from "@anthropic-ai/sdk";
import type { GoogleAdsAgent } from "../agent.js";
import { discoverBelvoirArticles, type BelvoirArticleSummary } from "../tools/belvoir-discover.js";
import { fetchBelvoirArticle } from "../tools/belvoir-article.js";
import { createBelvoirRedTrackCampaign, isRedTrackConfigured } from "../tools/redtrack.js";
import {
  createDemandGenImageAdGroup,
  type DemandGenImageAdGroupResult,
} from "../tools/campaign-builder.js";
import { languageConstant } from "../types.js";
import type { BelvoirArticle } from "../types.js";

// ── Config ──────────────────────────────────────────────────────────

/** Per-category daily budget in EUR. Falls back to 10 for unknown categories. */
const CATEGORY_BUDGETS: Record<string, number> = {
  verkopen: 15,
  mode: 10,
  fashion: 10,
  schoonheid: 10,
  welzijn: 7.5,
  "wellness-be": 7.5,
  home: 10,
};

const DEFAULT_BUDGET = 10;
const DEFAULT_DURATION_DAYS = 14;

const BUSINESS_NAME = "Belvoir";

/** Existing logo image asset — see sev-agent-channel-google-ads/CLAUDE.md */
const LOGO_IMAGE_ASSET = "customers/6267337247/assets/73011795371";

// ── Request / response types ────────────────────────────────────────

export interface BelvoirDemandGenRequest {
  mode?: "preview" | "execute";
  lang?: "nl" | "fr";
  category?: string;
  /** Cap article count (useful for testing) */
  limit?: number;
  /** Override daily budget per category (€) */
  budgetOverride?: number;
  /** Override duration (days) */
  durationDays?: number;
}

interface PreviewArticle {
  slug: string;
  title: string;
  url: string;
  imageCount: number;
  affiliateLinks: number;
  headlinesPreview: string[];
}

interface PreviewCategory {
  category: string;
  campaignName: string;
  dailyBudget: number;
  articleCount: number;
  articles: PreviewArticle[];
}

interface PreviewResponse {
  ok: true;
  mode: "preview";
  lang: "nl" | "fr";
  totals: {
    categoryCount: number;
    articleCount: number;
    totalDailyBudget: number;
    durationDays: number;
  };
  categories: PreviewCategory[];
}

interface ExecuteResponse {
  ok: true;
  mode: "execute";
  lang: "nl" | "fr";
  created: Array<{
    category: string;
    campaignName: string;
    campaignResourceName: string;
    redTrackCampaignId?: string;
    adGroups: Array<{ slug: string; adGroupResourceName: string; adResourceName?: string; warning?: string }>;
  }>;
  failed: Array<{ category?: string; slug?: string; error: string }>;
}

type Response = PreviewResponse | ExecuteResponse | { ok: false; error: string };

// ── Helpers ─────────────────────────────────────────────────────────

function datePrefix(d = new Date()): string {
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function endDate(durationDays: number): string {
  const d = new Date(Date.now() + durationDays * 86_400_000);
  return d.toISOString().split("T")[0];
}

function startDate(): string {
  return new Date().toISOString().split("T")[0];
}

interface DemandGenCopy {
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
}

/**
 * Generate Demand Gen ad copy from a Belvoir article (NL only for v1).
 * DG image ads need: 3-5 headlines (≤30), 1-5 long_headlines (≤90), 1-5 descriptions (≤90).
 */
async function generateDemandGenCopy(article: BelvoirArticle, lang: "nl" | "fr"): Promise<DemandGenCopy> {
  const anthropic = new Anthropic();

  const langLabel = lang === "nl" ? "Dutch (Belgium)" : "French (Belgium)";
  const articleTitle = lang === "nl" ? article.title_nl : article.title_fr || article.title_nl;
  const articleExcerpt = lang === "nl" ? article.excerpt_nl : article.excerpt_fr || article.excerpt_nl;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are an ad copywriter for Belvoir.be — a Belgian editorial fashion/beauty/lifestyle platform.
Tone: sophisticated, editorial, approachable, trend-aware. NOT salesy.
Target: style-conscious Belgian women 25-55.

Write Google Demand Gen image ad copy in ${langLabel} for this Belvoir article:

Title: ${articleTitle}
Excerpt: ${articleExcerpt}
Category: ${article.category}
Brands mentioned: ${article.brands_mentioned.slice(0, 8).join(", ")}
Tags: ${article.tags.join(", ")}

Output STRICT JSON only:
{
  "headlines": [5 short headlines, max 30 chars each, mix article topic + Belvoir brand],
  "longHeadlines": [3 long headlines, max 90 chars each, descriptive teaser style],
  "descriptions": [3 descriptions, max 90 chars each, soft CTA to read article]
}

Hard rules:
- COUNT CHARACTERS — exceeding limits will reject the ad
- ${lang === "nl" ? 'Use natural Dutch (Belgium): "Ontdek", "Lees meer", "Editorial"' : 'Use natural French (Belgium): "Découvrez", "Lire plus", "Édito"'}
- Mention Belvoir or Belvoir.be in at least one long headline
- No emoji, no all-caps, no exclamation spam`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error("DG copy: no JSON in LLM response");

  const parsed = JSON.parse(json[0]) as DemandGenCopy;
  // Enforce length limits — Google Ads rejects on over-limit
  parsed.headlines = (parsed.headlines ?? []).filter((h) => h && h.length <= 30).slice(0, 5);
  parsed.longHeadlines = (parsed.longHeadlines ?? []).filter((h) => h && h.length <= 90).slice(0, 5);
  parsed.descriptions = (parsed.descriptions ?? []).filter((d) => d && d.length <= 90).slice(0, 5);

  if (parsed.headlines.length < 3 || parsed.longHeadlines.length < 1 || parsed.descriptions.length < 1) {
    throw new Error(`DG copy too sparse after filtering: H=${parsed.headlines.length} LH=${parsed.longHeadlines.length} D=${parsed.descriptions.length}`);
  }
  return parsed;
}

/**
 * Pick marketing images for a Demand Gen multi_asset_ad.
 *
 * Belvoir's featured/og:image is always the brand-mark SVG (unusable for
 * marketing assets). Real article photography lives in body_images, but the
 * first one or two body images are typically tiny brand thumbnails (URLs
 * carry `height=` or `width=` params). Full-size content images have only
 * `?format=webp` (no size params), so we filter accordingly.
 *
 * The actual fetch + format coercion + content-type validation happens in
 * campaign-builder.uploadImage, which will skip any SVG that slips through.
 */
function selectMarketingImages(article: BelvoirArticle, max = 5): string[] {
  const isThumbnail = (url: string): boolean => {
    try {
      const u = new URL(url.replace(/&amp;/g, "&"));
      return u.searchParams.has("height") || u.searchParams.has("width");
    } catch {
      return false;
    }
  };
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of article.body_images) {
    if (!u || !u.startsWith("http")) continue;
    if (isThumbnail(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

// ── Main handler ────────────────────────────────────────────────────

export async function handleBelvoirDemandGen(
  agent: GoogleAdsAgent,
  request: BelvoirDemandGenRequest = {},
): Promise<Response> {
  if (!agent.googleAds) return { ok: false, error: "Google Ads client not configured" };

  const lang = request.lang ?? "nl";
  if (lang === "fr") {
    return { ok: false, error: "FR not yet supported (v1 = NL only). Set lang='nl' or wait for v2." };
  }

  const mode = request.mode ?? "preview";
  const durationDays = request.durationDays ?? DEFAULT_DURATION_DAYS;

  // 1. Discover articles
  let summaries: BelvoirArticleSummary[];
  try {
    summaries = await discoverBelvoirArticles({ lang, category: request.category, limit: request.limit });
  } catch (err) {
    return { ok: false, error: `Article discovery failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (summaries.length === 0) {
    return { ok: false, error: `No articles discovered for lang=${lang}${request.category ? ` category=${request.category}` : ""}` };
  }
  console.log(`[belvoir-dg] Discovered ${summaries.length} articles`);

  // 2. Fetch full article + generate DG copy in parallel-ish (small batches to be polite)
  const enriched: Array<{ summary: BelvoirArticleSummary; article: BelvoirArticle; copy: DemandGenCopy; images: string[] }> = [];
  const articleFailures: Array<{ slug: string; error: string }> = [];
  for (const s of summaries) {
    try {
      const article = await fetchBelvoirArticle(s.url);
      // Resolve category from URL path (more reliable than discovery's homepage-fallback)
      const summaryCategory = s.category === "home" ? article.category : s.category;
      const copy = await generateDemandGenCopy(article, lang);
      // v1: pass 1 image only — Google rejects the WHOLE ad if any single
      // marketing_image fails aspect ratio. Without server-side dimension probing
      // we can't filter; one image gives the best odds per ad.
      const images = selectMarketingImages(article, 1);
      if (images.length === 0) {
        articleFailures.push({ slug: s.slug, error: "no usable marketing images in article" });
        continue;
      }
      enriched.push({ summary: { ...s, category: summaryCategory }, article, copy, images });
    } catch (err) {
      articleFailures.push({ slug: s.slug, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (enriched.length === 0) {
    return { ok: false, error: `All ${summaries.length} articles failed enrichment. First error: ${articleFailures[0]?.error}` };
  }

  // 3. Group by category
  const byCategory = new Map<string, typeof enriched>();
  for (const e of enriched) {
    const cat = e.summary.category;
    const list = byCategory.get(cat) ?? [];
    list.push(e);
    byCategory.set(cat, list);
  }

  // ── Preview mode ──────────────────────────────────────────────────
  if (mode === "preview") {
    const categories: PreviewCategory[] = [];
    let totalBudget = 0;
    for (const [cat, items] of byCategory.entries()) {
      const dailyBudget = request.budgetOverride ?? CATEGORY_BUDGETS[cat] ?? DEFAULT_BUDGET;
      totalBudget += dailyBudget;
      categories.push({
        category: cat,
        campaignName: `belvoir_DG_${cat}_${lang.toUpperCase()}_${datePrefix()}`,
        dailyBudget,
        articleCount: items.length,
        articles: items.map((e) => ({
          slug: e.summary.slug,
          title: e.article.title_nl,
          url: e.article.url,
          imageCount: e.images.length,
          affiliateLinks: e.article.affiliate_links.length,
          headlinesPreview: e.copy.headlines.slice(0, 3),
        })),
      });
    }
    return {
      ok: true,
      mode: "preview",
      lang,
      totals: {
        categoryCount: categories.length,
        articleCount: enriched.length,
        totalDailyBudget: totalBudget,
        durationDays,
      },
      categories,
    };
  }

  // ── Execute mode ──────────────────────────────────────────────────
  const created: ExecuteResponse["created"] = [];
  const failed: ExecuteResponse["failed"] = [...articleFailures];

  if (!isRedTrackConfigured()) {
    return { ok: false, error: "RedTrack not configured — set REDTRACK_API_KEY in agent .env" };
  }

  for (const [cat, items] of byCategory.entries()) {
    const dailyBudget = request.budgetOverride ?? CATEGORY_BUDGETS[cat] ?? DEFAULT_BUDGET;
    const campaignName = `belvoir_DG_${cat}_${lang.toUpperCase()}_${datePrefix()}`;

    try {
      // 1. Create RedTrack campaign for this category
      const rt = await createBelvoirRedTrackCampaign({ lang, theme: cat });
      if (!rt) {
        failed.push({ category: cat, error: "RedTrack campaign creation returned null" });
        continue;
      }

      // 2. Create the Demand Gen campaign (PAUSED) with RT tracking template
      const budgetMicros = Math.round(dailyBudget * 1_000_000);

      // Inline campaign + budget creation since we need a bare campaign with no ad group yet
      const budgetSuffix = Date.now().toString(36);
      const budgetResult = await agent.googleAds.mutateResource("campaignBudgets", [{
        create: {
          name: `${campaignName} Budget ${budgetSuffix}`,
          amount_micros: String(budgetMicros),
          delivery_method: "STANDARD",
          explicitly_shared: false,
        },
      }]);
      const budgetRn = budgetResult.results[0].resourceName;

      // start_date / end_date are intentionally omitted — Demand Gen rejects them
      // at create time ("Cannot find field"). Defaults to running indefinitely
      // from today; user can set end_date in Google Ads UI if needed.
      const campaignResult = await agent.googleAds.mutateResource("campaigns", [{
        create: {
          name: campaignName,
          advertising_channel_type: "DEMAND_GEN",
          status: "PAUSED",
          campaign_budget: budgetRn,
          maximize_conversions: {},
          tracking_url_template: rt.trackingTemplate,
          contains_eu_political_advertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        },
      }]);
      const campaignRn = campaignResult.results[0].resourceName;

      console.log(`[belvoir-dg] Created campaign ${campaignName} (${campaignRn})`);

      // 3. For each article in the category, create one ad group + image ad
      const adGroups: ExecuteResponse["created"][number]["adGroups"] = [];
      for (const e of items) {
        try {
          const result: DemandGenImageAdGroupResult = await createDemandGenImageAdGroup(agent.googleAds, {
            campaignResourceName: campaignRn,
            adGroupName: e.summary.slug.slice(0, 200),
            businessName: BUSINESS_NAME,
            logoImageAsset: LOGO_IMAGE_ASSET,
            headlines: e.copy.headlines,
            longHeadlines: e.copy.longHeadlines,
            descriptions: e.copy.descriptions,
            marketingImages: e.images,
            // RedTrack appends ?ref=gads-style params via tracking_url_template; landing is article URL
            finalUrl: `${e.article.url}${e.article.url.includes("?") ? "&" : "?"}ref=gads`,
            // Google Ads expects CamelCase enum text, not SHOUT_CASE.
            // Valid values: LearnMore, ShopNow, SignUp, GetStarted, ContactUs, etc.
            callToAction: "LearnMore",
          });
          adGroups.push({
            slug: e.summary.slug,
            adGroupResourceName: result.adGroupResourceName,
            adResourceName: result.adResourceName,
            warning: result.warning,
          });
          if (result.warning) {
            failed.push({ category: cat, slug: e.summary.slug, error: result.warning });
          }
        } catch (err) {
          failed.push({ category: cat, slug: e.summary.slug, error: err instanceof Error ? err.message : String(err) });
        }
      }

      created.push({
        category: cat,
        campaignName,
        campaignResourceName: campaignRn,
        redTrackCampaignId: rt.campaignId,
        adGroups,
      });
    } catch (err) {
      failed.push({ category: cat, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { ok: true, mode: "execute", lang, created, failed };
}

/** Format response as a readable summary for Slack / CLI */
export function formatBelvoirDemandGenResult(result: Response): string {
  if (!result.ok) return `Belvoir DG pipeline error: ${result.error}`;
  if (result.mode === "preview") {
    const lines = [
      `*Belvoir Demand Gen — Preview (lang=${result.lang})*`,
      `Categories: ${result.totals.categoryCount} | Articles: ${result.totals.articleCount} | Total daily budget: €${result.totals.totalDailyBudget} | Duration: ${result.totals.durationDays}d`,
      "",
    ];
    for (const c of result.categories) {
      lines.push(`*${c.category}* — \`${c.campaignName}\` (€${c.dailyBudget}/d, ${c.articleCount} articles)`);
      for (const a of c.articles) {
        lines.push(`  • ${a.slug} — ${a.imageCount} images, ${a.affiliateLinks} links`);
        lines.push(`    headlines: ${a.headlinesPreview.map((h) => `"${h}"`).join(", ")}`);
      }
      lines.push("");
    }
    lines.push("_Run with `mode=execute` to create campaigns (PAUSED)._");
    return lines.join("\n");
  }
  const lines = [`*Belvoir Demand Gen — Created (lang=${result.lang})*`];
  for (const c of result.created) {
    lines.push(`✓ \`${c.campaignName}\` (${c.adGroups.length} ad groups, RT=${c.redTrackCampaignId})`);
    for (const ag of c.adGroups) {
      const mark = ag.warning ? "⚠" : "✓";
      lines.push(`    ${mark} ${ag.slug}${ag.warning ? ` — ${ag.warning}` : ""}`);
    }
  }
  if (result.failed.length > 0) {
    lines.push("", `*Failed (${result.failed.length}):*`);
    for (const f of result.failed) {
      lines.push(`  ✗ ${f.category ?? ""}${f.slug ? `/${f.slug}` : ""}: ${f.error}`);
    }
  }
  lines.push("\n_All campaigns created PAUSED. Approve in Google Ads UI._");
  return lines.join("\n");
}
