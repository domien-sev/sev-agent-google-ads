/**
 * Article-to-keywords extractor.
 * Uses LLM to extract keyword seeds from article content,
 * then enriches via Google Ads Keyword Planner.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { GoogleAdsClient } from "@domien-sev/ads-sdk";
import { researchKeywords } from "./keyword-planner.js";
import { LANGUAGE_CONSTANTS } from "../types.js";
import type { BelvoirArticle, ArticleKeywordSet, KeywordMatchType } from "../types.js";

const anthropic = new Anthropic();

/**
 * Extract keyword seeds from article content using LLM.
 */
async function extractKeywordSeeds(article: BelvoirArticle, lang: "nl" | "fr"): Promise<ArticleKeywordSet> {
  const langLabel = lang === "nl" ? "Dutch (Belgium)" : "French (Belgium)";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a Google Ads keyword research specialist for the Belgian market.

Extract keyword seeds from this article for a ${langLabel} Google Ads Search campaign.
The article is from belvoir.be, a fashion/beauty/wellness content platform.

Article title: ${article.title_nl}
Category: ${article.category}
Tags: ${article.tags.join(", ")}
Brands mentioned: ${article.brands_mentioned.join(", ")}
Excerpt: ${article.excerpt_nl}
Content (first 2000 chars): ${article.body_text.slice(0, 2000)}

Generate keywords in ${langLabel} organized into 4 groups:
1. **branded**: Brand name variations (exact + phrase match)
2. **product**: Product/category keywords (phrase + broad match)
3. **intent**: Intent-based queries people search for (phrase + broad)
4. **category**: Broader category keywords (broad match)

Rules:
- Max CPC should stay under €0.60 for product/category keywords
- Include both singular and plural forms
- Include common misspellings for Belgian brands
- For FR: use Belgian French, not France French where different
- 5-8 keywords per group
- Match types: EXACT for branded, PHRASE for product/intent, BROAD for category

Respond with ONLY valid JSON:
{
  "branded": [{"text": "keyword", "matchType": "EXACT"}],
  "product": [{"text": "keyword", "matchType": "PHRASE"}],
  "intent": [{"text": "keyword", "matchType": "PHRASE"}],
  "category": [{"text": "keyword", "matchType": "BROAD"}]
}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse keyword extraction — no JSON in response");
  }

  return JSON.parse(jsonMatch[0]) as ArticleKeywordSet;
}

/**
 * Extract and enrich keywords from a Belvoir article.
 * Stage 1: LLM extracts keyword seeds from content.
 * Stage 2: Google Keyword Planner enriches with volume + competition data.
 */
export async function extractArticleKeywords(
  article: BelvoirArticle,
  lang: "nl" | "fr",
  googleAds?: GoogleAdsClient,
): Promise<{
  keywords: ArticleKeywordSet;
  enriched: Array<{
    text: string;
    matchType: KeywordMatchType;
    group: string;
    volume?: number;
    competition?: string;
    suggestedBid?: number;
  }>;
}> {
  // Stage 1: LLM extraction
  const keywords = await extractKeywordSeeds(article, lang);

  // Flatten all keywords for enrichment
  const allKeywords = [
    ...keywords.branded.map((k) => ({ ...k, group: "branded" })),
    ...keywords.product.map((k) => ({ ...k, group: "product" })),
    ...keywords.intent.map((k) => ({ ...k, group: "intent" })),
    ...keywords.category.map((k) => ({ ...k, group: "category" })),
  ];

  // Stage 2: Keyword Planner enrichment (if Google Ads client available)
  if (googleAds) {
    try {
      const seedTexts = allKeywords.map((k) => k.text).slice(0, 20);
      const ideas = await researchKeywords(googleAds, {
        seedKeywords: seedTexts,
        pageUrl: article.url,
        language: lang === "nl" ? LANGUAGE_CONSTANTS.nl : LANGUAGE_CONSTANTS.fr,
        geoTargets: ["2056"], // Belgium
        limit: 50,
      });

      // Build lookup map from Keyword Planner results
      const ideaMap = new Map(ideas.map((i) => [i.keyword.toLowerCase(), i]));

      // Enrich keywords with volume data
      const enriched = allKeywords.map((k) => {
        const idea = ideaMap.get(k.text.toLowerCase());
        return {
          text: k.text,
          matchType: k.matchType,
          group: k.group,
          volume: idea?.avgMonthlySearches,
          competition: idea?.competition,
          suggestedBid: idea ? idea.highTopOfPageBidMicros / 1_000_000 : undefined,
        };
      });

      // Filter out keywords with CPC > €0.60 for product/category groups
      const filtered = enriched.filter((k) => {
        if (k.group === "branded") return true;
        if (k.suggestedBid && k.suggestedBid > 0.60) return false;
        return true;
      });

      return { keywords, enriched: filtered };
    } catch (err) {
      // Keyword Planner may fail (rate limits, etc.) — return unenriched keywords
      console.warn("Keyword Planner enrichment failed:", err);
    }
  }

  // Return unenriched keywords
  return {
    keywords,
    enriched: allKeywords.map((k) => ({
      text: k.text,
      matchType: k.matchType,
      group: k.group,
    })),
  };
}
