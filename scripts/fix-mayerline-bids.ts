/**
 * Check and fix Mayerline keyword CPC bids.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const NL_AD_GROUP = "customers/6267337247/adGroups/196654138284";
const FR_AD_GROUP = "customers/6267337247/adGroups/195733379195";

// Sensible default bids for fashion outlet brand campaigns
const DEFAULT_CPC_MICROS = 1_500_000; // €1.50
const EXACT_CPC_MICROS = 2_000_000;   // €2.00 for exact match (higher intent)
const BROAD_CPC_MICROS = 1_000_000;   // ���1.00 for broad match (lower intent)

function bidForMatchType(matchType: string): string {
  if (matchType === "EXACT") return String(EXACT_CPC_MICROS);
  if (matchType === "BROAD") return String(BROAD_CPC_MICROS);
  return String(DEFAULT_CPC_MICROS); // PHRASE
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

  for (const [lang, adGroupRn] of [["NL", NL_AD_GROUP], ["FR", FR_AD_GROUP]] as const) {
    console.log(`\n--- ${lang} keywords ---`);

    const rows: any[] = await client.query(
      `SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.cpc_bid_micros FROM ad_group_criterion WHERE ad_group.resource_name = '${adGroupRn}' AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'`
    );

    const criteria = rows[0]?.results ?? [];
    console.log(`Found ${criteria.length} keywords\n`);

    for (const row of criteria) {
      const kw = row.adGroupCriterion;
      const text = kw.keyword.text;
      const matchType = kw.keyword.matchType;
      const currentBid = Number(kw.cpcBidMicros ?? 0);
      const newBid = bidForMatchType(matchType);
      const currentEur = (currentBid / 1_000_000).toFixed(2);
      const newEur = (Number(newBid) / 1_000_000).toFixed(2);

      console.log(`  ${text} [${matchType}] — current: €${currentEur}, new: €${newEur}`);

      if (currentBid !== Number(newBid)) {
        await client.mutateResource("adGroupCriteria", [{
          update: {
            resource_name: kw.resourceName,
            cpc_bid_micros: newBid,
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
