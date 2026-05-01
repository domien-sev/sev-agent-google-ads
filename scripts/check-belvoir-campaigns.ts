import { GoogleAdsClient } from "@domien-sev/ads-sdk";
const c = new GoogleAdsClient({ developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!, clientId: process.env.GOOGLE_ADS_CLIENT_ID!, clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!, refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!, customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!, managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID });

async function main() {
  const r = await c.query(`SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign WHERE campaign.name LIKE 'belvoir_%' AND campaign.status != 'REMOVED'`);
  const rows = Array.isArray(r) ? r.flatMap((x: any) => x.results || []) : [];
  if (rows.length === 0) { console.log("No belvoir campaigns found"); return; }
  for (const row of rows) {
    const ca = (row as any).campaign || {};
    console.log(`${ca.id} | ${ca.name} | ${ca.status} | ${ca.advertisingChannelType}`);
  }
}
main().catch(console.error);
