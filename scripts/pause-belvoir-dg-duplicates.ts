/**
 * Pause the 2 duplicate Belvoir DG campaigns (#2 of mode + wellness).
 * They reuse identical asset IDs from the originals → doubling Google's
 * review queue without adding any unique creative signal.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const DUPLICATES = [
  { id: "23776223501", name: "belvoir_DG_mode_NL_260416 #2" },
  { id: "23780869582", name: "belvoir_DG_wellness-be_NL_260416 #2" },
];

async function main() {
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!;
  const client = new GoogleAdsClient({
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    customerId,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  });

  for (const { id, name } of DUPLICATES) {
    const rn = `customers/${customerId}/campaigns/${id}`;
    console.log(`Pausing [${id}] ${name} ...`);
    await client.pauseCampaign(rn);
    console.log("  ✓ paused");
  }

  console.log("\nVerifying...");
  const verify = (await client.query(
    `SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.id IN (${DUPLICATES.map((d) => d.id).join(",")})`,
  )) as any[];
  for (const batch of verify) {
    for (const r of batch.results ?? []) {
      console.log(`  [${r.campaign.id}] ${r.campaign.name} → ${r.campaign.status}`);
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
