/**
 * Verify which ENABLED campaigns actually lack geo targeting
 * (both LOCATION and PROXIMITY criteria, positive only).
 *
 * Usage: GH_PKG_TOKEN=... npx tsx --require dotenv/config scripts/check-geo-targeting.ts
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
  const campaigns = flat(
    await client.query(`
      SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.status
      FROM campaign
      WHERE campaign.status = 'ENABLED'
    `)
  );

  const geo = flat(
    await client.query(`
      SELECT campaign.name, campaign_criterion.type,
        campaign_criterion.location.geo_target_constant,
        campaign_criterion.proximity.radius,
        campaign_criterion.negative
      FROM campaign_criterion
      WHERE campaign_criterion.type IN ('LOCATION', 'PROXIMITY')
        AND campaign.status = 'ENABLED'
    `)
  );

  const withPositive = new Set<string>();
  const withLocationOnly = new Set<string>();
  const withProximityOnly = new Set<string>();
  for (const row of geo) {
    const name: string = row.campaign?.name;
    const neg = row.campaignCriterion?.negative === true;
    if (neg) continue;
    withPositive.add(name);
    const t = row.campaignCriterion?.type;
    if (t === "LOCATION") withLocationOnly.add(name);
    if (t === "PROXIMITY") withProximityOnly.add(name);
  }

  const missing = campaigns.filter(
    (c: any) => !withPositive.has(c.campaign?.name)
  );

  console.log(`\nENABLED campaigns: ${campaigns.length}`);
  console.log(`  with any positive geo : ${withPositive.size}`);
  console.log(`  w/ LOCATION rows      : ${withLocationOnly.size}`);
  console.log(`  w/ PROXIMITY rows     : ${withProximityOnly.size}`);
  console.log(`  WITHOUT geo targeting : ${missing.length}\n`);

  if (missing.length) {
    console.log("Campaigns missing geo targeting:");
    for (const c of missing) {
      const t = c.campaign?.advertisingChannelType ?? "?";
      console.log(`  [${t.padEnd(10)}] ${c.campaign?.name}  (id: ${c.campaign?.id})`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
