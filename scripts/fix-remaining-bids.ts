/**
 * Fix remaining low bids — one keyword at a time to handle errors gracefully.
 * Only targets current (260xxx) campaigns.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const EXACT_CPC = "2000000";
const PHRASE_CPC = "1500000";
const BROAD_CPC = "1000000";

function bidFor(matchType: string): string {
  if (matchType === "EXACT") return EXACT_CPC;
  if (matchType === "BROAD") return BROAD_CPC;
  return PHRASE_CPC;
}

const TARGET_CAMPAIGNS = [
  "260309_RiverWoods_NL",
  "260411_agent_physical_AmlieAmlie_SalonVIP_FR",
  "260411_agent_physical_SweetLemon_SalonVIP_NL",
  "260411_agent_physical_WoodWick_SalonVIP_NL",
  "260411_agent_physical_Xandres_SalonVIP_NL",
];

async function main() {
  const client = new GoogleAdsClient({
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  });

  const rows: any[] = await client.query(
    `SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.cpc_bid_micros, campaign.name FROM ad_group_criterion WHERE campaign.status = 'ENABLED' AND campaign.advertising_channel_type = 'SEARCH' AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'`
  );

  const all = rows[0]?.results ?? [];
  const toFix = all.filter((r: any) => {
    const bid = Number(r.adGroupCriterion.cpcBidMicros ?? 0);
    return bid < 500000 && TARGET_CAMPAIGNS.includes(r.campaign.name);
  });

  console.log(`Fixing ${toFix.length} keywords across ${TARGET_CAMPAIGNS.length} campaigns\n`);

  let updated = 0;
  for (const row of toFix) {
    const kw = row.adGroupCriterion;
    const newBid = bidFor(kw.keyword.matchType);
    try {
      await client.mutateResource("adGroupCriteria", [{
        update: { resource_name: kw.resourceName, cpc_bid_micros: newBid },
        updateMask: "cpc_bid_micros",
      }]);
      updated++;
    } catch (err: any) {
      console.log(`  ✗ ${kw.keyword.text} (${row.campaign.name}): ${err.message?.slice(0, 80)}`);
    }
  }

  console.log(`\n✅ Updated ${updated}/${toFix.length} keywords`);
}

main().catch(console.error);
