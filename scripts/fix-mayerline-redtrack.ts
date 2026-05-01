/**
 * Create RedTrack campaigns for Mayerline NL + FR and set tracking templates.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";
import { createRedTrackCampaign, isRedTrackConfigured } from "../src/tools/redtrack.js";

const NL_CAMPAIGN = "customers/6267337247/campaigns/23714153721";
const FR_CAMPAIGN = "customers/6267337247/campaigns/23719436828";

async function main() {
  if (!isRedTrackConfigured()) {
    console.error("RedTrack not configured — check REDTRACK_API_KEY in .env");
    process.exit(1);
  }

  const client = new GoogleAdsClient({
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  });

  for (const [lang, campaignRn, url] of [
    ["NL", NL_CAMPAIGN, "https://www.shoppingeventvip.be/nl/event/le-salon-vip?ref=gads"],
    ["FR", FR_CAMPAIGN, "https://www.shoppingeventvip.be/fr/event/le-salon-vip?ref=gads"],
  ] as const) {
    console.log(`\n--- ${lang} ---`);

    // 1. Create RedTrack campaign
    const rt = await createRedTrackCampaign({
      brand: "Mayerline",
      eventType: "physical",
      landingPageUrl: url,
    });

    if (!rt) {
      console.error(`✗ ${lang} RedTrack campaign creation failed`);
      continue;
    }

    console.log(`✓ RedTrack campaign: ${rt.campaignId}`);
    console.log(`  Tracking template: ${rt.trackingTemplate}`);

    // 2. Set tracking URL template on Google Ads campaign
    try {
      await client.mutateResource("campaigns", [{
        update: {
          resource_name: campaignRn,
          tracking_url_template: rt.trackingTemplate,
        },
        updateMask: "tracking_url_template",
      }]);
      console.log(`✓ ${lang} tracking template applied`);
    } catch (err) {
      console.error(`✗ ${lang} tracking template: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n✅ Done!");
}

main().catch(console.error);
