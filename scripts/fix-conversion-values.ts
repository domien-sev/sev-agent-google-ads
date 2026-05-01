/**
 * Fix conversion actions that have conversions but €0 value.
 * Sets alwaysUseDefaultValue=true with appropriate default values.
 *
 * Usage: npx tsx --require dotenv/config scripts/fix-conversion-values.ts [--dry-run]
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

/**
 * Conversion actions to fix:
 * - These are UPLOAD_CLICKS (RedTrack) with alwaysUseDefaultValue=false
 * - RedTrack is NOT passing dynamic values for these, so they report €0
 * - Setting alwaysUseDefaultValue=true ensures the default is used
 *
 * NOT touching:
 * - rt purchase (6663458558) — already working, €63k value from 945 conv
 * - subscription-physical-sale (6459865918) — already correct (alwaysDef=true)
 * - GA4 actions — managed by Google Analytics, not RedTrack
 */
const FIXES = [
  {
    id: "6663428571",
    name: "rt viewcontent",
    category: "PAGE_VIEW",
    defaultValue: 0.05,
    note: "Pageview — micro value",
  },
  {
    id: "6663428586",
    name: "rt InitiateCheckout",
    category: "PAGE_VIEW",
    defaultValue: 15,
    note: "Checkout initiation — high-intent, ~15% of avg purchase value",
  },
  {
    id: "6773513252",
    name: "rt individual registration event",
    category: "SIGNUP",
    defaultValue: 10,
    note: "Event registration — already had defVal=10",
  },
  {
    id: "7404915591",
    name: "rt new registration",
    category: "SIGNUP",
    defaultValue: 5,
    note: "New user registration — already had defVal=5",
  },
  {
    id: "7471492068",
    name: "rt buy",
    category: "PURCHASE",
    defaultValue: 67,
    note: "Purchase — avg order value derived from rt purchase (€63,486 / 945 = ~€67)",
  },
  {
    id: "7404915573",
    name: "rt sev lander lead",
    category: "SIGNUP",
    defaultValue: 5,
    note: "Landing page lead — already had defVal=5",
  },
  {
    id: "7498716439",
    name: "rt belvoir article link click",
    category: "OUTBOUND_CLICK",
    defaultValue: 0.10,
    note: "Belvoir outbound click",
  },
  {
    id: "7498714537",
    name: "rt belvoir optin",
    category: "SUBMIT_LEAD_FORM",
    defaultValue: 5,
    note: "Belvoir email optin",
  },
];

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);
  console.log("Conversion actions to update:\n");

  for (const fix of FIXES) {
    console.log(`  ${fix.name} (${fix.id})`);
    console.log(`    Category: ${fix.category}`);
    console.log(`    Set: alwaysUseDefaultValue=true, defaultValue=€${fix.defaultValue}`);
    console.log(`    Note: ${fix.note}\n`);
  }

  if (DRY_RUN) {
    console.log("DRY RUN — no changes made. Remove --dry-run to apply.");
    return;
  }

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
      console.log(`  OK: ${fix.name} (${fix.id}) — alwaysUseDefaultValue=true, defaultValue=€${fix.defaultValue}`);
    } catch (err: any) {
      console.error(`  FAIL: ${fix.name} (${fix.id}) — ${err.message}`);
    }
  }

  console.log("\nDone. Verify in Google Ads UI > Goals > Conversion actions.");
}

main().catch(console.error);
