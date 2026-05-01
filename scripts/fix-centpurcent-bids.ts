/**
 * Fix CPC bids on CentPurCent campaigns.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const EXACT_CPC = 2_000_000;   // €2.00
const PHRASE_CPC = 1_500_000;   // €1.50
const BROAD_CPC = 1_000_000;    // €1.00

function bidFor(matchType: string): number {
  if (matchType === "EXACT") return EXACT_CPC;
  if (matchType === "BROAD") return BROAD_CPC;
  return PHRASE_CPC;
}

async function main() {
  const client = new GoogleAdsClient({
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  });

  // Find all CentPurCent ad groups
  const campaignRows: any[] = await client.query(
    `SELECT campaign.resource_name, campaign.name FROM campaign WHERE campaign.name LIKE '%CentPurCent%' AND campaign.status != 'REMOVED'`
  );
  const campaigns = campaignRows[0]?.results ?? [];

  for (const camp of campaigns) {
    const campaignName = camp.campaign.name;
    const campaignRn = camp.campaign.resourceName;
    console.log(`\n--- ${campaignName} ---`);

    const kwRows: any[] = await client.query(
      `SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.cpc_bid_micros FROM ad_group_criterion WHERE campaign.resource_name = '${campaignRn}' AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'`
    );
    const keywords = kwRows[0]?.results ?? [];

    for (const row of keywords) {
      const kw = row.adGroupCriterion;
      const text = kw.keyword.text;
      const matchType = kw.keyword.matchType;
      const currentBid = Number(kw.cpcBidMicros ?? 0);
      const newBid = bidFor(matchType);
      const currentEur = (currentBid / 1_000_000).toFixed(2);
      const newEur = (newBid / 1_000_000).toFixed(2);

      console.log(`  ${text} [${matchType}] — €${currentEur} → €${newEur}`);

      if (currentBid !== newBid) {
        await client.mutateResource("adGroupCriteria", [{
          update: {
            resource_name: kw.resourceName,
            cpc_bid_micros: String(newBid),
          },
          updateMask: "cpc_bid_micros",
        }]);
        console.log(`    ✓ updated`);
      } else {
        console.log(`    — no change`);
      }
    }
  }

  console.log("\n✅ Done!");
}

main().catch(console.error);
