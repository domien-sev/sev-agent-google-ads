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
  // Demand Gen and PMax require smart bidding — manual CPC not supported
  if (config.type === "demand_gen" || config.type === "pmax") {
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

    // Validate and truncate headlines (max 30 chars) and descriptions (max 90 chars)
    const validHeadlines = rsa.headlines
      .map((h) => h.length > 30 ? h.substring(0, 30) : h)
      .filter((h) => h.length >= 1)
      .slice(0, 15);
    const validDescriptions = rsa.descriptions
      .map((d) => d.length > 90 ? d.substring(0, 90) : d)
      .filter((d) => d.length >= 1)
      .slice(0, 4);

    if (validHeadlines.length < 3 || validDescriptions.length < 2) {
      adWarning = `Ad skipped: need ≥3 headlines and ≥2 descriptions, got ${validHeadlines.length}h/${validDescriptions.length}d.`;
      console.warn(`[campaign-builder] ${adWarning}`);
    } else {
      // Deduplicate headlines and descriptions (Google rejects duplicates)
      const uniqueHeadlines = [...new Set(validHeadlines)];
      const uniqueDescriptions = [...new Set(validDescriptions)];

      try {
        await client.mutateResource("adGroupAds", [{
          create: {
            ad_group: adGroupRn,
            status: "ENABLED",
            ad: {
              responsive_search_ad: {
                headlines: uniqueHeadlines.map((h) => ({ text: h })),
                descriptions: uniqueDescriptions.map((d) => ({ text: d })),
                path1: rsa.path1?.substring(0, 15),
                path2: rsa.path2?.substring(0, 15),
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
  }

  return { campaignResourceName: campaignRn, adGroupResourceName: adGroupRn, adWarning };
}

async function buildShoppingCampaign(client: GoogleAdsClient, config: CampaignConfig): Promise<BuildResult> {
  const budgetRn = await createBudget(client, config.name, config.dailyBudgetMicros);
  const campaignRn = await createBaseCampaign(client, config, budgetRn, {
    shopping_setting: {
      merchant_id: config.merchantId ? Number(config.merchantId) : undefined,
      feed_label: config.feedLabel ?? "BE",
      campaign_priority: 0,
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
  const adGroupRn = adGroupResult.results[0].resourceName;

  // Apply inventory filter via listing group tree if specified
  if (config.inventoryFilter) {
    await createListingGroupFilter(client, adGroupRn, config.inventoryFilter);
  }

  return {
    campaignResourceName: campaignRn,
    adGroupResourceName: adGroupRn,
  };
}

/**
 * Create a listing group tree that filters to specific product values.
 * Builds: Root (SUBDIVISION) → included UNIT(s) per value + excluded "everything else" UNIT.
 */
async function createListingGroupFilter(
  client: GoogleAdsClient,
  adGroupRn: string,
  filter: NonNullable<CampaignConfig["inventoryFilter"]>,
): Promise<void> {
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!;
  // Extract ad group ID from resource name (format: customers/{cid}/adGroups/{agid})
  const adGroupId = adGroupRn.split("/").pop()!;
  const criterionBase = `customers/${customerId}/adGroupCriteria/${adGroupId}~`;

  // First, remove the default "all products" listing group created automatically
  // Query existing listing groups for this ad group
  const existingQuery = `
    SELECT ad_group_criterion.criterion_id, ad_group_criterion.listing_group.type
    FROM ad_group_criterion
    WHERE ad_group.resource_name = '${adGroupRn}'
      AND ad_group_criterion.type = 'LISTING_GROUP'
  `;
  const existing = await client.query(existingQuery) as Array<{ results?: Array<Record<string, Record<string, string | number>>> }>;
  const removeOps: MutateOperation[] = [];
  for (const batch of existing) {
    for (const row of batch.results ?? []) {
      const critId = row.adGroupCriterion?.criterionId;
      if (critId) {
        removeOps.push({ remove: `${criterionBase}${critId}` } as unknown as MutateOperation);
      }
    }
  }
  if (removeOps.length > 0) {
    await client.mutateResource("adGroupCriteria", removeOps as unknown as Array<Record<string, unknown>>);
  }

  // Build the dimension case_value based on filter type
  const dimensionKey = filterDimensionKey(filter.dimension);

  // Temp IDs: -1 = root subdivision, -2..-N = value units, last = everything else
  const ops: Array<Record<string, unknown>> = [];

  // Root subdivision (no case_value, no parent)
  ops.push({
    create: {
      ad_group: adGroupRn,
      listing_group: { type: "SUBDIVISION" },
      status: "ENABLED",
      resource_name: `${criterionBase}-1`,
    },
  });

  // One included UNIT per filter value
  for (let i = 0; i < filter.values.length; i++) {
    ops.push({
      create: {
        ad_group: adGroupRn,
        listing_group: {
          type: "UNIT",
          parent_ad_group_criterion: `${criterionBase}-1`,
          case_value: { [dimensionKey]: { value: filter.values[i] } },
        },
        status: "ENABLED",
        cpc_bid_micros: "500000", // €0.50 default bid
        resource_name: `${criterionBase}-${i + 2}`,
      },
    });
  }

  // "Everything else" excluded UNIT (case_value with empty dimension = other)
  ops.push({
    create: {
      ad_group: adGroupRn,
      listing_group: {
        type: "UNIT",
        parent_ad_group_criterion: `${criterionBase}-1`,
        case_value: { [dimensionKey]: {} },
      },
      status: "ENABLED",
      cpc_bid_micros: "10000", // €0.01 — minimal bid for "other" partition
      resource_name: `${criterionBase}-${filter.values.length + 2}`,
    },
  });

  await client.mutateResource("adGroupCriteria", ops as Array<Record<string, unknown>>);
}

/** Map our filter dimension names to Google Ads API ListingDimensionInfo field names */
function filterDimensionKey(dimension: string): string {
  const map: Record<string, string> = {
    brand: "product_brand",
    product_type: "product_type",
    custom_label_0: "product_custom_attribute",
    custom_label_1: "product_custom_attribute",
    custom_label_2: "product_custom_attribute",
    custom_label_3: "product_custom_attribute",
    custom_label_4: "product_custom_attribute",
  };
  return map[dimension] ?? "product_brand";
}

async function buildPMaxCampaign(client: GoogleAdsClient, config: CampaignConfig): Promise<BuildResult> {
  const budgetRn = await createBudget(client, config.name, config.dailyBudgetMicros);
  const businessName = config.businessName ?? "Shopping Event VIP";
  const logoAsset = config.logoImageAsset ?? "customers/6267337247/assets/73011795371";
  let adWarning: string | undefined;

  // PMax with Brand Guidelines requires campaign + business name asset + logo
  // all linked atomically. Use googleAds:mutate batch with temporary resource names.
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!;
  const tempCampaignRn = `customers/${customerId}/campaigns/-1`;
  const tempBnAssetRn = `customers/${customerId}/assets/-2`;

  const batchResult = await client.post("googleAds:mutate", {
    mutateOperations: [
      // Op 0: Create business name text asset (temp ID -2)
      {
        assetOperation: {
          create: {
            resourceName: tempBnAssetRn,
            name: `${config.name} business name`,
            type: "TEXT",
            textAsset: { text: businessName },
          },
        },
      },
      // Op 1: Create campaign (temp ID -1)
      {
        campaignOperation: {
          create: {
            resourceName: tempCampaignRn,
            name: config.name,
            advertisingChannelType: channelType(config.type),
            status: "PAUSED",
            campaignBudget: budgetRn,
            ...biddingStrategy(config),
            geoTargetTypeSetting: {
              positiveGeoTargetType: "PRESENCE_OR_INTEREST",
              negativeGeoTargetType: "PRESENCE",
            },
            containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          },
        },
      },
      // Op 2: Link business name to campaign
      {
        campaignAssetOperation: {
          create: {
            campaign: tempCampaignRn,
            asset: tempBnAssetRn,
            fieldType: "BUSINESS_NAME",
          },
        },
      },
      // Op 3: Link logo to campaign
      {
        campaignAssetOperation: {
          create: {
            campaign: tempCampaignRn,
            asset: logoAsset,
            fieldType: "LOGO",
          },
        },
      },
    ],
  }) as { mutateOperationResponses: Array<{ campaignResult?: { resourceName: string }; assetResult?: { resourceName: string } }> };

  // Extract real campaign resource name from batch result
  const campaignResponse = batchResult.mutateOperationResponses?.find(
    (r: any) => r.campaignResult?.resourceName
  );
  const campaignRn = (campaignResponse as any)?.campaignResult?.resourceName;
  if (!campaignRn) throw new Error("PMax campaign creation failed — no campaign resource name in batch response");

  // Set end date
  if (config.endDate) {
    try {
      const endDateTime = config.endDate.includes(" ") ? config.endDate : `${config.endDate} 23:59:59`;
      await client.mutateResource("campaigns", [{
        update: { resourceName: campaignRn, endDateTime },
        updateMask: "end_date_time",
      }]);
    } catch { /* non-fatal */ }
  }

  // Set tracking URL template
  if (config.trackingUrlTemplate) {
    try {
      await client.mutateResource("campaigns", [{
        update: { resourceName: campaignRn, trackingUrlTemplate: config.trackingUrlTemplate },
        updateMask: "tracking_url_template",
      }]);
      console.log("[campaign-builder] Set tracking template");
    } catch { /* non-fatal */ }
  }

  // Set geo targeting (country-level)
  try {
    const countryCode = config.targetCountry ?? "BE";
    const geoConstantMap: Record<string, string> = {
      BE: "geoTargetConstants/2056", NL: "geoTargetConstants/2528",
      FR: "geoTargetConstants/2250", DE: "geoTargetConstants/2276",
    };
    await client.mutateResource("campaignCriteria", [{
      create: {
        campaign: campaignRn,
        location: { geo_target_constant: geoConstantMap[countryCode] ?? geoConstantMap.BE },
      },
    }]);
    console.log(`[campaign-builder] Set country targeting: ${countryCode}`);
  } catch { /* non-fatal */ }

  // Create asset group
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

  return { campaignResourceName: campaignRn, assetGroupResourceName: assetGroupRn, adWarning };
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

// ---------------------------------------------------------------------------
// Demand Gen — image-only helpers (Belvoir + future content campaigns)
// ---------------------------------------------------------------------------

export interface DemandGenImageAdGroupParams {
  /** Resource name of the parent campaign (must be DEMAND_GEN type) */
  campaignResourceName: string;
  /** Ad group display name (e.g. the article slug) */
  adGroupName: string;
  /** Business name shown beneath the ad */
  businessName: string;
  /** Existing logo image asset resource name (required by Demand Gen) */
  logoImageAsset: string;
  /** 3–5 short headlines (≤30 chars each) */
  headlines: string[];
  /** 1–5 long headlines (≤90 chars each) */
  longHeadlines: string[];
  /** 1–5 descriptions (≤90 chars each) */
  descriptions: string[];
  /** Image URLs to upload as marketing assets (1.91:1 landscape preferred). At least 1 required. */
  marketingImages: string[];
  /** Optional 1:1 square images (Discover feed) */
  squareMarketingImages?: string[];
  /** Click-through URL — typically the article URL */
  finalUrl: string;
  /** Call-to-action label, defaults to "SHOP_NOW" */
  callToAction?: string;
}

export interface DemandGenImageAdGroupResult {
  adGroupResourceName: string;
  adResourceName?: string;
  warning?: string;
}

/**
 * Add a `demand_gen_multi_asset_ad` to an existing ad group. Uploads images
 * (fetched + base64-encoded) and creates the ad. Useful for repairing
 * partially-built campaigns where the ad group exists but the ad failed.
 */
export async function addDemandGenImageAdToAdGroup(
  client: GoogleAdsClient,
  adGroupResourceName: string,
  params: Omit<DemandGenImageAdGroupParams, "campaignResourceName" | "adGroupName"> & { adGroupName: string },
): Promise<DemandGenImageAdGroupResult> {
  return uploadAndCreateImageAd(client, adGroupResourceName, params.adGroupName, params);
}

/**
 * Create one image-only Demand Gen ad group inside an existing Demand Gen
 * campaign. Uploads images as Google Ads assets, then creates a
 * `demand_gen_multi_asset_ad` that rotates them across Discover/Gmail/in-feed.
 *
 * Use this when you want one ad group per piece of content (e.g. one Belvoir
 * article = one ad group, sharing a single category-level campaign budget).
 */
export async function createDemandGenImageAdGroup(
  client: GoogleAdsClient,
  params: DemandGenImageAdGroupParams,
): Promise<DemandGenImageAdGroupResult> {
  // 1. Create the ad group
  const adGroupResult = await client.mutateResource("adGroups", [{
    create: {
      name: params.adGroupName,
      campaign: params.campaignResourceName,
      status: "ENABLED",
    },
  }]);
  const adGroupRn = adGroupResult.results[0].resourceName as string;
  return uploadAndCreateImageAd(client, adGroupRn, params.adGroupName, params);
}

async function uploadAndCreateImageAd(
  client: GoogleAdsClient,
  adGroupRn: string,
  adGroupLabel: string,
  params: Omit<DemandGenImageAdGroupParams, "campaignResourceName" | "adGroupName">,
): Promise<DemandGenImageAdGroupResult> {

  // 2. Upload marketing images as IMAGE assets. Google Ads requires raw bytes
  // (base64) — the URL field is read-only — and only accepts JPG/PNG/GIF
  // (NOT webp). For belvoir.be CDN we coerce ?format=jpg.
  // Coerce a Belvoir CDN image URL to a Google-Ads-compatible JPG at the
  // requested target ratio. Belvoir's CDN supports server-side crop via
  // ?width=&height=&fit=cover, which lets us guarantee 1.91:1 (landscape)
  // or 1:1 (square) regardless of the source image's aspect ratio.
  const coerceCdn = (rawUrl: string, target: "landscape" | "square"): string => {
    // Decode any leftover HTML entities (og:image meta values often contain &amp;).
    const decoded = rawUrl
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
    try {
      const u = new URL(decoded);
      if (u.hostname.endsWith("belvoir.be")) {
        // Wipe any existing size params so we control the output dimensions.
        for (const k of ["height", "width", "h", "w"]) u.searchParams.delete(k);
        if (target === "landscape") {
          u.searchParams.set("width", "1200");
          u.searchParams.set("height", "628");
        } else {
          u.searchParams.set("width", "1080");
          u.searchParams.set("height", "1080");
        }
        u.searchParams.set("fit", "cover");
        u.searchParams.set("format", "jpg");
        return u.toString();
      }
    } catch { /* fall through */ }
    return decoded;
  };

  const uploadImage = async (rawUrl: string, label: string, target: "landscape" | "square"): Promise<string | null> => {
    const url = coerceCdn(rawUrl, target);
    let base64Data: string;
    try {
      const fetchRes = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (sev-ai-google-ads-agent)",
          "Accept": "image/jpeg,image/png,image/gif,image/*;q=0.8,*/*;q=0.5",
        },
        redirect: "follow",
      });
      if (!fetchRes.ok) {
        console.warn(`[campaign-builder] image fetch ${fetchRes.status} for ${url}`);
        return null;
      }
      const ct = fetchRes.headers.get("content-type") ?? "";
      if (!/^image\/(jpeg|png|gif)/i.test(ct)) {
        console.warn(`[campaign-builder] unsupported image type ${ct} for ${url} (need jpg/png/gif)`);
        return null;
      }
      const buf = Buffer.from(await fetchRes.arrayBuffer());
      // Google Ads minimum is 600x314 — anything tiny will be rejected. Use byte size as a rough proxy.
      if (buf.byteLength < 6_000) {
        console.warn(`[campaign-builder] image too small (${buf.byteLength}b) for ${url}`);
        return null;
      }
      base64Data = buf.toString("base64");
    } catch (err) {
      console.warn(`[campaign-builder] image fetch failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }

    try {
      const r = await client.mutateResource("assets", [{
        create: {
          name: `${adGroupLabel} ${label}`,
          type: "IMAGE",
          image_asset: { data: base64Data },
        },
      }]);
      return r.results[0].resourceName as string;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[campaign-builder] image asset upload failed for ${url}: ${msg.slice(0, 200)}`);
      return null;
    }
  };

  // Upload each input image twice — once cropped to 1.91:1 landscape,
  // once cropped to 1:1 square. Belvoir CDN does the cropping server-side
  // (?fit=cover) so the resulting assets always match Google's aspect
  // requirements regardless of source dimensions.
  const landscapeAssets: string[] = [];
  for (let i = 0; i < params.marketingImages.length && landscapeAssets.length < 5; i++) {
    const rn = await uploadImage(params.marketingImages[i], `landscape ${i + 1}`, "landscape");
    if (rn) landscapeAssets.push(rn);
  }

  const squareInputs = params.squareMarketingImages?.length
    ? params.squareMarketingImages
    : params.marketingImages;
  const squareAssets: string[] = [];
  for (let i = 0; i < squareInputs.length && squareAssets.length < 5; i++) {
    const rn = await uploadImage(squareInputs[i], `square ${i + 1}`, "square");
    if (rn) squareAssets.push(rn);
  }

  if (landscapeAssets.length === 0 && squareAssets.length === 0) {
    return {
      adGroupResourceName: adGroupRn,
      warning: "All image uploads failed — ad not created. Check image URLs are publicly fetchable + min 600x314 landscape or 300x300 square.",
    };
  }

  // 3. Create the demand_gen_multi_asset_ad (Discover-style image ad).
  // Only include landscape OR square fields if we have valid assets — Google
  // rejects the entire ad if any single image in a field fails aspect ratio.
  const adPayload: Record<string, unknown> = {
    logo_images: [{ asset: params.logoImageAsset }],
    headlines: params.headlines.map((text) => ({ text })),
    descriptions: params.descriptions.map((text) => ({ text })),
    business_name: params.businessName,
  };
  if (landscapeAssets.length > 0) {
    adPayload.marketing_images = landscapeAssets.map((asset) => ({ asset }));
  }
  if (squareAssets.length > 0) {
    adPayload.square_marketing_images = squareAssets.map((asset) => ({ asset }));
  }

  try {
    // call_to_action_text intentionally omitted — Google rejects enum-style
    // values like "LearnMore" / "LEARN_MORE" for this account. Default CTA
    // is auto-selected by Google.
    await client.mutateResource("adGroupAds", [{
      create: {
        ad_group: adGroupRn,
        status: "ENABLED",
        ad: {
          demand_gen_multi_asset_ad: adPayload as never,
          final_urls: [params.finalUrl],
          name: `${adGroupLabel} - DG Image`,
        },
      },
    }]);
    return { adGroupResourceName: adGroupRn, adResourceName: `${adGroupRn}/ad` };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const policy = errMsg.match(/"topic":\s*"([^"]+)"/)?.[1];
    const detail = policy === "DESTINATION_NOT_WORKING"
      ? "landing page not reachable (try appending ?ref=gads)"
      : errMsg.slice(0, 800);
    console.error(`[campaign-builder] FULL multi_asset_ad error: ${errMsg}`);
    return {
      adGroupResourceName: adGroupRn,
      warning: `multi_asset_ad creation failed — ${detail}`,
    };
  }
}
