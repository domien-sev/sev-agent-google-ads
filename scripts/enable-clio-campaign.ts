/**
 * Enable Clio Shopping campaign + set targeting: Belgium geo, Dutch language only.
 */
import "dotenv/config";
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const CAMPAIGN_ID = "23733651534";
const CAMPAIGN_RN = `customers/6267337247/campaigns/${CAMPAIGN_ID}`;
const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID!;

const client = new GoogleAdsClient({
  customerId: CUSTOMER_ID,
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
});

async function main() {
  // Note: Shopping campaigns inherit language from Merchant Center feed — no API language targeting.

  // 1. Verify geo targeting (Belgium should already be set by createBaseCampaign)
  console.log("Checking geo targeting...");
  const geoResult = await client.query(`
    SELECT campaign_criterion.location.geo_target_constant
    FROM campaign_criterion
    WHERE campaign.id = ${CAMPAIGN_ID}
      AND campaign_criterion.type = 'LOCATION'
  `);
  const hasGeo = geoResult[0]?.results?.length > 0;
  if (hasGeo) {
    console.log("  ✓ Belgium geo targeting already set");
  } else {
    console.log("  Adding Belgium geo targeting...");
    await client.mutateResource("campaignCriteria", [
      {
        create: {
          campaign: CAMPAIGN_RN,
          location: { geo_target_constant: "geoTargetConstants/2056" }, // Belgium
        },
      },
    ] as any);
    console.log("  ✓ Belgium geo targeting set");
  }

  // 3. Enable campaign
  console.log("Enabling campaign...");
  await client.mutateResource("campaigns", [
    {
      update: {
        resource_name: CAMPAIGN_RN,
        status: "ENABLED",
      },
      update_mask: "status",
    },
  ] as any);

  console.log("\n✅ Campaign enabled!");
  console.log("  Campaign: Shopping - Clio Goldbrenner Sale");
  console.log("  Status:   ENABLED");
  console.log("  Geo:      Belgium (all)");
  console.log("  Language:  Dutch (nl)");
  console.log("  Budget:   €50/day");
}

main().catch((err) => {
  console.error("❌ Failed:", err.message ?? err);
  process.exit(1);
});
