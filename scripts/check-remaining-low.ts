import { GoogleAdsClient } from "@domien-sev/ads-sdk";
const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
  managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
});
async function run() {
  const rows: any[] = await client.query(
    `SELECT ad_group_criterion.keyword.text, ad_group_criterion.cpc_bid_micros, campaign.name FROM ad_group_criterion WHERE campaign.status = 'ENABLED' AND campaign.advertising_channel_type = 'SEARCH' AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status != 'REMOVED'`
  );
  const all = rows[0]?.results ?? [];
  const stillLow = all.filter((r: any) => Number(r.adGroupCriterion.cpcBidMicros ?? 0) < 500000);
  console.log(`Still low: ${stillLow.length} / ${all.length} total`);
  const byCampaign: Record<string, number> = {};
  for (const r of stillLow) {
    byCampaign[r.campaign.name] = (byCampaign[r.campaign.name] ?? 0) + 1;
  }
  for (const [name, count] of Object.entries(byCampaign).sort()) {
    console.log(`  ${name}: ${count}`);
  }
}
run().catch(console.error);
