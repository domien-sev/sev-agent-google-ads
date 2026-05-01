/** Google Ads campaign types */
export type GoogleCampaignType = "search" | "shopping" | "pmax" | "display" | "youtube" | "demand_gen";

/**
 * Google Ads language constant IDs — single source of truth.
 * See: https://developers.google.com/google-ads/api/reference/data/codes-formats#languages
 */
export const LANGUAGE_CONSTANTS = {
  nl: "1010",   // Dutch
  fr: "1002",   // French
  en: "1000",   // English
  de: "1001",   // German
} as const;

/** Get the languageConstants/ resource string for a language code */
export function languageConstant(lang: keyof typeof LANGUAGE_CONSTANTS): string {
  return `languageConstants/${LANGUAGE_CONSTANTS[lang]}`;
}

/** Keyword match types */
export type KeywordMatchType = "EXACT" | "PHRASE" | "BROAD";

/** Quality score components */
export type QualityComponent = "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE" | "UNSPECIFIED";

/** PMax asset group performance labels */
export type AssetGroupPerformance = "BEST" | "GOOD" | "LOW" | "LEARNING" | "UNSPECIFIED";

/** Audience segment types */
export type AudienceType =
  | "custom_intent"
  | "custom_affinity"
  | "remarketing"
  | "similar"
  | "in_market";

/** Search term action */
export type SearchTermAction = "none" | "added_as_keyword" | "added_as_negative";

/** Google Ads keyword record (for ops Directus) */
export interface GoogleAdsKeyword {
  id?: string;
  campaign_id: string;
  ad_group_id: string;
  keyword_text: string;
  match_type: KeywordMatchType;
  max_cpc_micros: number;
  quality_score: number | null;
  expected_ctr: QualityComponent | null;
  ad_relevance: QualityComponent | null;
  landing_page_exp: QualityComponent | null;
  impressions_30d: number;
  clicks_30d: number;
  conversions_30d: number;
  cost_30d: number;
  status: "ENABLED" | "PAUSED" | "REMOVED";
  last_synced: string;
  date_created?: string;
  date_updated?: string;
}

/** Search term report record (for ops Directus) */
export interface GoogleAdsSearchTerm {
  id?: string;
  campaign_id: string;
  search_term: string;
  keyword_text: string;
  match_type: KeywordMatchType;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  date: string;
  action_taken: SearchTermAction;
  date_created?: string;
}

/** Audience segment record (for ops Directus) */
export interface GoogleAdsAudience {
  id?: string;
  name: string;
  resource_name: string;
  type: AudienceType;
  criteria: AudienceCriteria;
  size_estimate: number | null;
  campaigns: string[];
  status: "ENABLED" | "PAUSED" | "REMOVED";
  date_created?: string;
  date_updated?: string;
}

export interface AudienceCriteria {
  urls?: string[];
  keywords?: string[];
  apps?: string[];
}

/** PMax asset group record (for ops Directus) */
export interface GoogleAdsAssetGroup {
  id?: string;
  campaign_id: string;
  resource_name: string;
  name: string;
  final_urls: string[];
  headlines: AssetWithLabel[];
  descriptions: AssetWithLabel[];
  image_asset_ids: string[];
  video_asset_ids: string[];
  listing_group_filters: Record<string, unknown>;
  performance_label: AssetGroupPerformance;
  status: "ENABLED" | "PAUSED" | "REMOVED";
  date_created?: string;
  date_updated?: string;
}

export interface AssetWithLabel {
  text: string;
  performance_label?: AssetGroupPerformance;
}

/** Campaign audit result */
export interface CampaignAudit {
  campaignId: string;
  campaignName: string;
  type: string;
  status: string;
  budgetMicros: number;
  impressions30d: number;
  clicks30d: number;
  cost30d: number;
  conversions30d: number;
  roas30d: number;
  issues: string[];
  recommendations: string[];
}

/** Account health score */
export interface AccountHealthScore {
  overall: number;
  categories: {
    budgetUtilization: number;
    qualityScore: number;
    conversionTracking: number;
    adCoverage: number;
    negativeKeywords: number;
  };
  campaigns: CampaignAudit[];
  topIssues: string[];
}

/** GAQL query result row (generic — permissive because GAQL results are dynamic) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GaqlRow = Record<string, any>;

/** Campaign builder config for all 5 types */
export interface CampaignConfig {
  type: GoogleCampaignType;
  name: string;
  dailyBudgetMicros: number;
  targetRoas?: number;
  targetCpa?: number;
  locations: string[];
  languages: string[];
  startDate: string;
  endDate?: string;
  // Search-specific
  keywords?: Array<{ text: string; matchType: KeywordMatchType }>;
  adGroupName?: string;
  responsiveSearchAd?: {
    headlines: string[];
    descriptions: string[];
    finalUrl: string;
    path1?: string;
    path2?: string;
  };
  // Shopping-specific
  merchantId?: string;
  feedLabel?: string;
  /** Filter Shopping campaign to specific products by dimension (brand, product_type, custom_label, etc.) */
  inventoryFilter?: {
    /** Dimension to filter on */
    dimension: "brand" | "product_type" | "custom_label_0" | "custom_label_1" | "custom_label_2" | "custom_label_3" | "custom_label_4";
    /** Values to include (everything else is excluded) */
    values: string[];
  };
  // PMax-specific
  assetGroup?: {
    name: string;
    finalUrls: string[];
    headlines: string[];
    longHeadlines?: string[];
    descriptions: string[];
    imageUrls?: string[];
    videoIds?: string[];
  };
  // Display-specific
  displayNetwork?: boolean;
  // YouTube / Demand Gen specific
  videoId?: string;
  companionBannerUrl?: string;
  videoAds?: YouTubeVideoAd[];
  /** YouTube ad format — defaults to "action" (Video Action / tCPA) */
  youtubeAdFormat?: YouTubeAdFormat;
  /** Logo image asset resource name (required for Demand Gen) */
  logoImageAsset?: string;
  /** Business name shown in Demand Gen ads */
  businessName?: string;
  // Geo targeting
  targetCountry?: string;
  proximityRadius?: number;
  proximityAddress?: string;
  proximityPostalCode?: string;
  // URL tracking
  trackingUrlTemplate?: string;
}

/** YouTube ad format types */
export type YouTubeAdFormat =
  | "action"          // Video Action (tCPA/tROAS, drive conversions)
  | "instream"        // Skippable in-stream (awareness/reach)
  | "bumper"          // 6s non-skippable bumper (reach)
  | "infeed";         // In-feed / discovery (consideration)

// ---------------------------------------------------------------------------
// Belvoir content pipeline types
// ---------------------------------------------------------------------------

/** Belvoir article categories */
export type BelvoirCategory = "mode" | "schoonheid" | "welzijn" | "verkopen";

/** Article extracted from belvoir.be */
export interface BelvoirArticle {
  directus_article_id: string;
  title_nl: string;
  title_fr: string;
  slug: string;
  url: string;
  category: BelvoirCategory;
  featured_image_url: string;
  body_images: string[];
  excerpt_nl: string;
  excerpt_fr: string;
  body_text: string;
  tags: string[];
  brands_mentioned: string[];
  affiliate_links: Array<{ url: string; brand: string; product?: string }>;
  date_published: string;
}

/** Pipeline config per category (stored in Directus belvoir_pipeline_config) */
export interface BelvoirPipelineConfig {
  id?: string;
  category: BelvoirCategory;
  campaign_types: GoogleCampaignType[];
  default_daily_budget: number;
  default_duration_days: number;
  keyword_strategy: {
    negative_keywords?: string[];
    match_preference?: KeywordMatchType;
  };
  target_locations: string[];
  platforms: string[];
  enabled: boolean;
}

/** Pipeline status for an article */
export type BelvoirPipelineStatus =
  | "new"
  | "processing"
  | "campaigns_created"
  | "active"
  | "paused"
  | "completed"
  | "failed";

/** Belvoir article record in ops Directus */
export interface BelvoirArticleRecord {
  id?: string;
  directus_article_id: string;
  title_nl: string;
  title_fr: string;
  slug: string;
  url: string;
  category: BelvoirCategory;
  featured_image_url: string;
  excerpt_nl: string;
  excerpt_fr: string;
  tags: string[];
  brands_mentioned: string[];
  pipeline_status: BelvoirPipelineStatus;
  pipeline_error: string | null;
  campaign_ids: string[];
  creative_ids: string[];
  total_spend: number;
  total_revenue: number;
  roi: number;
  date_published: string;
  date_created?: string;
  date_updated?: string;
}

/** Request to the article pipeline */
export interface BelvoirPipelineRequest {
  articleUrl?: string;
  articleId?: string;
  execute?: boolean;
  budgetOverride?: number;
  campaignTypesOverride?: GoogleCampaignType[];
}

/** Generated ad copy for an article */
export interface ArticleAdCopy {
  nl: {
    headlines: string[];
    descriptions: string[];
    callouts: string[];
    path1: string;
    path2: string;
  };
  fr: {
    headlines: string[];
    descriptions: string[];
    callouts: string[];
    path1: string;
    path2: string;
  };
}

/** Keyword set extracted from an article */
export interface ArticleKeywordSet {
  branded: Array<{ text: string; matchType: KeywordMatchType }>;
  product: Array<{ text: string; matchType: KeywordMatchType }>;
  intent: Array<{ text: string; matchType: KeywordMatchType }>;
  category: Array<{ text: string; matchType: KeywordMatchType }>;
}

/** YouTube call-to-action types */
export type YouTubeCallToAction =
  | "SHOP_NOW"
  | "LEARN_MORE"
  | "SIGN_UP"
  | "GET_OFFER"
  | "BOOK_NOW"
  | "APPLY_NOW"
  | "CONTACT_US"
  | "VISIT_SITE";

/** A single video ad within a YouTube campaign */
export interface YouTubeVideoAd {
  /** YouTube video ID (the ?v= part) */
  videoId: string;
  /** Headlines for video responsive ad (max 5, each ≤15 chars for short, ≤90 for long) */
  headlines?: string[];
  /** Long headlines (≤90 chars, used in in-feed placements) */
  longHeadlines?: string[];
  /** Descriptions (max 5, each ≤90 chars) */
  descriptions?: string[];
  /** Landing page URL */
  finalUrl: string;
  /** Call-to-action button text */
  callToAction?: YouTubeCallToAction;
  /** Optional companion banner image URL (300x60) */
  companionBannerUrl?: string;
  /** Optional ad group name override */
  adGroupName?: string;
}
