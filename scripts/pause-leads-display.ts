/**
 * Pause the low-CTR Leads Display Dutch campaign flagged in Mar 30 audit.
 * Campaign id 23447689611 — ENABLED, CTR 0.22%, €1170 spent, €4.33 return.
 *
 * Usage: GH_PKG_TOKEN=... npx tsx --require dotenv/config scripts/pause-leads-display.ts
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const CAMPAIGN_ID = "23447689611";

const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
  managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
});

async function main() {
  const resourceName = `customers/${process.env.GOOGLE_ADS_CUSTOMER_ID}/campaigns/${CAMPAIGN_ID}`;
  await client.mutateResource("campaigns", [{
    update: { resource_name: resourceName, status: "PAUSED" },
    updateMask: "status",
  }]);
  console.log(`✓ PAUSED campaign ${CAMPAIGN_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
