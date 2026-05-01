/**
 * List all active campaigns with their keywords.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

async function main() {
  const client = new GoogleAdsClient({
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  });

  // Get all enabled campaigns
  const campRows: any[] = await client.query(
    `SELECT campaign.resource_name, campaign.name, campaign.status FROM campaign WHERE campaign.status = 'ENABLED' AND campaign.advertising_channel_type = 'SEARCH' ORDER BY campaign.name`
  );
  const campaigns = campRows[0]?.results ?? [];

  for (const camp of campaigns) {
    const name = camp.campaign.name;
    const rn = camp.campaign.resourceName;
    console.log(`\n=== ${name} ===`);
    console.log(`  RN: ${rn}`);

    // Get keywords
    const kwRows: any[] = await client.query(
      `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.cpc_bid_micros FROM ad_group_criterion WHERE campaign.resource_name = '${rn}' AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED' ORDER BY ad_group_criterion.keyword.text`
    );
    const keywords = kwRows[0]?.results ?? [];
    console.log(`  Keywords (${keywords.length}):`);
    for (const row of keywords) {
      const kw = row.adGroupCriterion;
      const bid = Number(kw.cpcBidMicros ?? 0) / 1_000_000;
      console.log(`    [${kw.keyword.matchType}] ${kw.keyword.text} — €${bid.toFixed(2)}`);
    }
  }
}

main().catch(console.error);
