/**
 * Round 2: Fix remaining conversion actions with no value,
 * and zero out pageview/shipping/refund actions.
 *
 * Usage: npx tsx --require dotenv/config scripts/fix-conversion-values-round2.ts [--dry-run]
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const DRY_RUN = process.argv.includes("--dry-run");
const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID!;

const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  customerId: CUSTOMER_ID,
  managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
});

const FIXES = [
  // --- Zero out pageviews, shipping, refunds ---
  { id: "6663428571", name: "rt viewcontent", defaultValue: 0, note: "Pageview — no monetary value per industry standard" },
  { id: "7471258729", name: "pageview rt", defaultValue: 0, note: "Pageview — no monetary value" },
  { id: "6663458600", name: "rt Shipping", defaultValue: 0, note: "Shipping event — no monetary value" },
  { id: "7471267630", name: "Refund rt", defaultValue: 0, note: "Refund — can't do negative, set €0" },
  { id: "6663336880", name: "rt Refund", defaultValue: 0, note: "Refund — can't do negative, set €0" },

  // --- Add to cart actions: ~5% of AOV (€67) = €3 ---
  { id: "7453459130", name: "rt add to cart", defaultValue: 3, note: "Add to cart — ~5% of €67 AOV" },
  { id: "1048697485", name: "Shopping Cart", defaultValue: 3, note: "UA goal add to cart — ~5% of AOV" },
  { id: "6600340448", name: "shopping ecom ua - GA4 (web) shopping_cart", defaultValue: 3, note: "GA4 add to cart — ~5% of AOV" },
  { id: "6500751039", name: "shopping ecom ua - GA4 (web) addtocart", defaultValue: 3, note: "GA4 addtocart — ~5% of AOV" },

  // --- Contact/checkout info: €5 ---
  { id: "1048697518", name: "Contact Information", defaultValue: 5, note: "UA goal checkout contact info" },
  { id: "6600340451", name: "shopping ecom ua - GA4 (web) contact_information", defaultValue: 5, note: "GA4 checkout contact info" },

  // --- Lead (0 volume but fix for future): €5 ---
  { id: "6819633772", name: "rt Lead", defaultValue: 5, note: "RedTrack lead — already had defVal=5" },
];

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  for (const fix of FIXES) {
    console.log(`  ${fix.name} (${fix.id}) → €${fix.defaultValue}, alwaysUseDefaultValue=true — ${fix.note}`);
  }

  if (DRY_RUN) {
    console.log("\nDRY RUN — no changes made.");
    return;
  }

  console.log("");
  for (const fix of FIXES) {
    const resourceName = `customers/${CUSTOMER_ID}/conversionActions/${fix.id}`;
    try {
      await client.mutateResource("conversionActions", [
        {
          update: {
            resourceName,
            valueSettings: {
              defaultValue: fix.defaultValue,
              alwaysUseDefaultValue: true,
            },
          },
          updateMask: "value_settings.default_value,value_settings.always_use_default_value",
        },
      ]);
      console.log(`  OK: ${fix.name} (${fix.id}) → €${fix.defaultValue}`);
    } catch (err: any) {
      console.error(`  FAIL: ${fix.name} (${fix.id}) — ${err.message}`);
    }
  }
  console.log("\nDone.");
}

main().catch(console.error);
