/**
 * Keyword research and planning helpers.
 * Uses Google Ads Keyword Planner API for discovery + GAQL for analysis.
 */
import type { GoogleAdsClient } from "@domien-sev/ads-sdk";
import { LANGUAGE_CONSTANTS } from "../types.js";
import type { KeywordMatchType } from "../types.js";

export interface KeywordSuggestion {
  text: string;
  matchType: KeywordMatchType;
  estimatedVolume?: number;
  competition?: "LOW" | "MEDIUM" | "HIGH";
  suggestedBid?: number;
  reason: string;
}

export interface KeywordIdea {
  keyword: string;
  avgMonthlySearches: number;
  competition: "LOW" | "MEDIUM" | "HIGH" | "UNSPECIFIED";
  competitionIndex: number;
  lowTopOfPageBidMicros: number;
  highTopOfPageBidMicros: number;
}

/**
 * Research keyword ideas using Google Ads Keyword Planner API.
 *
 * @param seedKeywords - Starting keywords to expand from
 * @param pageUrl - Optional landing page URL for contextual suggestions
 * @param language - Language code: "1000" (EN), "1002" (FR), "1010" (NL)
 * @param geoTargets - Geo target constants: "2056" (Belgium)
 */
export async function researchKeywords(
  client: GoogleAdsClient,
  params: {
    seedKeywords?: string[];
    pageUrl?: string;
    language?: string;
    geoTargets?: string[];
    limit?: number;
  },
): Promise<KeywordIdea[]> {
  const languageId = params.language ?? LANGUAGE_CONSTANTS.nl;
  const geoTargetIds = params.geoTargets ?? ["2056"]; // Belgium

  const body: Record<string, unknown> = {
    language: `languageConstants/${languageId}`,
    geoTargetConstants: geoTargetIds.map((id) => `geoTargetConstants/${id}`),
    keywordPlanNetwork: "GOOGLE_SEARCH",
    pageSize: params.limit ?? 50,
  };

  if (params.seedKeywords?.length) {
    body.keywordSeed = { keywords: params.seedKeywords };
  }
  if (params.pageUrl) {
    body.urlSeed = { url: params.pageUrl };
  }
  // If both provided, use keywordAndUrlSeed
  if (params.seedKeywords?.length && params.pageUrl) {
    delete body.keywordSeed;
    delete body.urlSeed;
    body.keywordAndUrlSeed = {
      keywords: params.seedKeywords,
      url: params.pageUrl,
    };
  }

  const data = await client.post(
    "keywordPlanIdeas:generateKeywordIdeas",
    body,
  ) as { results?: Array<Record<string, any>> };

  const ideas: KeywordIdea[] = [];
  for (const row of data.results ?? []) {
    const metrics = row.keywordIdeaMetrics ?? {};
    ideas.push({
      keyword: row.text ?? "",
      avgMonthlySearches: Number(metrics.avgMonthlySearches ?? 0),
      competition: mapCompetition(metrics.competition),
      competitionIndex: Number(metrics.competitionIndex ?? 0),
      lowTopOfPageBidMicros: Number(metrics.lowTopOfPageBidMicros ?? 0),
      highTopOfPageBidMicros: Number(metrics.highTopOfPageBidMicros ?? 0),
    });
  }

  return ideas.sort((a, b) => b.avgMonthlySearches - a.avgMonthlySearches);
}

function mapCompetition(val: string | undefined): KeywordIdea["competition"] {
  if (val === "LOW" || val === "MEDIUM" || val === "HIGH") return val;
  return "UNSPECIFIED";
}

/**
 * Get historical metrics for a specific list of keywords.
 */
export async function getKeywordMetrics(
  client: GoogleAdsClient,
  keywords: string[],
  params?: {
    language?: string;
    geoTargets?: string[];
  },
): Promise<KeywordIdea[]> {
  const languageId = params?.language ?? LANGUAGE_CONSTANTS.nl;
  const geoTargetIds = params?.geoTargets ?? ["2056"];

  const body: Record<string, unknown> = {
    language: `languageConstants/${languageId}`,
    geoTargetConstants: geoTargetIds.map((id) => `geoTargetConstants/${id}`),
    keywordPlanNetwork: "GOOGLE_SEARCH",
    keywordSeed: { keywords },
  };

  const data = await client.post(
    "keywordPlanIdeas:generateKeywordIdeas",
    body,
  ) as { results?: Array<Record<string, any>> };

  // Filter to only exact matches from our input
  const inputSet = new Set(keywords.map((k) => k.toLowerCase()));
  const ideas: KeywordIdea[] = [];

  for (const row of data.results ?? []) {
    const text = (row.text ?? "").toLowerCase();
    if (!inputSet.has(text)) continue;

    const metrics = row.keywordIdeaMetrics ?? {};
    ideas.push({
      keyword: row.text ?? "",
      avgMonthlySearches: Number(metrics.avgMonthlySearches ?? 0),
      competition: mapCompetition(metrics.competition),
      competitionIndex: Number(metrics.competitionIndex ?? 0),
      lowTopOfPageBidMicros: Number(metrics.lowTopOfPageBidMicros ?? 0),
      highTopOfPageBidMicros: Number(metrics.highTopOfPageBidMicros ?? 0),
    });
  }

  return ideas;
}

/**
 * Format keyword ideas for Slack display.
 */
export function formatKeywordIdeas(ideas: KeywordIdea[], title: string): string {
  if (ideas.length === 0) return `${title}\n\nNo keyword ideas found.`;

  const lines = [`*${title}*`, ""];
  for (const idea of ideas.slice(0, 30)) {
    const vol = idea.avgMonthlySearches.toLocaleString();
    const lowBid = (idea.lowTopOfPageBidMicros / 1_000_000).toFixed(2);
    const highBid = (idea.highTopOfPageBidMicros / 1_000_000).toFixed(2);
    const comp = idea.competition === "UNSPECIFIED" ? "?" : idea.competition.charAt(0);
    lines.push(
      `\`${idea.keyword}\` — ${vol}/mo | ${comp} | €${lowBid}–${highBid}`,
    );
  }

  if (ideas.length > 30) {
    lines.push(`\n_...and ${ideas.length - 30} more_`);
  }

  return lines.join("\n");
}

export interface NegativeKeywordCandidate {
  searchTerm: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  reason: string;
}

/** Minimum spend (€) with 0 conversions before flagging as negative candidate */
const NEGATIVE_SPEND_THRESHOLD = 5;
/** Minimum clicks with 0 conversions (+ min spend) before flagging */
const NEGATIVE_CLICK_THRESHOLD = 10;
/** Minimum spend (€) for click-based negative flagging */
const NEGATIVE_CLICK_MIN_SPEND = 2;

/**
 * Analyze search terms and find negative keyword candidates.
 * Looks for high-cost, low-conversion terms.
 */
export async function findNegativeCandidates(
  client: GoogleAdsClient,
  campaignId?: string,
  days: number = 30,
): Promise<NegativeKeywordCandidate[]> {
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];

  const campaignFilter = campaignId ? `AND campaign.id = ${campaignId.replace(/[^0-9]/g, "")}` : "";

  const query = `
    SELECT
      search_term_view.search_term,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM search_term_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      ${campaignFilter}
      AND metrics.clicks > 2
    ORDER BY metrics.cost_micros DESC
    LIMIT 500
  `;

  const results = await client.query(query) as Array<{ results?: Array<Record<string, any>> }>;
  const candidates: NegativeKeywordCandidate[] = [];

  for (const batch of results) {
    for (const row of batch.results ?? []) {
      const cost = Number(row.metrics?.costMicros ?? 0) / 1_000_000;
      const conversions = Number(row.metrics?.conversions ?? 0);
      const clicks = Number(row.metrics?.clicks ?? 0);
      const impressions = Number(row.metrics?.impressions ?? 0);
      const searchTerm = String(row.searchTermView?.searchTerm ?? "");

      // Flag terms with spend but no conversions, or very low CTR
      if (cost > NEGATIVE_SPEND_THRESHOLD && conversions === 0) {
        candidates.push({
          searchTerm,
          impressions,
          clicks,
          cost,
          conversions,
          reason: `Spent €${cost.toFixed(2)} with 0 conversions`,
        });
      } else if (clicks > NEGATIVE_CLICK_THRESHOLD && conversions === 0 && cost > NEGATIVE_CLICK_MIN_SPEND) {
        candidates.push({
          searchTerm,
          impressions,
          clicks,
          cost,
          conversions,
          reason: `${clicks} clicks, 0 conversions`,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.cost - a.cost);
}

/**
 * Add negative keywords to a campaign or ad group.
 */
export async function addNegativeKeywords(
  client: GoogleAdsClient,
  campaignResourceName: string,
  keywords: string[],
  level: "campaign" | "ad_group" = "campaign",
  adGroupResourceName?: string,
): Promise<number> {
  if (level === "campaign") {
    const ops = keywords.map((kw) => ({
      create: {
        campaign: campaignResourceName,
        negative: true,
        keyword: {
          text: kw,
          match_type: "PHRASE",
        },
      },
    }));
    const result = await client.mutateResource("campaignCriteria", ops);
    return result.results.length;
  }

  if (!adGroupResourceName) {
    throw new Error("adGroupResourceName required for ad_group level negatives");
  }

  const ops = keywords.map((kw) => ({
    create: {
      ad_group: adGroupResourceName,
      negative: true,
      keyword: {
        text: kw,
        match_type: "PHRASE",
      },
    },
  }));
  const result = await client.mutateResource("adGroupCriteria", ops);
  return result.results.length;
}

/**
 * Get quality score breakdown for keywords.
 */
export async function getQualityScoreBreakdown(
  client: GoogleAdsClient,
): Promise<{
  average: number;
  distribution: Record<number, number>;
  lowScoreKeywords: Array<{
    keyword: string;
    score: number;
    expectedCtr: string;
    adRelevance: string;
    landingPage: string;
    cost: number;
  }>;
}> {
  const query = `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.quality_info.quality_score,
      ad_group_criterion.quality_info.creative_quality_score,
      ad_group_criterion.quality_info.search_predicted_ctr,
      ad_group_criterion.quality_info.post_click_quality_score,
      metrics.cost_micros,
      metrics.impressions
    FROM keyword_view
    WHERE ad_group_criterion.status = 'ENABLED'
      AND campaign.status = 'ENABLED'
      AND ad_group_criterion.quality_info.quality_score IS NOT NULL
    ORDER BY metrics.cost_micros DESC
    LIMIT 200
  `;

  const results = await client.query(query) as Array<{ results?: Array<Record<string, any>> }>;

  const distribution: Record<number, number> = {};
  const lowScoreKeywords: Array<{
    keyword: string;
    score: number;
    expectedCtr: string;
    adRelevance: string;
    landingPage: string;
    cost: number;
  }> = [];

  let totalScore = 0;
  let count = 0;

  for (const batch of results) {
    for (const row of batch.results ?? []) {
      const score = Number(row.adGroupCriterion?.qualityInfo?.qualityScore ?? 0);
      const keyword = String(row.adGroupCriterion?.keyword?.text ?? "");
      const cost = Number(row.metrics?.costMicros ?? 0) / 1_000_000;

      distribution[score] = (distribution[score] ?? 0) + 1;
      totalScore += score;
      count++;

      if (score <= 5) {
        lowScoreKeywords.push({
          keyword,
          score,
          expectedCtr: String(row.adGroupCriterion?.qualityInfo?.searchPredictedCtr ?? "UNSPECIFIED"),
          adRelevance: String(row.adGroupCriterion?.qualityInfo?.creativeQualityScore ?? "UNSPECIFIED"),
          landingPage: String(row.adGroupCriterion?.qualityInfo?.postClickQualityScore ?? "UNSPECIFIED"),
          cost,
        });
      }
    }
  }

  return {
    average: count > 0 ? totalScore / count : 0,
    distribution,
    lowScoreKeywords: lowScoreKeywords.sort((a, b) => b.cost - a.cost).slice(0, 20),
  };
}
