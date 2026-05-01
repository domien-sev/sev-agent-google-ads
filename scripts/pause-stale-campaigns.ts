/**
 * Pause stale campaigns for past events.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const STALE = [
  "251021-le-salon-vip",
  "251021-xandres-search-le-salon-vip",
  "251021_Bellerose_NL_le-salon-vip",
  "251029_Paprika_NL_le-salon-vip",
  "Gigue - 13,14 Feb26 - Shopping Event VIP - Saint Nikolas",
  "Gigue Campaign - NL Le Salon VIP - Sint-Niklaas",
  "Mayerline - 13,14 Feb26 - Shopping Event VIP - Saint Nikolas",
  "Xandres - 4 to 8 March 2026 - Shopping Event VIP",
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
    `SELECT campaign.resource_name, campaign.name FROM campaign WHERE campaign.status = 'ENABLED'`
  );
  const campaigns = rows[0]?.results ?? [];

  for (const row of campaigns) {
    const name = row.campaign.name;
    if (!STALE.includes(name)) continue;

    try {
      await client.mutateResource("campaigns", [{
        update: { resource_name: row.campaign.resourceName, status: "PAUSED" },
        updateMask: "status",
      }]);
      console.log(`✓ PAUSED: ${name}`);
    } catch (err: any) {
      console.log(`✗ ${name}: ${err.message?.slice(0, 80)}`);
    }
  }

  console.log("\n✅ Done!");
}

main().catch(console.error);
