import { GoogleAdsClient, YouTubeClient } from "@domien-sev/ads-sdk";
import { RedTrackClient } from "@domien-sev/redtrack-sdk";
import "dotenv/config";

const GOOGLE_ADS_TRACKING_PARAMS =
  "utm_campaign={replace}&sub2={keyword}&sub3={matchtype}&sub4={adgroupid}" +
  "&sub5={creative}&sub6={campaignid}&sub7={device}&sub8={adposition}" +
  "&sub9={network}&sub10={placement}&utm_source=Google&wbraid={wbraid}" +
  "&gbraid={gbraid}&ref_id={gclid}";

async function createRedTrackCampaign({ brand, eventType, landingPageUrl }) {
  const rt = new RedTrackClient({
    apiKey: process.env.REDTRACK_API_KEY,
    apiUrl: process.env.REDTRACK_API_URL ?? "https://api.redtrack.io",
  });
  const result = await rt.createEventCampaign({
    brand, eventType, channel: "google-ads", landingPageUrl,
  });
  return {
    trackingUrl: result.trackingUrl,
    campaignId: result.campaignId,
    trackingTemplate: `{lpurl}?cmpid=${result.campaignId}&${GOOGLE_ADS_TRACKING_PARAMS}`,
  };
}

const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
  loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
});

const yt = new YouTubeClient({
  serviceAccountKeyPath: "C:/Users/domie/Downloads/sev-ai-ops-f96b4c39c6fa.json",
  impersonateEmail: "domien@shoppingeventvip.be",
});

const CUST = process.env.GOOGLE_ADS_CUSTOMER_ID;
const LOGO = `customers/${CUST}/assets/73011795371`;
const LABEL = `customers/${CUST}/labels/22157248252`;
const FINAL_URL = "https://www.shoppingeventvip.be/fr/event/le-salon-vip?ref=yt";
const LANGUAGE_FR = "languageConstants/1002";
const LOCATIONS = ["20053", "20054", "20056", "1001242", "1001244"];

const HEADLINES = ["Acheter", "Jusqu'à -70%", "Exclusif VIP"];
const LONG_HEADLINES = ["Prix outlet exclusifs au Salon VIP"];
const DESCRIPTIONS = [
  "Grandes marques à prix outlet. 17-26 avril, Saint-Nicolas.",
  "Réservez et profitez de remises jusqu'à -70%.",
];

// === 1. Upload video ===
console.log("=== 1. Upload amina-fr to YouTube ===");
const upload = await yt.uploadVideo({
  filePath: "C:/Dev/sev-ai-collaborative-setup/.tmp/youtube-fr/amina-fr.mov",
  title: "Le Salon VIP — Amina #Shorts",
  description: "Le Salon VIP — grandes marques à prix outlet. #Shorts",
  privacyStatus: "unlisted",
  tags: ["LeSalonVIP", "Shorts", "Outlet", "Mode"],
  defaultLanguage: "fr",
});
console.log(`  ${upload.videoId} ${upload.url}`);

// === 2. RedTrack ===
console.log("\n=== 2. RedTrack campaign ===");
const rt = await createRedTrackCampaign({
  brand: "Le Salon VIP",
  eventType: "physical",
  landingPageUrl: FINAL_URL,
});
if (!rt) throw new Error("RedTrack failed");
console.log(`  campaign ${rt.campaignId}`);
console.log(`  template ${rt.trackingTemplate}`);

// === 3. Budget ===
console.log("\n=== 3. Budget ===");
const budgetSuffix = Date.now().toString(36);
const budget = await client.mutateResource("campaignBudgets", [{
  create: {
    name: `Le Salon VIP - YouTube Demand Gen - FR Budget ${budgetSuffix}`,
    amount_micros: "30000000",
    delivery_method: "STANDARD",
    explicitly_shared: false,
  },
}]);
const budgetRn = budget.results[0].resourceName;
console.log(`  ${budgetRn}`);

// === 4. Campaign ===
console.log("\n=== 4. Campaign ===");
const camp = await client.mutateResource("campaigns", [{
  create: {
    name: "Le Salon VIP - YouTube Demand Gen - FR",
    advertising_channel_type: "DEMAND_GEN",
    status: "PAUSED",
    campaign_budget: budgetRn,
    maximize_conversions: {},
    tracking_url_template: rt.trackingTemplate,
    geo_target_type_setting: {
      positive_geo_target_type: "PRESENCE_OR_INTEREST",
      negative_geo_target_type: "PRESENCE",
    },
    contains_eu_political_advertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
  },
}]);
const campRn = camp.results[0].resourceName;
const campId = campRn.split("/").pop();
console.log(`  ${campRn}`);

// === 5. Apply Claude Code label ===
console.log("\n=== 5. Label ===");
await client.mutateResource("campaignLabels", [{
  create: { campaign: campRn, label: LABEL },
}]);
console.log("  applied");

// === 6. Ad group ===
console.log("\n=== 6. Ad group ===");
const ag = await client.mutateResource("adGroups", [{
  create: {
    name: "Le Salon VIP - Amina",
    campaign: campRn,
    status: "ENABLED",
  },
}]);
const agRn = ag.results[0].resourceName;
console.log(`  ${agRn}`);

// === 7. Ad group criteria: LOCATION + LANGUAGE ===
console.log("\n=== 7. Targeting (5 LOCATION + 1 LANGUAGE at ad group) ===");
const critOps = [
  ...LOCATIONS.map((id) => ({
    create: {
      ad_group: agRn,
      status: "ENABLED",
      negative: false,
      location: { geo_target_constant: `geoTargetConstants/${id}` },
    },
  })),
  {
    create: {
      ad_group: agRn,
      status: "ENABLED",
      negative: false,
      language: { language_constant: LANGUAGE_FR },
    },
  },
];
try {
  const res = await client.mutateResource("adGroupCriteria", critOps);
  console.log(`  created ${res.results.length}`);
} catch (err) {
  console.warn(`  targeting failed: ${err.message.slice(0, 300)}`);
  console.log("  (falling back: LOCATION only — language may need UI)");
  const locOnly = LOCATIONS.map((id) => ({
    create: {
      ad_group: agRn,
      status: "ENABLED",
      negative: false,
      location: { geo_target_constant: `geoTargetConstants/${id}` },
    },
  }));
  const res = await client.mutateResource("adGroupCriteria", locOnly);
  console.log(`  created ${res.results.length} LOCATION only`);
}

// === 8. Register video asset ===
console.log("\n=== 8. Register YouTube video asset ===");
const asset = await client.mutateResource("assets", [{
  create: {
    name: "Le Salon VIP - Amina FR Short",
    type: "YOUTUBE_VIDEO",
    youtube_video_asset: { youtube_video_id: upload.videoId },
  },
}]);
const videoAssetRn = asset.results[0].resourceName;
console.log(`  ${videoAssetRn}`);

// === 9. Create ad ===
console.log("\n=== 9. Demand Gen ad ===");
const ad = await client.mutateResource("adGroupAds", [{
  create: {
    ad_group: agRn,
    status: "ENABLED",
    ad: {
      name: "Le Salon VIP - Amina FR",
      final_urls: [FINAL_URL],
      demand_gen_video_responsive_ad: {
        headlines: HEADLINES.map((t) => ({ text: t })),
        long_headlines: LONG_HEADLINES.map((t) => ({ text: t })),
        descriptions: DESCRIPTIONS.map((t) => ({ text: t })),
        videos: [{ asset: videoAssetRn }],
        logo_images: [{ asset: LOGO }],
        business_name: { text: "Shopping Event VIP" },
      },
    },
  },
}]);
console.log(`  ${ad.results[0].resourceName}`);

// === 10. Enable campaign ===
console.log("\n=== 10. Enable campaign ===");
await client.mutateResource("campaigns", [{
  update: { resource_name: campRn, status: "ENABLED" },
  update_mask: "status",
}]);
console.log("  ENABLED");

console.log("\n=== DONE ===");
console.log(JSON.stringify({
  campaignId: campId,
  campaignUrl: `https://ads.google.com/aw/adgroups?campaignId=${campId}`,
  videoId: upload.videoId,
  videoUrl: upload.url,
  redtrackCampaignId: rt.campaignId,
}, null, 2));
