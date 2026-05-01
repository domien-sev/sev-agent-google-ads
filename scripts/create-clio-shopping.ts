/**
 * One-off script: Create Google Shopping campaign for Clio Goldbrenner sale
 * Collection: https://www.shoppingeventvip.com/collections/clio
 * 40 products (bags, straps, wallets) — €27.50–€357.00
 *
 * Usage: cd sev-agent-channel-google-ads && npx tsx --require dotenv/config scripts/create-clio-shopping.ts
 */
import "dotenv/config";
import { GoogleAdsClient } from "@domien-sev/ads-sdk";
import { buildCampaign } from "../src/tools/campaign-builder.js";
import type { CampaignConfig } from "../src/types.js";

const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID!;

const config: CampaignConfig = {
  type: "shopping",
  name: "Shopping - Clio Goldbrenner Sale",
  dailyBudgetMicros: 50_000_000, // €50/day
  locations: ["BE"],
  languages: ["nl", "fr"],
  startDate: new Date().toISOString().split("T")[0],
  merchantId: process.env.GOOGLE_MERCHANT_ID ?? "287380490",
  feedLabel: "online",
  inventoryFilter: {
    dimension: "brand",
    values: ["CLIO GOLDBRENNER"],
  },
};

async function main() {
  console.log("🔧 Creating Shopping campaign for Clio Goldbrenner...\n");
  console.log(`  Name:    ${config.name}`);
  console.log(`  Budget:  €${config.dailyBudgetMicros / 1_000_000}/day`);
  console.log(`  Filter:  brand = "${config.inventoryFilter!.values.join(", ")}"`);
  console.log(`  Target:  ${config.locations.join(", ")}`);
  console.log(`  Status:  PAUSED (awaiting approval)\n`);

  const client = new GoogleAdsClient({
    customerId: CUSTOMER_ID,
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  });

  const result = await buildCampaign(client, config);

  console.log("✅ Campaign created successfully!\n");
  console.log(`  Campaign:  ${result.campaignResourceName}`);
  console.log(`  Ad Group:  ${result.adGroupResourceName}`);
  if (result.adWarning) {
    console.log(`  ⚠️  ${result.adWarning}`);
  }
  console.log("\nNext steps:");
  console.log("  1. Verify products appear in Google Ads UI under this campaign");
  console.log("  2. Check that brand filter matches Merchant Center feed");
  console.log("  3. Enable campaign when ready");
}

main().catch((err) => {
  console.error("❌ Failed:", err.message ?? err);
  process.exit(1);
});
