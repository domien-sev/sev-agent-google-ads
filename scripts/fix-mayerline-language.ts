/**
 * Set language targeting on Mayerline campaigns: NL → Dutch, FR → French
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const NL_CAMPAIGN = "customers/6267337247/campaigns/23714153721";
const FR_CAMPAIGN = "customers/6267337247/campaigns/23719436828";

async function main() {
  const client = new GoogleAdsClient({
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  });

  // Check existing language criteria first
  for (const [label, campaignRn, langConstant] of [
    ["NL", NL_CAMPAIGN, "languageConstants/1010"],
    ["FR", FR_CAMPAIGN, "languageConstants/1002"],
  ] as const) {
    console.log(`\n--- ${label} campaign ---`);

    // Check existing
    const existing: any[] = await client.query(
      `SELECT campaign_criterion.resource_name, campaign_criterion.language.language_constant FROM campaign_criterion WHERE campaign.resource_name = '${campaignRn}' AND campaign_criterion.type = 'LANGUAGE'`
    );
    const criteria = existing[0]?.results ?? [];
    console.log(`Existing language criteria: ${criteria.length}`);
    for (const c of criteria) {
      console.log(`  ${c.campaignCriterion?.language?.languageConstant}`);
    }

    // Add language targeting
    try {
      await client.mutateResource("campaignCriteria", [{
        create: {
          campaign: campaignRn,
          language: { language_constant: langConstant },
        },
      }]);
      console.log(`✓ ${label} language set to ${langConstant}`);
    } catch (err) {
      console.error(`✗ ${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().catch(console.error);
