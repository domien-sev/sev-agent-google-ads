/**
 * Check whether LONG_HEADLINE assets are linked to the 4 stuck Belvoir DG ads.
 * Read-only.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

type Row = Record<string, any>;
const STUCK_IDS = [23756207664, 23756208420, 23776223501, 23780869582];

async function runQuery(client: GoogleAdsClient, gaql: string): Promise<Row[]> {
  const res = (await client.query(gaql)) as Row[];
  return res.flatMap((batch) => batch.results ?? []);
}

async function main() {
  const client = new GoogleAdsClient({
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  });

  // Per-ad field-type counts across all field types
  const rows = await runQuery(
    client,
    `
    SELECT
      campaign.id,
      ad_group_ad.ad.id,
      ad_group_ad_asset_view.field_type,
      asset.id
    FROM ad_group_ad_asset_view
    WHERE campaign.id IN (${STUCK_IDS.join(",")})
    `,
  );

  const perAd = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const key = `[${r.campaign.id}] ad ${r.adGroupAd.ad.id}`;
    if (!perAd.has(key)) perAd.set(key, {});
    const ft = r.adGroupAdAssetView.fieldType ?? "?";
    perAd.get(key)![ft] = (perAd.get(key)![ft] ?? 0) + 1;
  }

  console.log("Field-type distribution per ad:\n");
  for (const [k, v] of perAd) {
    const has = (f: string) => (v[f] ?? 0) > 0 ? `${f}=${v[f]}` : `${f}=0 ❌`;
    console.log(`  ${k}`);
    console.log(`    ${has("HEADLINE")}  ${has("LONG_HEADLINE")}  ${has("DESCRIPTION")}  ${has("BUSINESS_NAME")}`);
    console.log(`    ${has("LOGO")}  ${has("MARKETING_IMAGE")}  ${has("SQUARE_MARKETING_IMAGE")}  ${has("PORTRAIT_MARKETING_IMAGE")}  ${has("TALL_PORTRAIT_MARKETING_IMAGE")}  ${has("CALL_TO_ACTION_SELECTION")}`);
  }

  // Also dump unique field types observed
  const allFieldTypes = new Set<string>();
  for (const v of perAd.values()) for (const k of Object.keys(v)) allFieldTypes.add(k);
  console.log(`\nAll field types observed: ${[...allFieldTypes].sort().join(", ")}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
