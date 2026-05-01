/**
 * Fix: Apply brand filter (CLIO GOLDBRENNER) to the existing Shopping campaign.
 * The campaign was created but the listing group filter step failed.
 */
import "dotenv/config";
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const CAMPAIGN_ID = "23733651534";
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
  // 1. Find the ad group
  console.log("Finding ad group...");
  const agResult = await client.query(`
    SELECT ad_group.id, ad_group.name, ad_group.resource_name
    FROM ad_group
    WHERE campaign.id = ${CAMPAIGN_ID}
    LIMIT 1
  `);
  const adGroup = agResult[0]?.results?.[0]?.adGroup;
  if (!adGroup) {
    throw new Error("No ad group found for campaign " + CAMPAIGN_ID);
  }
  console.log(`  Ad group: ${adGroup.name} (${adGroup.id})`);
  const adGroupRn = adGroup.resourceName;
  const adGroupId = adGroup.id;

  // 2. Check existing listing groups
  console.log("Checking existing listing groups...");
  const lgResult = await client.query(`
    SELECT ad_group_criterion.criterion_id, ad_group_criterion.listing_group.type
    FROM ad_group_criterion
    WHERE ad_group.id = ${adGroupId}
      AND ad_group_criterion.type = 'LISTING_GROUP'
  `);

  const existingCriteria: string[] = [];
  for (const batch of lgResult) {
    for (const row of batch.results ?? []) {
      existingCriteria.push(String(row.adGroupCriterion.criterionId));
    }
  }
  console.log(`  Found ${existingCriteria.length} existing listing group(s)`);

  // 3. Remove existing listing groups
  if (existingCriteria.length > 0) {
    console.log("Removing default listing groups...");
    const removeOps = existingCriteria.map((critId) => ({
      remove: `customers/${CUSTOMER_ID}/adGroupCriteria/${adGroupId}~${critId}`,
    }));
    await client.mutateResource("adGroupCriteria", removeOps as any);
    console.log("  Removed.");
  }

  // 4. Create brand filter tree
  console.log("Creating brand filter for CLIO GOLDBRENNER...");
  const criterionBase = `customers/${CUSTOMER_ID}/adGroupCriteria/${adGroupId}~`;

  const ops = [
    // Root subdivision
    {
      create: {
        ad_group: adGroupRn,
        listing_group: { type: "SUBDIVISION" },
        status: "ENABLED",
        resource_name: `${criterionBase}-1`,
      },
    },
    // Included: CLIO GOLDBRENNER
    {
      create: {
        ad_group: adGroupRn,
        listing_group: {
          type: "UNIT",
          parent_ad_group_criterion: `${criterionBase}-1`,
          case_value: { product_brand: { value: "CLIO GOLDBRENNER" } },
        },
        status: "ENABLED",
        cpc_bid_micros: "500000", // €0.50
        resource_name: `${criterionBase}-2`,
      },
    },
    // Everything else — minimal bid (effectively excluded)
    {
      create: {
        ad_group: adGroupRn,
        listing_group: {
          type: "UNIT",
          parent_ad_group_criterion: `${criterionBase}-1`,
          case_value: { product_brand: {} },
        },
        status: "ENABLED",
        cpc_bid_micros: "10000", // €0.01
        resource_name: `${criterionBase}-3`,
      },
    },
  ];

  const result = await client.mutateResource("adGroupCriteria", ops as any);
  console.log("\n✅ Brand filter applied!");
  console.log(`  Root:    ${result.results[0].resourceName}`);
  console.log(`  Clio:    ${result.results[1].resourceName} (€0.50 bid)`);
  console.log(`  Other:   ${result.results[2].resourceName} (€0.01 bid)`);
  console.log("\nCampaign is PAUSED. Enable when ready.");
}

main().catch((err) => {
  console.error("❌ Failed:", err.message ?? err);
  process.exit(1);
});
