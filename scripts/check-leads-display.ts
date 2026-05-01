/**
 * Check current state of the 2 low-CTR Leads Display campaigns flagged in Mar 30 audit.
 *
 * Usage: GH_PKG_TOKEN=... npx tsx --require dotenv/config scripts/check-leads-display.ts
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
  managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
});

function flat(raw: any): any[] {
  if (Array.isArray(raw)) return raw.flatMap((c: any) => c.results ?? []);
  return raw?.results ?? [];
}

async function main() {
  const rows = flat(
    await client.query(`
      SELECT campaign.id, campaign.name, campaign.status,
        campaign.advertising_channel_type,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value
      FROM campaign
      WHERE campaign.name LIKE '%Leads Display%Shopping Event VIP%Dutch%'
      ORDER BY campaign.name
    `)
  );

  console.log(`\nFound ${rows.length} matching campaign(s):\n`);
  for (const r of rows) {
    const c = r.campaign;
    const m = r.metrics ?? {};
    const cost = (Number(m.costMicros ?? 0) / 1_000_000).toFixed(2);
    const ctr = ((Number(m.ctr ?? 0)) * 100).toFixed(2);
    console.log(`- ${c.name}`);
    console.log(`    id=${c.id} status=${c.status} type=${c.advertisingChannelType}`);
    console.log(`    impressions=${m.impressions ?? 0} clicks=${m.clicks ?? 0} ctr=${ctr}%`);
    console.log(`    cost=€${cost} conv=${m.conversions ?? 0} value=€${m.conversionsValue ?? 0}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
