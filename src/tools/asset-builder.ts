/**
 * Google Ads Campaign Asset Builder.
 * Creates and links sitelinks, callouts, structured snippets,
 * and promotion assets to campaigns.
 *
 * All assets use snake_case field names for the Google Ads REST API.
 */
import type { GoogleAdsClient } from "@domien-sev/ads-sdk";

interface SitelinkInput {
  linkText: string;
  description1: string;
  description2: string;
  finalUrl: string;
}

interface AssetResult {
  sitelinks: number;
  callouts: number;
  structuredSnippets: number;
  promotions: number;
  errors: string[];
}

/**
 * Create an asset and return its resource name.
 */
async function createAsset(
  client: GoogleAdsClient,
  assetData: Record<string, unknown>,
): Promise<string | null> {
  try {
    const result = await client.mutateResource("assets", [{
      create: assetData,
    }]);
    return result.results[0].resourceName;
  } catch (err) {
    console.warn(`[asset-builder] Create asset failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Link an asset to a campaign.
 */
async function linkAssetToCampaign(
  client: GoogleAdsClient,
  campaignResourceName: string,
  assetResourceName: string,
  fieldType: string,
): Promise<boolean> {
  try {
    await client.mutateResource("campaignAssets", [{
      create: {
        campaign: campaignResourceName,
        asset: assetResourceName,
        field_type: fieldType,
      },
    }]);
    return true;
  } catch (err) {
    console.warn(`[asset-builder] Link asset failed (${fieldType}): ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Create and link sitelink assets to a campaign.
 */
export async function createSitelinks(
  client: GoogleAdsClient,
  campaignRn: string,
  sitelinks: SitelinkInput[],
): Promise<number> {
  let count = 0;
  for (const sl of sitelinks) {
    const assetRn = await createAsset(client, {
      name: `Sitelink: ${sl.linkText}`,
      sitelink_asset: {
        link_text: sl.linkText,
        description1: sl.description1,
        description2: sl.description2,
      },
      final_urls: [sl.finalUrl],
    });

    if (assetRn && await linkAssetToCampaign(client, campaignRn, assetRn, "SITELINK")) {
      count++;
    }
  }
  return count;
}

/**
 * Create and link callout assets to a campaign.
 * Callout text max 25 characters.
 */
export async function createCallouts(
  client: GoogleAdsClient,
  campaignRn: string,
  callouts: string[],
): Promise<number> {
  let count = 0;
  for (const text of callouts) {
    const truncated = text.slice(0, 25);
    const assetRn = await createAsset(client, {
      name: `Callout: ${truncated}`,
      callout_asset: { callout_text: truncated },
    });

    if (assetRn && await linkAssetToCampaign(client, campaignRn, assetRn, "CALLOUT")) {
      count++;
    }
  }
  return count;
}

/**
 * Create and link a structured snippet asset to a campaign.
 * Header must be one of Google's predefined headers.
 */
export async function createStructuredSnippet(
  client: GoogleAdsClient,
  campaignRn: string,
  header: string,
  values: string[],
): Promise<boolean> {
  const assetRn = await createAsset(client, {
    name: `Snippet: ${header}`,
    structured_snippet_asset: {
      header,
      values: values.slice(0, 10),
    },
  });

  if (!assetRn) return false;
  return linkAssetToCampaign(client, campaignRn, assetRn, "STRUCTURED_SNIPPET");
}

/**
 * Create and link a promotion asset to a campaign.
 */
export async function createPromotionAsset(
  client: GoogleAdsClient,
  campaignRn: string,
  params: {
    promotionText: string;
    discountType: "PERCENT_OFF" | "MONETARY_DISCOUNT" | "UP_TO_PERCENT_OFF" | "UP_TO_MONETARY_DISCOUNT";
    percentOff?: number;
    finalUrl: string;
    startDate?: string;
    endDate?: string;
    language: string;
    occasion?: string;
  },
): Promise<boolean> {
  const promoData: Record<string, unknown> = {
    name: `Promo: ${params.promotionText}`,
    promotion_asset: {
      promotion_target: params.promotionText,
      discount_modifier: params.discountType,
      ...(params.percentOff && { percent_off: params.percentOff }),
      language_code: params.language,
      ...(params.startDate && { start_date: params.startDate.replace(/-/g, "") }),
      ...(params.endDate && { end_date: params.endDate.replace(/-/g, "") }),
      ...(params.occasion && { occasion: params.occasion }),
    },
    final_urls: [params.finalUrl],
  };

  const assetRn = await createAsset(client, promoData);
  if (!assetRn) return false;
  return linkAssetToCampaign(client, campaignRn, assetRn, "PROMOTION");
}

/**
 * High-level: create all campaign assets from wizard recommendations + event data.
 * Non-fatal — campaigns still work without assets.
 */
export async function createCampaignAssets(
  client: GoogleAdsClient,
  campaignRn: string,
  params: {
    sitelinks?: SitelinkInput[];
    callouts?: string[];
    brands?: string[];
    promotionText?: string;
    discountPercent?: number;
    finalUrl: string;
    eventStartDate?: string;
    eventEndDate?: string;
    language?: string;
    hasParking?: boolean;
    eventType?: "physical" | "online";
  },
): Promise<AssetResult> {
  const result: AssetResult = { sitelinks: 0, callouts: 0, structuredSnippets: 0, promotions: 0, errors: [] };

  // 1. Sitelinks
  if (params.sitelinks && params.sitelinks.length > 0) {
    try {
      result.sitelinks = await createSitelinks(client, campaignRn, params.sitelinks);
    } catch (err) {
      result.errors.push(`Sitelinks: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Callouts
  if (params.callouts && params.callouts.length > 0) {
    try {
      result.callouts = await createCallouts(client, campaignRn, params.callouts);
    } catch (err) {
      result.errors.push(`Callouts: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Structured Snippets — brands list
  if (params.brands && params.brands.length >= 3) {
    try {
      const ok = await createStructuredSnippet(client, campaignRn, "Brands", params.brands.slice(0, 10));
      if (ok) result.structuredSnippets++;
    } catch (err) {
      result.errors.push(`Structured Snippets: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 4. Promotion asset
  if (params.promotionText) {
    try {
      const ok = await createPromotionAsset(client, campaignRn, {
        promotionText: params.promotionText,
        discountType: params.discountPercent ? "UP_TO_PERCENT_OFF" : "PERCENT_OFF",
        percentOff: params.discountPercent ?? 70,
        finalUrl: params.finalUrl,
        startDate: params.eventStartDate,
        endDate: params.eventEndDate,
        language: params.language ?? "nl",
        occasion: "SALE",
      });
      if (ok) result.promotions++;
    } catch (err) {
      result.errors.push(`Promotion: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const total = result.sitelinks + result.callouts + result.structuredSnippets + result.promotions;
  console.log(`[asset-builder] Created ${total} assets for campaign (${result.sitelinks} sitelinks, ${result.callouts} callouts, ${result.structuredSnippets} snippets, ${result.promotions} promos)`);
  if (result.errors.length > 0) {
    console.warn(`[asset-builder] Errors: ${result.errors.join("; ")}`);
  }

  return result;
}

/**
 * Generate default sitelinks for a physical event campaign.
 */
export function generateEventSitelinks(
  eventUrl: string,
  language: "nl" | "fr",
): SitelinkInput[] {
  if (language === "fr") {
    return [
      { linkText: "Voir l'Événement", description1: "Tous les détails de la vente", description2: "Dates, lieu et marques", finalUrl: eventUrl },
      { linkText: "Toutes les Marques", description1: "Découvrez les marques disponibles", description2: "Fashion outlet premium", finalUrl: "https://www.shoppingeventvip.be/fr/marques" },
      { linkText: "S'inscrire", description1: "Inscription obligatoire", description2: "Places limitées", finalUrl: eventUrl },
      { linkText: "Événements à Venir", description1: "Prochaines ventes privées", description2: "Ne manquez rien", finalUrl: "https://www.shoppingeventvip.be/fr" },
    ];
  }

  return [
    { linkText: "Bekijk het Event", description1: "Alle details over de verkoop", description2: "Data, locatie en merken", finalUrl: eventUrl },
    { linkText: "Alle Merken", description1: "Ontdek de beschikbare merken", description2: "Premium fashion outlet", finalUrl: "https://www.shoppingeventvip.be/nl/merken" },
    { linkText: "Inschrijven", description1: "Inschrijving verplicht", description2: "Beperkte plaatsen", finalUrl: eventUrl },
    { linkText: "Komende Events", description1: "Volgende privéverkopen", description2: "Mis niets", finalUrl: "https://www.shoppingeventvip.be/nl" },
  ];
}

/**
 * Generate default callouts for a physical event campaign.
 */
export function generateEventCallouts(
  language: "nl" | "fr",
  hasParking = false,
  isPhysical = true,
): string[] {
  if (language === "fr") {
    const callouts = ["Jusqu'à -70%", "Marques Premium", "Vente Exclusive"];
    if (isPhysical) {
      callouts.push("Places Limitées");
      callouts.push("Inscription Obligatoire");
    }
    if (hasParking) callouts.push("Parking Gratuit");
    return callouts;
  }

  const callouts = ["Tot -70% Korting", "Topmerken Outlet", "Exclusieve Verkoop"];
  if (isPhysical) {
    callouts.push("Beperkte Plaatsen");
    callouts.push("Inschrijving Verplicht");
  }
  if (hasParking) callouts.push("Gratis Parking");
  return callouts;
}
