import { LANGUAGE_CONSTANTS } from "../types.js";

/**
 * Keyword enrichment step for the campaign wizard.
 *
 * After AI generates keywords, this module:
 * 1. Gets volume/competition from Keyword Planner API
 * 2. Checks historical performance from past campaigns (google_ads_keywords)
 * 3. Finds negative keyword candidates from past search term data
 * 4. Retrieves keyword learnings from vector memory
 */

import type { GoogleAdsClient } from "@domien-sev/ads-sdk";
import { researchKeywords, getKeywordMetrics, findNegativeCandidates } from "./keyword-planner.js";
import type { KeywordIdea, NegativeKeywordCandidate } from "./keyword-planner.js";

const DIRECTUS_URL = process.env.DIRECTUS_URL ?? "https://ops.shoppingeventvip.be";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN ?? "";
const PGVECTOR_URL = process.env.PGVECTOR_CONNECTION_STRING ?? "";

interface WizardKeyword {
  text: string;
  matchType: "EXACT" | "PHRASE" | "BROAD";
  group: string;
}

interface KeywordHistory {
  keyword: string;
  avgQualityScore: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  totalCost: number;
  campaigns: string[];
}

export interface EnrichedKeyword extends WizardKeyword {
  /** Monthly search volume from Keyword Planner */
  volume?: number;
  /** Competition level */
  competition?: "LOW" | "MEDIUM" | "HIGH";
  /** Estimated CPC range */
  bidRange?: { low: number; high: number };
  /** Historical quality score from past campaigns */
  historyQS?: number;
  /** Historical conversion count */
  historyConversions?: number;
  /** Past campaigns that used this keyword */
  historyCampaigns?: string[];
  /** Flag: keyword performed poorly in past */
  warning?: string;
}

export interface KeywordEnrichmentResult {
  enrichedKeywords: EnrichedKeyword[];
  /** New keyword suggestions from Keyword Planner (not in original list) */
  additionalSuggestions: KeywordIdea[];
  /** Negative keyword candidates from past search terms */
  negativeCandidates: NegativeKeywordCandidate[];
  /** Learnings from past campaigns (from vector memory) */
  keywordLearnings: string[];
}

/**
 * Enrich wizard keywords with real data before user review.
 */
export async function enrichKeywords(
  googleAds: GoogleAdsClient,
  keywords: WizardKeyword[],
  brand: string,
  language: "nl" | "fr" | "both",
): Promise<KeywordEnrichmentResult> {
  const keywordTexts = keywords.map((k) => k.text);
  const langId = language === "fr" ? LANGUAGE_CONSTANTS.fr : LANGUAGE_CONSTANTS.nl;

  // Run all enrichment in parallel
  const [plannerMetrics, expandedIdeas, history, negatives, learnings] =
    await Promise.allSettled([
      // 1. Get volume/competition for the wizard's keywords
      getKeywordMetrics(googleAds, keywordTexts, { language: langId }),

      // 2. Discover additional keyword ideas from the same seeds
      researchKeywords(googleAds, {
        seedKeywords: keywordTexts.slice(0, 10), // API limit on seeds
        language: langId,
        limit: 30,
      }),

      // 3. Check historical performance from past campaigns
      fetchKeywordHistory(googleAds, keywordTexts),

      // 4. Find negative candidates from past search terms for this brand
      findNegativeCandidates(googleAds, undefined, 90),

      // 5. Retrieve keyword learnings from vector memory
      fetchKeywordLearnings(brand),
    ]);

  // Build metrics lookup
  const metricsMap = new Map<string, KeywordIdea>();
  if (plannerMetrics.status === "fulfilled") {
    for (const m of plannerMetrics.value) {
      metricsMap.set(m.keyword.toLowerCase(), m);
    }
  }

  // Build history lookup
  const historyMap = new Map<string, KeywordHistory>();
  if (history.status === "fulfilled") {
    for (const h of history.value) {
      historyMap.set(h.keyword.toLowerCase(), h);
    }
  }

  // Enrich each keyword
  const enrichedKeywords: EnrichedKeyword[] = keywords.map((kw) => {
    const metrics = metricsMap.get(kw.text.toLowerCase());
    const hist = historyMap.get(kw.text.toLowerCase());

    const enriched: EnrichedKeyword = { ...kw };

    if (metrics) {
      enriched.volume = metrics.avgMonthlySearches;
      enriched.competition = metrics.competition === "UNSPECIFIED" ? undefined : metrics.competition;
      enriched.bidRange = {
        low: metrics.lowTopOfPageBidMicros / 1_000_000,
        high: metrics.highTopOfPageBidMicros / 1_000_000,
      };
    }

    if (hist) {
      enriched.historyQS = hist.avgQualityScore;
      enriched.historyConversions = hist.totalConversions;
      enriched.historyCampaigns = hist.campaigns;

      // Flag poor performers
      if (hist.avgQualityScore > 0 && hist.avgQualityScore < 4) {
        enriched.warning = `Low QS (${hist.avgQualityScore.toFixed(1)}) in past campaigns`;
      }
      if (hist.totalCost > 50 && hist.totalConversions === 0) {
        enriched.warning = `€${hist.totalCost.toFixed(0)} spent, 0 conversions in past`;
      }
    }

    return enriched;
  });

  // Filter additional suggestions to exclude already-selected keywords
  const existingSet = new Set(keywordTexts.map((k) => k.toLowerCase()));
  const additionalSuggestions = (expandedIdeas.status === "fulfilled" ? expandedIdeas.value : [])
    .filter((idea) => !existingSet.has(idea.keyword.toLowerCase()))
    .slice(0, 15);

  return {
    enrichedKeywords,
    additionalSuggestions,
    negativeCandidates: negatives.status === "fulfilled" ? negatives.value.slice(0, 10) : [],
    keywordLearnings: learnings.status === "fulfilled" ? learnings.value : [],
  };
}

/**
 * Fetch historical keyword performance from Google Ads (past 90 days).
 */
async function fetchKeywordHistory(
  googleAds: GoogleAdsClient,
  keywords: string[],
): Promise<KeywordHistory[]> {
  if (keywords.length === 0) return [];

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 90 * 86_400_000).toISOString().split("T")[0];

  const query = `
    SELECT
      ad_group_criterion.keyword.text,
      ad_group_criterion.quality_info.quality_score,
      campaign.name,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions,
      metrics.cost_micros
    FROM keyword_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND ad_group_criterion.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 1000
  `.trim();

  const results = await googleAds.query(query) as Array<{
    results?: Array<Record<string, any>>;
  }>;

  // Aggregate by keyword text
  const map = new Map<string, KeywordHistory>();
  const keywordSet = new Set(keywords.map((k) => k.toLowerCase()));

  for (const batch of results) {
    for (const row of batch.results ?? []) {
      const text = String(row.adGroupCriterion?.keyword?.text ?? "").toLowerCase();
      if (!keywordSet.has(text)) continue;

      const existing: KeywordHistory = map.get(text) ?? {
        keyword: row.adGroupCriterion?.keyword?.text ?? text,
        avgQualityScore: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalConversions: 0,
        totalCost: 0,
        campaigns: [],
      };

      const qs = Number(row.adGroupCriterion?.qualityInfo?.qualityScore ?? 0);
      if (qs > 0) {
        existing.avgQualityScore = existing.avgQualityScore > 0
          ? (existing.avgQualityScore + qs) / 2
          : qs;
      }

      existing.totalImpressions += Number(row.metrics?.impressions ?? 0);
      existing.totalClicks += Number(row.metrics?.clicks ?? 0);
      existing.totalConversions += Number(row.metrics?.conversions ?? 0);
      existing.totalCost += Number(row.metrics?.costMicros ?? 0) / 1_000_000;

      const campaign = String(row.campaign?.name ?? "");
      if (campaign && !existing.campaigns.includes(campaign)) {
        existing.campaigns.push(campaign);
      }

      map.set(text, existing);
    }
  }

  return Array.from(map.values());
}

/**
 * Retrieve keyword-related learnings from vector memory (pgvector).
 * Searches for past ad copy with similar keywords and extracts learnings.
 */
async function fetchKeywordLearnings(brand: string): Promise<string[]> {
  if (!PGVECTOR_URL || !DIRECTUS_TOKEN) return [];

  try {
    // Search ad_copy_library for this brand's past campaigns with performance scores
    const res = await fetch(
      `${DIRECTUS_URL}/items/ad_copy_library?` +
        `filter[brand][_icontains]=${encodeURIComponent(brand)}` +
        `&filter[performance_score][_nnull]=true` +
        `&sort=-performance_score` +
        `&fields=campaign_name,keywords,performance_score,feedback_applied` +
        `&limit=10`,
      { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } },
    );

    if (!res.ok) return [];

    const data = await res.json() as {
      data: Array<{
        campaign_name: string;
        keywords: Array<{ text: string; matchType: string }> | null;
        performance_score: number;
        feedback_applied: string[] | null;
      }>;
    };

    const learnings: string[] = [];

    // Extract patterns from high-performing campaigns
    const highPerf = data.data.filter((d) => d.performance_score >= 60);
    if (highPerf.length > 0) {
      const topKeywords = highPerf
        .flatMap((d) => d.keywords ?? [])
        .map((k) => k.text);
      const unique = [...new Set(topKeywords)];
      if (unique.length > 0) {
        learnings.push(`Top-performing keywords for ${brand}: ${unique.slice(0, 10).join(", ")}`);
      }
    }

    // Extract patterns from low-performing campaigns
    const lowPerf = data.data.filter((d) => d.performance_score < 30 && d.performance_score > 0);
    if (lowPerf.length > 0) {
      const badKeywords = lowPerf
        .flatMap((d) => d.keywords ?? [])
        .map((k) => k.text);
      const unique = [...new Set(badKeywords)];
      if (unique.length > 0) {
        learnings.push(`Underperforming keywords for ${brand}: ${unique.slice(0, 10).join(", ")}`);
      }
    }

    // Include user feedback from past campaigns
    const feedback = data.data
      .flatMap((d) => d.feedback_applied ?? [])
      .filter(Boolean);
    if (feedback.length > 0) {
      learnings.push(`Past feedback: ${feedback.slice(0, 5).join("; ")}`);
    }

    return learnings;
  } catch {
    return [];
  }
}

/**
 * Format enrichment results for Slack display.
 */
export function formatEnrichmentForSlack(result: KeywordEnrichmentResult): string {
  const lines: string[] = [":mag: *Keyword Research Results*", ""];

  // Enriched keywords
  lines.push("*Your keywords (with real data):*");
  for (const kw of result.enrichedKeywords) {
    const vol = kw.volume ? `${kw.volume.toLocaleString()}/mo` : "?";
    const comp = kw.competition ? kw.competition.charAt(0) : "?";
    const bid = kw.bidRange ? `€${kw.bidRange.low.toFixed(2)}–${kw.bidRange.high.toFixed(2)}` : "";
    const qs = kw.historyQS ? ` QS:${kw.historyQS.toFixed(1)}` : "";
    const warn = kw.warning ? ` :warning: ${kw.warning}` : "";
    lines.push(`  \`${kw.text}\` [${kw.matchType}] — ${vol} | ${comp} ${bid}${qs}${warn}`);
  }

  // Additional suggestions
  if (result.additionalSuggestions.length > 0) {
    lines.push("", "*Suggested additions (not in your list):*");
    for (const idea of result.additionalSuggestions.slice(0, 10)) {
      const vol = idea.avgMonthlySearches.toLocaleString();
      const comp = idea.competition === "UNSPECIFIED" ? "?" : idea.competition.charAt(0);
      const bid = (idea.highTopOfPageBidMicros / 1_000_000).toFixed(2);
      lines.push(`  \`${idea.keyword}\` — ${vol}/mo | ${comp} | ~€${bid}`);
    }
    lines.push('_Use `add keyword [text]` to add any of these._');
  }

  // Negative candidates
  if (result.negativeCandidates.length > 0) {
    lines.push("", "*Suggested negatives (wasted spend in past):*");
    for (const neg of result.negativeCandidates.slice(0, 5)) {
      lines.push(`  \`${neg.searchTerm}\` — ${neg.reason}`);
    }
    lines.push('_Use `add negative [text]` to add these._');
  }

  // Learnings
  if (result.keywordLearnings.length > 0) {
    lines.push("", "*Learnings from past campaigns:*");
    for (const l of result.keywordLearnings) {
      lines.push(`  • ${l}`);
    }
  }

  return lines.join("\n");
}
