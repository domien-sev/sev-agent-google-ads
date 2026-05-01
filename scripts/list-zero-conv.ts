import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
  managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
});

async function main() {
  const raw = await client.query(`
    SELECT
      campaign.id, campaign.name, campaign.status,
      campaign.advertising_channel_type,
      campaign_budget.amount_micros,
      metrics.impressions, metrics.clicks,
      metrics.cost_micros, metrics.conversions, metrics.all_conversions
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.status = 'ENABLED'
      AND metrics.cost_micros > 0
    ORDER BY metrics.cost_micros DESC
  `);

  const rows = Array.isArray(raw) ? raw.flatMap((c: any) => c.results || []) : [];
  let totalWaste = 0;
  let count = 0;

  console.log("ENABLED campaigns with 0 primary conversions (last 30 days):\n");
  console.log("ID | Name | Type | Cost € | Clicks | AllConv | Budget/d");
  console.log("-".repeat(120));

  for (const row of rows) {
    const c = (row as any).campaign || {};
    const m = (row as any).metrics || {};
    const b = (row as any).campaignBudget || {};
    const conv = Number(m.conversions ?? 0);
    const allConv = Number(m.allConversions ?? 0);
    const cost = Number(m.costMicros ?? 0) / 1_000_000;
    const budgetDay = Number(b.amountMicros ?? 0) / 1_000_000;

    if (conv === 0) {
      totalWaste += cost;
      count++;
      console.log(`${c.id} | ${c.name} | ${c.advertisingChannelType} | €${cost.toFixed(2)} | ${m.clicks} | ${allConv.toFixed(1)} | €${budgetDay.toFixed(2)}/d`);
    }
  }

  console.log("-".repeat(120));
  console.log(`\n${count} campaigns with 0 conversions, total wasted: €${totalWaste.toFixed(2)}`);
}

main().catch(console.error);
