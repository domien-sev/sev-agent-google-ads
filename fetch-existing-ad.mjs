import { GoogleAdsClient } from "@domien-sev/ads-sdk";
import "dotenv/config";

const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
  loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
});

const campaignId = "23713849405";

// 1. Campaign info
const campaign = await client.query(`
  SELECT campaign.id, campaign.name, campaign.advertising_channel_type,
         campaign.tracking_url_template, campaign.status
  FROM campaign
  WHERE campaign.id = ${campaignId}
`);
console.log("CAMPAIGN:", JSON.stringify(campaign, null, 2));

// 2. Ad groups
const adGroups = await client.query(`
  SELECT ad_group.id, ad_group.name, ad_group.status
  FROM ad_group
  WHERE campaign.id = ${campaignId}
`);
console.log("\nAD GROUPS:", JSON.stringify(adGroups, null, 2));

// 3. Ads
const ads = await client.query(`
  SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
         ad_group_ad.ad.demand_gen_video_responsive_ad.headlines,
         ad_group_ad.ad.demand_gen_video_responsive_ad.long_headlines,
         ad_group_ad.ad.demand_gen_video_responsive_ad.descriptions,
         ad_group_ad.ad.demand_gen_video_responsive_ad.business_name,
         ad_group_ad.ad.demand_gen_video_responsive_ad.call_to_actions,
         ad_group_ad.ad.demand_gen_video_responsive_ad.logo_images,
         ad_group_ad.ad.demand_gen_video_responsive_ad.videos,
         ad_group_ad.ad.final_urls,
         ad_group.id, ad_group.name
  FROM ad_group_ad
  WHERE campaign.id = ${campaignId}
`);
console.log("\nADS:", JSON.stringify(ads, null, 2));
