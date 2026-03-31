/**
 * Typed campaign builder for all 5 Google Ads campaign types.
 * Uses the GoogleAdsClient from @domien-sev/ads-sdk for mutations.
 *
 * IMPORTANT: The Google Ads REST API requires snake_case field names.
 * All mutation payloads must use snake_case (e.g. campaign_budget, not campaignBudget).
 */
import type { GoogleAdsClient } from "@domien-sev/ads-sdk";
import type { CampaignConfig, GoogleCampaignType, YouTubeVideoAd } from "../types.js";

interface MutateOperation {
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
  updateMask?: string;
}

interface BuildResult {
  campaignResourceName: string;
  adGroupResourceName?: string;
  adGroupResourceNames?: string[];
  assetGroupResourceName?: string;
  adResourceNames?: string[];
  adWarning?: string;
}

/**
 * Build and create a campaign of any type.
 * Returns the resource names of created entities.
 */
export async function buildCampaign(
  client: GoogleAdsClient,
  config: CampaignConfig,
): Promise<BuildResult> {
  switch (config.type) {
    case "search":
      return buildSearchCampaign(client, config);
    case "shopping":
      return buildShoppingCampaign(client, config);
    case "pmax":
      return buildPMaxCampaign(client, config);
    case "display":
      return buildDisplayCampaign(client, config);
    case "youtube":
      return buildYouTubeCampaign(client, config);
    case "demand_gen":
      return buildDemandGenCampaign(client, config);
  }
}

/** Map our campaign type to Google's advertising_channel_type */
function channelType(type: GoogleCampaignType): string {
  const map: Record<GoogleCampaignType, string> = {
    search: "SEARCH",
    shopping: "SHOPPING",
    pmax: "PERFORMANCE_MAX",
    display: "DISPLAY",
    youtube: "VIDEO",
    demand_gen: "DEMAND_GEN",
  };
  return map[type];
}

/** Map campaign type to a sensible default bidding strategy.
 *  Default is MANUAL_CPC — avoids overbidding on new campaigns with no conversion data.
 *  Switch to smart bidding (tROAS/tCPA) only when explicitly configured. */
function biddingStrategy(config: CampaignConfig): Record<string, unknown> {
  if (config.targetRoas) {
    return { target_roas: { target_roas: config.targetRoas } };
  }
  if (config.targetCpa) {
    return { target_cpa: { target_cpa_micros: String(Math.round(config.targetCpa * 1_000_000)) } };
  }
  // Demand Gen requires smart bidding — manual CPC not supported
  if (config.type === "demand_gen") {
    return { maximize_conversions: {} };
  }
  return { manual_cpc: { enhanced_cpc_enabled: false } };
}

async function createBudget(client: GoogleAdsClient, name: string, amountMicros: number): Promise<string> {
  // Add timestamp suffix to avoid DUPLICATE_NAME errors from orphaned budgets
  const suffix = Date.now().toString(36);
  const result = await client.mutateResource("campaignBudgets", [{
    create: {
      name: `${name} Budget ${suffix}`,
      amount_micros: String(amountMicros),
      delivery_method: "STANDARD",
      explicitly_shared: false,
    },
  }]);
  return result.results[0].resourceName;
}

async function createBaseCampaign(
  client: GoogleAdsClient,
  config: CampaignConfig,
  budgetResourceName: string,
  extraFields: Record<string, unknown> = {},
): Promise<string> {
  // Create campaign — retry with versioned name if duplicate
  let campaignName = config.name;
  let campaignRn: string = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await client.mutateResource("campaigns", [{
        create: {
          name: campaignName,
          advertising_channel_type: channelType(config.type),
          status: "PAUSED",
          campaign_budget: budgetResourceName,
          ...biddingStrategy(config),
          geo_target_type_setting: {
            positive_geo_target_type: "PRESENCE_OR_INTEREST",
            negative_geo_target_type: "PRESENCE",
          },
          contains_eu_political_advertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          ...extraFields,
        },
      }]);
      campaignRn = result.results[0].resourceName;
      if (attempt > 0) {
        console.log(`[campaign-builder] Created with name "${campaignName}" (original was taken)`);
      }
      break;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("DUPLICATE_CAMPAIGN_NAME") && attempt < 4) {
        campaignName = `${config.name}_v${attempt + 2}`;
        console.log(`[campaign-builder] Name taken, trying "${campaignName}"`);
        continue;
      }
      throw err;
    }
  }
  if (!campaignRn) throw new Error("Failed to create campaign after 5 attempts");

  // Set end date via update if provided (v23 uses endDateTime + end_date_time mask)
  if (config.endDate) {
    try {
      const endDateTime = config.endDate.includes(" ")
        ? config.endDate
        : `${config.endDate} 23:59:59`;
      await client.mutateResource("campaigns", [{
        update: { resourceName: campaignRn, endDateTime },
        updateMask: "end_date_time",
      }]);
    } catch (err) {
      console.warn(`Failed to set end date: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Set tracking URL template (RedTrack)
  if (config.trackingUrlTemplate) {
    try {
      await client.mutateResource("campaigns", [{
        update: {
          resourceName: campaignRn,
          tracking_url_template: config.trackingUrlTemplate,
        },
        updateMask: "tracking_url_template",
      }]);
      console.log(`[campaign-builder] Set tracking template`);
    } catch (err) {
      console.warn(`[campaign-builder] Tracking template failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Add geo targeting
  try {
    if (config.proximityRadius && config.proximityAddress) {
      // Radius targeting around a specific address
      await client.mutateResource("campaignCriteria", [{
        create: {
          campaign: campaignRn,
          proximity: {
            address: {
              street_address: config.proximityAddress,
              postal_code: config.proximityPostalCode ?? "",
              country_code: config.targetCountry ?? "BE",
            },
            radius: config.proximityRadius,
            radius_units: "KILOMETERS",
          },
        },
      }]);
      console.log(`[campaign-builder] Set ${config.proximityRadius}km radius around ${config.proximityAddress}`);
    } else {
      // Country-level targeting (default: Belgium)
      const countryCode = config.targetCountry ?? "BE";
      const geoConstantMap: Record<string, string> = {
        BE: "geoTargetConstants/2056",
        NL: "geoTargetConstants/2528",
        FR: "geoTargetConstants/2250",
        DE: "geoTargetConstants/2276",
      };
      const geoConstant = geoConstantMap[countryCode] ?? geoConstantMap.BE;

      await client.mutateResource("campaignCriteria", [{
        create: {
          campaign: campaignRn,
          location: {
            geo_target_constant: geoConstant,
          },
        },
      }]);
      console.log(`[campaign-builder] Set country targeting: ${countryCode}`);
    }
  } catch (err) {
    console.warn(`[campaign-builder] Geo targeting failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  return campaignRn;
}

async function buildSearchCampaign(client: GoogleAdsClient, config: CampaignConfig): Promise<BuildResult> {
  const budgetRn = await createBudget(client, config.name, config.dailyBudgetMicros);
  const campaignRn = await createBaseCampaign(client, config, budgetRn, {
    network_settings: {
      target_google_search: true,
      target_search_network: false,
      target_content_network: false,
    },
  });

  // Create ad group
  const adGroupResult = await client.mutateResource("adGroups", [{
    create: {
      name: config.adGroupName ?? `${config.name} - Ad Group 1`,
      campaign: campaignRn,
      type: "SEARCH_STANDARD",
      status: "ENABLED",
    },
  }]);
  const adGroupRn = adGroupResult.results[0].resourceName;

  // Add keywords if provided
  if (config.keywords?.length) {
    const keywordOps = config.keywords.map((kw) => ({
      create: {
        ad_group: adGroupRn,
        status: "ENABLED",
        keyword: {
          text: kw.text,
          match_type: kw.matchType,
        },
      },
    }));
    await client.mutateResource("adGroupCriteria", keywordOps);
  }

  // Create responsive search ad if provided (non-fatal — campaign still usable without ad)
  let adWarning: string | undefined;
  if (config.responsiveSearchAd) {
    const rsa = config.responsiveSearchAd;
    try {
      await client.mutateResource("adGroupAds", [{
        create: {
          ad_group: adGroupRn,
          status: "ENABLED",
          ad: {
            responsive_search_ad: {
              headlines: rsa.headlines.map((h) => ({ text: h })),
              descriptions: rsa.descriptions.map((d) => ({ text: d })),
              path1: rsa.path1,
              path2: rsa.path2,
            },
            final_urls: [rsa.finalUrl],
          },
        },
      }]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Extract policy topic if present
      const policyMatch = errMsg.match(/"topic":\s*"([^"]+)"/);
      const policyTopic = policyMatch ? policyMatch[1] : null;
      adWarning = policyTopic === "DESTINATION_NOT_WORKING"
        ? `Ad rejected: landing page ${rsa.finalUrl} is not reachable. Add a working URL in Google Ads.`
        : `Ad creation failed: ${policyTopic ?? errMsg.slice(0, 200)}. Add ads manually in Google Ads.`;
      console.warn(`[campaign-builder] Ad creation failed (non-fatal): ${errMsg}`);
    }
  }

  return { campaignResourceName: campaignRn, adGroupResourceName: adGroupRn, adWarning };
}

async function buildShoppingCampaign(client: GoogleAdsClient, config: CampaignConfig): Promise<BuildResult> {
  const budgetRn = await createBudget(client, config.name, config.dailyBudgetMicros);
  const campaignRn = await createBaseCampaign(client, config, budgetRn, {
    shopping_setting: {
      merchant_id: config.merchantId ? String(config.merchantId) : undefined,
      feed_label: config.feedLabel,
      sales_country: config.locations[0] ?? "BE",
    },
  });

  // Create ad group (Shopping doesn't need keywords)
  const adGroupResult = await client.mutateResource("adGroups", [{
    create: {
      name: config.adGroupName ?? `${config.name} - Products`,
      campaign: campaignRn,
      type: "SHOPPING_PRODUCT_ADS",
      status: "ENABLED",
    },
  }]);

  return {
    campaignResourceName: campaignRn,
    adGroupResourceName: adGroupResult.results[0].resourceName,
  };
}

async function buildPMaxCampaign(client: GoogleAdsClient, config: CampaignConfig): Promise<BuildResult> {
  const budgetRn = await createBudget(client, config.name, config.dailyBudgetMicros);
  const campaignRn = await createBaseCampaign(client, config, budgetRn);

  let assetGroupRn: string | undefined;

  if (config.assetGroup) {
    const ag = config.assetGroup;
    const assetGroupResult = await client.mutateResource("assetGroups", [{
      create: {
        name: ag.name,
        campaign: campaignRn,
        status: "ENABLED",
        final_urls: ag.finalUrls,
      },
    }]);
    assetGroupRn = assetGroupResult.results[0].resourceName;

    // Create text assets for headlines and descriptions
    const textAssetOps = [
      ...ag.headlines.map((h) => ({
        create: { name: `${ag.name} headline`, type: "TEXT", text_asset: { text: h } },
      })),
      ...ag.descriptions.map((d) => ({
        create: { name: `${ag.name} desc`, type: "TEXT", text_asset: { text: d } },
      })),
    ];

    if (textAssetOps.length > 0) {
      await client.mutateResource("assets", textAssetOps);
    }
  }

  return { campaignResourceName: campaignRn, assetGroupResourceName: assetGroupRn };
}

async function buildDisplayCampaign(client: GoogleAdsClient, config: CampaignConfig): Promise<BuildResult> {
  const budgetRn = await createBudget(client, config.name, config.dailyBudgetMicros);
  const campaignRn = await createBaseCampaign(client, config, budgetRn, {
    advertising_channel_sub_type: "DISPLAY_STANDARD",
    network_settings: {
      target_google_search: false,
      target_search_network: false,
      target_content_network: true,
    },
  });

  const adGroupResult = await client.mutateResource("adGroups", [{
    create: {
      name: config.adGroupName ?? `${config.name} - Display Group`,
      campaign: campaignRn,
      type: "DISPLAY_STANDARD",
      status: "ENABLED",
    },
  }]);

  return {
    campaignResourceName: campaignRn,
    adGroupResourceName: adGroupResult.results[0].resourceName,
  };
}

async function buildYouTubeCampaign(client: GoogleAdsClient, config: CampaignConfig): Promise<BuildResult> {
  const format = config.youtubeAdFormat ?? "action";

  // Map format to channel sub-type and ad group type
  const formatConfig: Record<string, { subType: string; adGroupType: string }> = {
    action:   { subType: "VIDEO_ACTION",             adGroupType: "VIDEO_TRUE_VIEW_IN_STREAM" },
    instream: { subType: "VIDEO_NON_SKIPPABLE_IN_STREAM", adGroupType: "VIDEO_TRUE_VIEW_IN_STREAM" },
    bumper:   { subType: "VIDEO_NON_SKIPPABLE_IN_STREAM", adGroupType: "VIDEO_BUMPER" },
    infeed:   { subType: "VIDEO_ACTION",             adGroupType: "VIDEO_TRUE_VIEW_IN_DISPLAY" },
  };
  const { subType, adGroupType } = formatConfig[format] ?? formatConfig.action;

  const budgetRn = await createBudget(client, config.name, config.dailyBudgetMicros);
  const campaignRn = await createBaseCampaign(client, config, budgetRn, {
    advertising_channel_sub_type: subType,
  });

  // If no videoAds provided, fall back to single videoId (backward compat)
  const videoAds: YouTubeVideoAd[] = config.videoAds?.length
    ? config.videoAds
    : config.videoId
      ? [{ videoId: config.videoId, finalUrl: "https://www.shoppingeventvip.be", companionBannerUrl: config.companionBannerUrl }]
      : [];

  // No videos — create just the shell (ad group only)
  if (!videoAds.length) {
    const adGroupResult = await client.mutateResource("adGroups", [{
      create: {
        name: config.adGroupName ?? `${config.name} - Video Group`,
        campaign: campaignRn,
        type: adGroupType,
        status: "ENABLED",
      },
    }]);
    return {
      campaignResourceName: campaignRn,
      adGroupResourceName: adGroupResult.results[0].resourceName,
      adWarning: "No video IDs provided — campaign shell created without ads. Add video ads manually.",
    };
  }

  const adGroupResourceNames: string[] = [];
  const adResourceNames: string[] = [];
  let adWarning: string | undefined;

  for (let i = 0; i < videoAds.length; i++) {
    const va = videoAds[i];
    const groupName = va.adGroupName ?? `${config.name} - Video ${i + 1}`;

    // Create ad group per video
    const adGroupResult = await client.mutateResource("adGroups", [{
      create: {
        name: groupName,
        campaign: campaignRn,
        type: adGroupType,
        status: "ENABLED",
      },
    }]);
    const adGroupRn = adGroupResult.results[0].resourceName;
    adGroupResourceNames.push(adGroupRn);

    // Create the video asset (links YouTube video ID to Google Ads)
    let videoAssetRn: string;
    try {
      const assetResult = await client.mutateResource("assets", [{
        create: {
          name: `${groupName} video`,
          type: "YOUTUBE_VIDEO",
          youtube_video_asset: {
            youtube_video_id: va.videoId,
          },
        },
      }]);
      videoAssetRn = assetResult.results[0].resourceName;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[campaign-builder] Video asset creation failed for ${va.videoId}: ${errMsg}`);
      adWarning = (adWarning ?? "") + `Video ${va.videoId}: asset creation failed — ${errMsg.slice(0, 150)}. `;
      continue;
    }

    // Build the video ad based on format
    try {
      if (format === "action" || format === "infeed") {
        // Video Responsive Ad — supports headlines, descriptions, CTA
        await client.mutateResource("adGroupAds", [{
          create: {
            ad_group: adGroupRn,
            status: "ENABLED",
            ad: {
              video_responsive_ad: {
                headlines: (va.headlines ?? ["Shop Nu"]).map((h) => ({ text: h })),
                long_headlines: (va.longHeadlines ?? va.headlines ?? ["Ontdek exclusieve deals"]).map((h) => ({ text: h })),
                descriptions: (va.descriptions ?? ["Topmerken aan outletprijzen"]).map((d) => ({ text: d })),
                call_to_actions: [{ text: va.callToAction ?? "SHOP_NOW" }],
                videos: [{ asset: videoAssetRn }],
                companion_banners: va.companionBannerUrl
                  ? [{ asset: va.companionBannerUrl }]
                  : [],
              },
              final_urls: [va.finalUrl],
            },
          },
        }]);
      } else if (format === "bumper") {
        // Bumper ad — simple in-stream non-skippable (6s)
        await client.mutateResource("adGroupAds", [{
          create: {
            ad_group: adGroupRn,
            status: "ENABLED",
            ad: {
              video_ad: {
                bumper: { companion_banner: va.companionBannerUrl ? { asset: va.companionBannerUrl } : undefined },
                video: { asset: videoAssetRn },
              },
              final_urls: [va.finalUrl],
            },
          },
        }]);
      } else {
        // In-stream skippable
        await client.mutateResource("adGroupAds", [{
          create: {
            ad_group: adGroupRn,
            status: "ENABLED",
            ad: {
              video_ad: {
                in_stream: { action_button_label: va.callToAction ?? "SHOP_NOW", action_headline: va.headlines?.[0] ?? config.name },
                video: { asset: videoAssetRn },
              },
              final_urls: [va.finalUrl],
            },
          },
        }]);
      }

      adResourceNames.push(`${adGroupRn}/ad`);
      console.log(`[campaign-builder] Created video ad for ${va.videoId} in ${groupName}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[campaign-builder] Video ad creation failed for ${va.videoId}: ${errMsg}`);
      adWarning = (adWarning ?? "") + `Video ${va.videoId}: ad creation failed — ${errMsg.slice(0, 150)}. `;
    }
  }

  return {
    campaignResourceName: campaignRn,
    adGroupResourceName: adGroupResourceNames[0],
    adGroupResourceNames,
    adResourceNames,
    adWarning,
  };
}

/**
 * Demand Gen campaign — replaces VIDEO_ACTION in API v23+.
 * Serves on YouTube (in-stream, in-feed, Shorts), Discover, and Gmail.
 * Requires: video assets, logo image asset, business name.
 */
async function buildDemandGenCampaign(client: GoogleAdsClient, config: CampaignConfig): Promise<BuildResult> {
  const budgetRn = await createBudget(client, config.name, config.dailyBudgetMicros);
  const campaignRn = await createBaseCampaign(client, config, budgetRn, {
    contains_eu_political_advertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
  });

  // Collect video ads (same logic as YouTube builder)
  const videoAds: YouTubeVideoAd[] = config.videoAds?.length
    ? config.videoAds
    : config.videoId
      ? [{ videoId: config.videoId, finalUrl: config.videoAds?.[0]?.finalUrl ?? "https://www.shoppingeventvip.be" }]
      : [];

  if (!videoAds.length) {
    // Create shell ad group only
    const adGroupResult = await client.mutateResource("adGroups", [{
      create: {
        name: config.adGroupName ?? `${config.name} - Demand Gen`,
        campaign: campaignRn,
        status: "ENABLED",
      },
    }]);
    return {
      campaignResourceName: campaignRn,
      adGroupResourceName: adGroupResult.results[0].resourceName,
      adWarning: "No video IDs provided — campaign shell created without ads. Add video ads manually in Google Ads UI.",
    };
  }

  // Create single ad group for all videos (Demand Gen best practice)
  const adGroupResult = await client.mutateResource("adGroups", [{
    create: {
      name: config.adGroupName ?? `${config.name} - All Videos`,
      campaign: campaignRn,
      status: "ENABLED",
    },
  }]);
  const adGroupRn = adGroupResult.results[0].resourceName;

  const adResourceNames: string[] = [];
  let adWarning: string | undefined;
  const businessName = config.businessName ?? "Shopping Event VIP";
  const logoAsset = config.logoImageAsset;

  if (!logoAsset) {
    adWarning = "No logo image asset provided — ads require a logo. Upload one in Google Ads UI or set logoImageAsset in config.";
    return {
      campaignResourceName: campaignRn,
      adGroupResourceName: adGroupRn,
      adWarning,
    };
  }

  for (let i = 0; i < videoAds.length; i++) {
    const va = videoAds[i];

    // Create video asset
    let videoAssetRn: string;
    try {
      const assetResult = await client.mutateResource("assets", [{
        create: {
          name: `${va.adGroupName ?? config.name} video ${i + 1}`,
          type: "YOUTUBE_VIDEO",
          youtube_video_asset: { youtube_video_id: va.videoId },
        },
      }]);
      videoAssetRn = assetResult.results[0].resourceName;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[campaign-builder] Video asset failed for ${va.videoId}: ${errMsg}`);
      adWarning = (adWarning ?? "") + `Video ${va.videoId}: asset failed — ${errMsg.slice(0, 150)}. `;
      continue;
    }

    // Create Demand Gen video responsive ad
    try {
      await client.mutateResource("adGroupAds", [{
        create: {
          ad_group: adGroupRn,
          status: "ENABLED",
          ad: {
            demand_gen_video_responsive_ad: {
              headlines: (va.headlines ?? ["Shop Nu"]).map((h) => ({ text: h })),
              long_headlines: (va.longHeadlines ?? va.headlines ?? ["Ontdek exclusieve deals"]).map((h) => ({ text: h })),
              descriptions: (va.descriptions ?? ["Topmerken aan outletprijzen"]).map((d) => ({ text: d })),
              videos: [{ asset: videoAssetRn }],
              logo_images: [{ asset: logoAsset }],
              business_name: { text: businessName },
            },
            final_urls: [va.finalUrl],
            name: va.adGroupName ?? `${config.name} - Video ${i + 1}`,
          },
        },
      }]);
      adResourceNames.push(`${adGroupRn}/ad-${i}`);
      console.log(`[campaign-builder] Created Demand Gen ad for ${va.videoId}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Extract policy topic if present
      const policyMatch = errMsg.match(/"topic":\s*"([^"]+)"/);
      const policyTopic = policyMatch ? policyMatch[1] : null;
      const detail = policyTopic === "DESTINATION_NOT_WORKING"
        ? `landing page not reachable (try adding ?ref=yt parameter)`
        : errMsg.slice(0, 150);
      console.warn(`[campaign-builder] Demand Gen ad failed for ${va.videoId}: ${detail}`);
      adWarning = (adWarning ?? "") + `Video ${va.videoId}: ad failed — ${detail}. `;
    }
  }

  return {
    campaignResourceName: campaignRn,
    adGroupResourceName: adGroupRn,
    adResourceNames,
    adWarning,
  };
}
