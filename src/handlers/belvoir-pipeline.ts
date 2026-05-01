/**
 * Belvoir content-to-campaign pipeline handler.
 * Automates: article fetch → keyword research → ad copy → campaign creation.
 * Mirrors the batch.ts pattern but for articles instead of events.
 *
 * POST /article-pipeline         — Directus webhook trigger
 * POST /article-pipeline/manual  — Slack/skill manual trigger
 */

import type { GoogleAdsAgent } from "../agent.js";
import { fetchBelvoirArticle, fetchBelvoirArticleById } from "../tools/belvoir-article.js";
import { extractArticleKeywords } from "../tools/article-keywords.js";
import { generateArticleCopy } from "../tools/article-copy.js";
import { buildCampaign } from "../tools/campaign-builder.js";
import { createCampaignAssets } from "../tools/asset-builder.js";
import { createRedTrackCampaign, isRedTrackConfigured } from "../tools/redtrack.js";
import { languageConstant } from "../types.js";
import type {
  BelvoirArticle,
  BelvoirPipelineRequest,
  BelvoirPipelineConfig,
  BelvoirCategory,
  GoogleCampaignType,
  CampaignConfig,
  ArticleAdCopy,
} from "../types.js";

// ── Default pipeline config (used when Directus collection not yet set up) ──

const DEFAULT_CONFIGS: Record<BelvoirCategory, BelvoirPipelineConfig> = {
  verkopen: {
    category: "verkopen",
    campaign_types: ["search", "pmax"],
    default_daily_budget: 15,
    default_duration_days: 7,
    keyword_strategy: { match_preference: "PHRASE" },
    target_locations: ["BE"],
    platforms: ["google"],
    enabled: true,
  },
  mode: {
    category: "mode",
    campaign_types: ["search", "pmax"],
    default_daily_budget: 10,
    default_duration_days: 14,
    keyword_strategy: { match_preference: "PHRASE" },
    target_locations: ["BE"],
    platforms: ["google"],
    enabled: true,
  },
  schoonheid: {
    category: "schoonheid",
    campaign_types: ["search", "pmax"],
    default_daily_budget: 10,
    default_duration_days: 14,
    keyword_strategy: { match_preference: "PHRASE" },
    target_locations: ["BE"],
    platforms: ["google"],
    enabled: true,
  },
  welzijn: {
    category: "welzijn",
    campaign_types: ["search"],
    default_daily_budget: 7.5,
    default_duration_days: 14,
    keyword_strategy: { match_preference: "BROAD" },
    target_locations: ["BE"],
    platforms: ["google"],
    enabled: true,
  },
};

// ── Response types ──────────────────────────────────────────────────

interface PipelinePreviewResponse {
  ok: true;
  mode: "preview";
  article: {
    title: string;
    url: string;
    category: BelvoirCategory;
    brands: string[];
    affiliateLinks: number;
  };
  campaigns: Array<{
    name: string;
    type: GoogleCampaignType;
    lang: "nl" | "fr";
    budget: number;
    keywordCount: number;
    sampleHeadlines: string[];
  }>;
  totals: {
    campaignCount: number;
    totalDailyBudget: number;
    totalKeywords: number;
  };
}

interface PipelineExecuteResponse {
  ok: true;
  mode: "execute";
  article: { title: string; url: string; category: BelvoirCategory };
  created: Array<{ name: string; type: string; lang: string; resourceName: string }>;
  failed: Array<{ name: string; type: string; lang: string; error: string }>;
}

type PipelineResponse = PipelinePreviewResponse | PipelineExecuteResponse | { ok: false; error: string };

// ── Date helpers ────────────────────────────────────────────────────

function datePrefix(): string {
  const d = new Date();
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): string {
  const d = new Date(date.getTime() + days * 86_400_000);
  return d.toISOString().split("T")[0];
}

// ── Main handler ────────────────────────────────────────────────────

export async function handleBelvoirPipeline(
  agent: GoogleAdsAgent,
  request: BelvoirPipelineRequest,
): Promise<PipelineResponse> {
  if (!agent.googleAds) {
    return { ok: false, error: "Google Ads client not configured" };
  }

  if (!request.articleUrl && !request.articleId) {
    return { ok: false, error: "Provide articleUrl or articleId" };
  }

  // 1. Fetch article
  let article: BelvoirArticle;
  try {
    article = request.articleUrl
      ? await fetchBelvoirArticle(request.articleUrl)
      : await fetchBelvoirArticleById(request.articleId!);
  } catch (err) {
    return { ok: false, error: `Failed to fetch article: ${err instanceof Error ? err.message : String(err)}` };
  }

  console.log(`[belvoir] Article: "${article.title_nl}" (${article.category}), ${article.affiliate_links.length} affiliate links`);

  // 2. Load pipeline config
  const config = DEFAULT_CONFIGS[article.category];
  if (!config.enabled) {
    return { ok: false, error: `Pipeline disabled for category: ${article.category}` };
  }

  const campaignTypes = request.campaignTypesOverride ?? config.campaign_types;
  const dailyBudget = request.budgetOverride ?? config.default_daily_budget;
  const endDate = addDays(new Date(), config.default_duration_days);

  // 3. Extract keywords (NL + FR)
  console.log("[belvoir] Extracting keywords...");
  const [keywordsNl, keywordsFr] = await Promise.all([
    extractArticleKeywords(article, "nl", agent.googleAds),
    extractArticleKeywords(article, "fr", agent.googleAds),
  ]);

  // 4. Generate ad copy
  console.log("[belvoir] Generating ad copy...");
  let adCopy: ArticleAdCopy;
  try {
    adCopy = await generateArticleCopy(article);
  } catch (err) {
    return { ok: false, error: `Ad copy generation failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // 5. Build campaign plans
  const prefix = datePrefix();
  const slugShort = article.slug.slice(0, 30).replace(/[^a-zA-Z0-9-]/g, "");
  const plans: Array<{
    name: string;
    type: GoogleCampaignType;
    lang: "nl" | "fr";
    budget: number;
    keywords: Array<{ text: string; matchType: string }>;
    headlines: string[];
    descriptions: string[];
  }> = [];

  for (const type of campaignTypes) {
    for (const lang of ["nl", "fr"] as const) {
      const kwData = lang === "nl" ? keywordsNl : keywordsFr;
      const campaignName = `belvoir_${prefix}_${slugShort}_${type}_${lang.toUpperCase()}`;

      plans.push({
        name: campaignName,
        type,
        lang,
        budget: dailyBudget,
        keywords: kwData.enriched.map((k) => ({ text: k.text, matchType: k.matchType })),
        headlines: adCopy[lang].headlines,
        descriptions: adCopy[lang].descriptions,
      });
    }
  }

  // 6. Preview mode
  if (!request.execute) {
    return {
      ok: true,
      mode: "preview",
      article: {
        title: article.title_nl,
        url: article.url,
        category: article.category,
        brands: article.brands_mentioned.slice(0, 10),
        affiliateLinks: article.affiliate_links.length,
      },
      campaigns: plans.map((p) => ({
        name: p.name,
        type: p.type,
        lang: p.lang,
        budget: p.budget,
        keywordCount: p.keywords.length,
        sampleHeadlines: p.headlines.slice(0, 5),
      })),
      totals: {
        campaignCount: plans.length,
        totalDailyBudget: plans.reduce((s, p) => s + p.budget, 0),
        totalKeywords: plans.reduce((s, p) => s + p.keywords.length, 0),
      },
    };
  }

  // 7. Execute mode — create campaigns
  console.log(`[belvoir] Creating ${plans.length} campaigns...`);

  const created: PipelineExecuteResponse["created"] = [];
  const failed: PipelineExecuteResponse["failed"] = [];

  for (const plan of plans) {
    try {
      // RedTrack tracking
      let trackingTemplate: string | undefined;
      if (isRedTrackConfigured()) {
        try {
          const rt = await createRedTrackCampaign({
            brand: "belvoir",
            eventType: "online",
            landingPageUrl: article.url,
          });
          if (rt) trackingTemplate = rt.trackingTemplate;
        } catch { /* non-fatal */ }
      }

      if (plan.type === "search") {
        // Search campaign — keyword-driven
        const campaignConfig: CampaignConfig = {
          type: "search",
          name: plan.name,
          dailyBudgetMicros: Math.round(plan.budget * 1_000_000),
          locations: config.target_locations,
          languages: [plan.lang],
          startDate: new Date().toISOString().split("T")[0],
          endDate,
          targetCountry: "BE",
          keywords: plan.keywords.map((k) => ({
            text: k.text,
            matchType: k.matchType as any,
          })),
          adGroupName: plan.name,
          responsiveSearchAd: {
            headlines: plan.headlines,
            descriptions: plan.descriptions,
            finalUrl: article.url,
            path1: adCopy[plan.lang].path1,
            path2: adCopy[plan.lang].path2,
          },
          ...(trackingTemplate && { trackingUrlTemplate: trackingTemplate }),
        };

        const result = await buildCampaign(agent.googleAds, campaignConfig);
        created.push({
          name: plan.name,
          type: plan.type,
          lang: plan.lang,
          resourceName: result.campaignResourceName,
        });
      } else if (plan.type === "display") {
        // Display campaign — awareness/retargeting
        const campaignConfig: CampaignConfig = {
          type: "display",
          name: plan.name,
          dailyBudgetMicros: Math.round(plan.budget * 1_000_000),
          locations: config.target_locations,
          languages: [plan.lang],
          startDate: new Date().toISOString().split("T")[0],
          endDate,
          targetCountry: "BE",
          displayNetwork: true,
          ...(trackingTemplate && { trackingUrlTemplate: trackingTemplate }),
        };

        const result = await buildCampaign(agent.googleAds, campaignConfig);
        created.push({
          name: plan.name,
          type: plan.type,
          lang: plan.lang,
          resourceName: result.campaignResourceName,
        });
      } else if (plan.type === "pmax") {
        // Performance Max — broad discovery
        const campaignConfig: CampaignConfig = {
          type: "pmax",
          name: plan.name,
          dailyBudgetMicros: Math.round(plan.budget * 1_000_000),
          locations: config.target_locations,
          languages: [plan.lang],
          startDate: new Date().toISOString().split("T")[0],
          endDate,
          targetCountry: "BE",
          assetGroup: {
            name: `${plan.name} - Assets`,
            finalUrls: [article.url],
            headlines: plan.headlines.slice(0, 5),
            longHeadlines: plan.headlines.slice(5, 10),
            descriptions: plan.descriptions,
          },
          ...(trackingTemplate && { trackingUrlTemplate: trackingTemplate }),
        };

        const result = await buildCampaign(agent.googleAds, campaignConfig);
        created.push({
          name: plan.name,
          type: plan.type,
          lang: plan.lang,
          resourceName: result.campaignResourceName,
        });
      }

      console.log(`[belvoir] Created: ${plan.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ name: plan.name, type: plan.type, lang: plan.lang, error: msg });
      console.error(`[belvoir] Failed: ${plan.name} — ${msg}`);
    }
  }

  return {
    ok: true,
    mode: "execute",
    article: { title: article.title_nl, url: article.url, category: article.category },
    created,
    failed,
  };
}

/**
 * Format pipeline result as a readable summary.
 */
export function formatPipelineResult(result: PipelineResponse): string {
  if (!result.ok) return `Pipeline error: ${result.error}`;

  if (result.mode === "preview") {
    const lines = [
      `*Belvoir Pipeline Preview*`,
      `Article: "${result.article.title}"`,
      `URL: ${result.article.url}`,
      `Category: ${result.article.category} | Brands: ${result.article.brands.join(", ")} | Affiliate links: ${result.article.affiliateLinks}`,
      "",
      `*Campaigns to create (${result.totals.campaignCount}):*`,
    ];
    for (const c of result.campaigns) {
      lines.push(`  • \`${c.name}\` (${c.type}, ${c.lang.toUpperCase()}) — €${c.budget}/day, ${c.keywordCount} keywords`);
      lines.push(`    Sample headlines: ${c.sampleHeadlines.map((h) => `"${h}"`).join(", ")}`);
    }
    lines.push("");
    lines.push(`Total daily budget: €${result.totals.totalDailyBudget} | Total keywords: ${result.totals.totalKeywords}`);
    lines.push("");
    lines.push("_Run with `--execute` to create campaigns (PAUSED)._");
    return lines.join("\n");
  }

  const lines = [
    `*Belvoir Pipeline — Campaigns Created*`,
    `Article: "${result.article.title}" (${result.article.category})`,
    "",
  ];
  if (result.created.length > 0) {
    lines.push(`*Created (${result.created.length}):*`);
    for (const c of result.created) {
      lines.push(`  ✓ \`${c.name}\` (${c.type}, ${c.lang.toUpperCase()})`);
    }
  }
  if (result.failed.length > 0) {
    lines.push(`\n*Failed (${result.failed.length}):*`);
    for (const f of result.failed) {
      lines.push(`  ✗ \`${f.name}\`: ${f.error}`);
    }
  }
  lines.push("\n_All campaigns created PAUSED. Approve in Google Ads UI or via `approve` command._");
  return lines.join("\n");
}
