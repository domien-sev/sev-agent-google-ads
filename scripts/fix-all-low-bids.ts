/**
 * Fix all keyword bids below €0.50 across all ENABLED search campaigns.
 * Brand keywords (currently <€0.50): Exact €2.00, Phrase €1.50, Broad €1.00
 * Product keywords (currently €0.60): leave as-is
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const EXACT_CPC = 2_000_000;
const PHRASE_CPC = 1_500_000;
const BROAD_CPC = 1_000_000;
const MIN_BID = 500_000; // €0.50 — anything below this gets fixed

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

  // Get ALL keywords from enabled search campaigns
  const rows: any[] = await client.query(
    `SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.cpc_bid_micros, campaign.name FROM ad_group_criterion WHERE campaign.status = 'ENABLED' AND campaign.advertising_channel_type = 'SEARCH' AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'`
  );

  const allKeywords = rows[0]?.results ?? [];
  console.log(`Total keywords across all campaigns: ${allKeywords.length}`);

  // Filter to only those with bids below €0.50
  const lowBids = allKeywords.filter((row: any) => {
    const bid = Number(row.adGroupCriterion.cpcBidMicros ?? 0);
    return bid < MIN_BID;
  });

  console.log(`Keywords with bids below €0.50: ${lowBids.length}\n`);

  if (lowBids.length === 0) {
    console.log("Nothing to fix!");
    return;
  }

  // Show a sample
  console.log("Sample of low-bid keywords:");
  for (const row of lowBids.slice(0, 10)) {
    const kw = row.adGroupCriterion;
    const bid = (Number(kw.cpcBidMicros ?? 0) / 1_000_000).toFixed(2);
    console.log(`  [${kw.keyword.matchType}] ${kw.keyword.text} — €${bid} (${row.campaign.name})`);
  }
  console.log(`  ... and ${Math.max(0, lowBids.length - 10)} more\n`);

  // Batch updates in groups of 50
  const BATCH_SIZE = 50;
  let updated = 0;

  for (let i = 0; i < lowBids.length; i += BATCH_SIZE) {
    const batch = lowBids.slice(i, i + BATCH_SIZE);
    const ops = batch.map((row: any) => ({
      update: {
        resource_name: row.adGroupCriterion.resourceName,
        cpc_bid_micros: String(bidFor(row.adGroupCriterion.keyword.matchType)),
      },
      updateMask: "cpc_bid_micros",
    }));

    try {
      await client.mutateResource("adGroupCriteria", ops);
      updated += batch.length;
      console.log(`  Updated ${Math.min(i + BATCH_SIZE, lowBids.length)}/${lowBids.length}`);
    } catch (err) {
      console.error(`  ✗ Batch failed: ${err instanceof Error ? err.message.slice(0, 100) : String(err)}`);
    }
  }

  console.log(`\n✅ Done! Updated ${updated} keywords.`);
  console.log(`Bids set: EXACT €2.00, PHRASE €1.50, BROAD €1.00`);
}

main().catch(console.error);
