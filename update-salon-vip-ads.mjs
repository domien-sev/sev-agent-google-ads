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

const CUST = process.env.GOOGLE_ADS_CUSTOMER_ID;
const CAMPAIGN_RN = `customers/${CUST}/campaigns/23713849405`;
const EXISTING_AG_RN = `customers/${CUST}/adGroups/190145648370`;
const LOGO_ASSET = `customers/${CUST}/assets/73011795371`;
const FINAL_URL = "https://www.shoppingeventvip.be/nl/event/le-salon-vip?ref=yt";
const BUSINESS_NAME = "Shopping Event VIP";

const HEADLINES = ["Shop Nu", "Tot -70%", "Exclusief VIP"];
const LONG_HEADLINES = ["Exclusieve outletprijzen bij Le Salon VIP"];
const DESCRIPTIONS = [
  "Topmerken aan outletprijzen. 17-26 april, Sint-Niklaas.",
  "Reserveer nu en shop met korting tot 70%.",
];

const OLD_ADS = [
  { id: "803034670951", name: "Hero NL",          videoAsset: `customers/${CUST}/assets/344985903287` },
  { id: "803034670981", name: "Vriendinnen",      videoAsset: `customers/${CUST}/assets/345127359045` },
  { id: "803034681310", name: "Vriendinnen Short",videoAsset: `customers/${CUST}/assets/344986290281` },
  { id: "803107905578", name: "Hero Short",       videoAsset: `customers/${CUST}/assets/345127361496` },
];

const NEW_CREATORS = [
  { name: "Jana",  videoId: "YsmGwS4MwTs" },
  { name: "Laure", videoId: "KyhB2gGCeRc" },
  { name: "Manon", videoId: "bZtSXU6BcBU" },
];

async function registerVideoAsset(videoId, name) {
  const r = await client.mutateResource("assets", [{
    create: {
      name: `Le Salon VIP - ${name} Short`,
      type: "YOUTUBE_VIDEO",
      youtube_video_asset: { youtube_video_id: videoId },
    },
  }]);
  return r.results[0].resourceName;
}

async function createAdGroup(name) {
  const r = await client.mutateResource("adGroups", [{
    create: { name, campaign: CAMPAIGN_RN, status: "ENABLED" },
  }]);
  return r.results[0].resourceName;
}

async function createDgAd(adGroupRn, adName, videoAssetRn) {
  const r = await client.mutateResource("adGroupAds", [{
    create: {
      ad_group: adGroupRn,
      status: "ENABLED",
      ad: {
        name: adName,
        final_urls: [FINAL_URL],
        demand_gen_video_responsive_ad: {
          headlines: HEADLINES.map((t) => ({ text: t })),
          long_headlines: LONG_HEADLINES.map((t) => ({ text: t })),
          descriptions: DESCRIPTIONS.map((t) => ({ text: t })),
          videos: [{ asset: videoAssetRn }],
          logo_images: [{ asset: LOGO_ASSET }],
          business_name: { text: BUSINESS_NAME },
        },
      },
    },
  }]);
  return r.results[0].resourceName;
}

async function pauseAd(adId) {
  await client.mutateResource("adGroupAds", [{
    update: {
      resource_name: `customers/${CUST}/adGroupAds/190145648370~${adId}`,
      status: "PAUSED",
    },
    update_mask: "status",
  }]);
}

console.log("=== Step 1: Pause 4 old ads ===");
for (const ad of OLD_ADS) {
  await pauseAd(ad.id);
  console.log(`  paused: ${ad.name} (${ad.id})`);
}

console.log("\n=== Step 2: Register 3 new YouTube video assets ===");
const creatorAssets = {};
for (const c of NEW_CREATORS) {
  const rn = await registerVideoAsset(c.videoId, c.name);
  creatorAssets[c.name] = rn;
  console.log(`  ${c.name}: ${rn}`);
}

console.log("\n=== Step 3: Create 3 new per-creator ad groups ===");
const creatorAdGroups = {};
for (const c of NEW_CREATORS) {
  const rn = await createAdGroup(`Le Salon VIP - ${c.name}`);
  creatorAdGroups[c.name] = rn;
  console.log(`  ${c.name}: ${rn}`);
}

console.log("\n=== Step 4: Create 3 new creator ads ===");
for (const c of NEW_CREATORS) {
  const rn = await createDgAd(
    creatorAdGroups[c.name],
    `Le Salon VIP - ${c.name}`,
    creatorAssets[c.name],
  );
  console.log(`  ${c.name}: ${rn}`);
}

console.log("\n=== Step 5: Recreate 4 old ads with new date in All Videos ad group ===");
for (const ad of OLD_ADS) {
  const rn = await createDgAd(
    EXISTING_AG_RN,
    `Le Salon VIP - ${ad.name}`,
    ad.videoAsset,
  );
  console.log(`  ${ad.name}: ${rn}`);
}

console.log("\n=== DONE ===");
