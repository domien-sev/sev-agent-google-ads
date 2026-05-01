import { GoogleAdsClient } from "@domien-sev/ads-sdk";
import "dotenv/config";

const c = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
  loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
});

const CAMP = "23713849405";

async function q(gaql, label) {
  console.log(`\n=== ${label} ===`);
  const r = await c.query(gaql);
  console.log(JSON.stringify(r[0].results || [], null, 2));
}

// 1. Campaign-level performance (last 30d + all time)
await q(`SELECT campaign.id, campaign.name, campaign.bidding_strategy_type,
         campaign.maximize_conversions.target_cpa_micros,
         metrics.cost_micros, metrics.conversions, metrics.conversions_value,
         metrics.clicks, metrics.impressions, metrics.ctr,
         metrics.average_cpc, metrics.cost_per_conversion,
         metrics.average_cpm
  FROM campaign WHERE campaign.id = ${CAMP} AND segments.date DURING LAST_30_DAYS`,
  "Campaign 30d");

await q(`SELECT campaign.id,
         metrics.cost_micros, metrics.conversions, metrics.clicks,
         metrics.impressions, metrics.cost_per_conversion
  FROM campaign WHERE campaign.id = ${CAMP} AND segments.date DURING LAST_7_DAYS`,
  "Campaign 7d");

// 2. Ad group performance 30d
await q(`SELECT ad_group.id, ad_group.name, ad_group.status,
         metrics.cost_micros, metrics.conversions, metrics.clicks,
         metrics.impressions, metrics.cost_per_conversion, metrics.ctr
  FROM ad_group WHERE campaign.id = ${CAMP} AND segments.date DURING LAST_30_DAYS
  ORDER BY metrics.cost_micros DESC`,
  "Ad groups 30d");

// 3. Ad-level performance 30d (which creatives work)
await q(`SELECT ad_group.name, ad_group_ad.ad.name, ad_group_ad.status,
         metrics.cost_micros, metrics.conversions, metrics.clicks,
         metrics.impressions, metrics.cost_per_conversion, metrics.ctr
  FROM ad_group_ad WHERE campaign.id = ${CAMP} AND segments.date DURING LAST_30_DAYS
  ORDER BY metrics.cost_micros DESC`,
  "Ads 30d");

// 4. Device performance
await q(`SELECT segments.device,
         metrics.cost_micros, metrics.conversions, metrics.clicks,
         metrics.cost_per_conversion, metrics.ctr
  FROM campaign WHERE campaign.id = ${CAMP} AND segments.date DURING LAST_30_DAYS`,
  "By device 30d");

// 5. By day
await q(`SELECT segments.date,
         metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions
  FROM campaign WHERE campaign.id = ${CAMP} AND segments.date DURING LAST_14_DAYS
  ORDER BY segments.date DESC`,
  "By day 14d");

// 6. Geo breakdown — where spend goes vs conversions
await q(`SELECT segments.geo_target_region, segments.geo_target_city,
         metrics.cost_micros, metrics.conversions, metrics.clicks
  FROM geographic_view WHERE campaign.id = ${CAMP} AND segments.date DURING LAST_30_DAYS
  ORDER BY metrics.cost_micros DESC LIMIT 15`,
  "Top locations 30d");

// 7. Age/gender
await q(`SELECT ad_group_criterion.age_range.type,
         metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion
  FROM age_range_view WHERE campaign.id = ${CAMP} AND segments.date DURING LAST_30_DAYS
  ORDER BY metrics.cost_micros DESC`, "Age 30d");

await q(`SELECT ad_group_criterion.gender.type,
         metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion
  FROM gender_view WHERE campaign.id = ${CAMP} AND segments.date DURING LAST_30_DAYS`,
  "Gender 30d");
