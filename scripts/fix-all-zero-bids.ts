/**
 * Fix all €0.00 keyword bids across all ENABLED search campaigns.
 * Brand keywords: Exact €2.00, Phrase €1.50, Broad €1.00
 * (Product keywords already set at €0.60 — skip those)
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

async function main() {
  const client = new GoogleAdsClient({
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  });

  // Get all keywords with bids below €0.50 (too low to generate traffic) from enabled search campaigns
  const rows: any[] = await client.query(
    `SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.cpc_bid_micros, campaign.name FROM ad_group_criterion WHERE campaign.status = 'ENABLED' AND campaign.advertising_channel_type = 'SEARCH' AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED' AND ad_group_criterion.cpc_bid_micros < 500000`
  );

  const keywords = rows[0]?.results ?? [];
  console.log(`Found ${keywords.length} keywords with €0.00 bids\n`);

  if (keywords.length === 0) {
    console.log("Nothing to fix!");
    return;
  }

  // Batch updates in groups of 50 (API limit per mutate call)
  const BATCH_SIZE = 50;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const batch = keywords.slice(i, i + BATCH_SIZE);
    const ops = batch.map((row: any) => ({
      update: {
        resource_name: row.adGroupCriterion.resourceName,
        cpc_bid_micros: bidFor(row.adGroupCriterion.keyword.matchType),
      },
      updateMask: "cpc_bid_micros",
    }));

    try {
      await client.mutateResource("adGroupCriteria", ops);
      updated += batch.length;
      const pct = Math.round(((i + batch.length) / keywords.length) * 100);
      console.log(`  Updated ${i + batch.length}/${keywords.length} (${pct}%)`);
    } catch (err) {
      console.error(`  ✗ Batch ${i}-${i + batch.length}: ${err instanceof Error ? err.message.slice(0, 100) : String(err)}`);
      failed += batch.length;
    }
  }

  console.log(`\n✅ Done! Updated: ${updated}, Failed: ${failed}`);
  console.log(`Bids set: EXACT €2.00, PHRASE €1.50, BROAD €1.00`);
}

main().catch(console.error);
