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
const CAMP_RN = `customers/${CUST}/campaigns/23747873241`;
const AG_RN   = `customers/${CUST}/adGroups/195076815309`;
const LOGO    = `customers/${CUST}/assets/73011795371`;
const VIDEO_ID = "LR4HVQgUvVs";
const FINAL_URL = "https://www.shoppingeventvip.be/fr/event/le-salon-vip?ref=yt";

const HEADLINES = ["Acheter", "Jusqu'à -70%", "Exclusif VIP"];
const LONG_HEADLINES = ["Prix outlet exclusifs au Salon VIP"];
const DESCRIPTIONS = [
  "Grandes marques à prix outlet. 17-26 avril, Saint-Nicolas.",
  "Réservez et profitez de remises jusqu'à -70%.",
];

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Retry video asset registration
let videoAssetRn;
for (let attempt = 1; attempt <= 8; attempt++) {
  try {
    console.log(`Attempt ${attempt}: register video asset...`);
    const a = await client.mutateResource("assets", [{
      create: {
        name: "Le Salon VIP - Amina FR Short",
        type: "YOUTUBE_VIDEO",
        youtube_video_asset: { youtube_video_id: VIDEO_ID },
      },
    }]);
    videoAssetRn = a.results[0].resourceName;
    console.log(`  ✅ ${videoAssetRn}`);
    break;
  } catch (err) {
    if (err.message.includes("VIDEO_NOT_FOUND") && attempt < 8) {
      const wait = 30000;
      console.log(`  VIDEO_NOT_FOUND — waiting ${wait/1000}s`);
      await sleep(wait);
      continue;
    }
    throw err;
  }
}
if (!videoAssetRn) throw new Error("Could not register video after retries");

// Create ad
console.log("\nCreate ad...");
const ad = await client.mutateResource("adGroupAds", [{
  create: {
    ad_group: AG_RN,
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

// Enable campaign
console.log("\nEnable campaign...");
await client.mutateResource("campaigns", [{
  update: { resource_name: CAMP_RN, status: "ENABLED" },
  update_mask: "status",
}]);
console.log("  ENABLED");

console.log("\n=== DONE ===");
console.log("Campaign: https://ads.google.com/aw/adgroups?campaignId=23747873241");
