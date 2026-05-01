/**
 * Recreate the 3 surviving Belvoir DG ads to trigger fresh review,
 * and bump descriptions from 3 → 5 (the only text expansion supported on
 * `demand_gen_multi_asset_ad` — long_headlines is video-DG only).
 *
 * Strategy:
 *  - Pull current headlines/descriptions text + image asset RNs from each ad
 *  - Pause the 3 originals (and the off-season winter ad already paused earlier)
 *  - Create 3 fresh ads in the same ad groups with same content + 2 new
 *    descriptions per ad → fresh review queue entry
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

type Row = Record<string, any>;

const CUSTOMER_ID = "6267337247";
const TARGET_AD_IDS = ["805605133593", "805640957437", "805718038952"];

// Approved NL extra descriptions per ad (≤90 chars)
const EXTRA_DESCRIPTIONS: Record<string, string[]> = {
  "805605133593": [
    "Fijn, krullend of dik haar? Lees welke texturen het beste werken voor jou.",
    "Heldere uitleg per product zodat je nooit meer fout kiest in de winkel.",
  ],
  "805640957437": [
    "Praktische uitleg zodat je weet welk masker werkt voor welk huidprobleem.",
    "Van actieve ingrediënten tot toepassing: alles wat je moet weten.",
  ],
  "805718038952": [
    "Voor moeders, vriendinnen of zussen die zelfzorg een prioriteit maken.",
    "Inspirerende selectie van praktische luxe tot mindful rituelen.",
  ],
};

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
    customerId: CUSTOMER_ID,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  });

  // 1. Pull ad-level info: ad_group, final_urls, business_name
  console.log(`— Reading ad-level info for ${TARGET_AD_IDS.join(", ")}`);
  const adRows = await runQuery(
    client,
    `
    SELECT
      ad_group.resource_name,
      ad_group_ad.resource_name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.demand_gen_multi_asset_ad.business_name
    FROM ad_group_ad
    WHERE ad_group_ad.ad.id IN (${TARGET_AD_IDS.join(",")})
      AND ad_group_ad.status != 'REMOVED'
    `,
  );
  const adInfo = new Map<string, Row>();
  for (const r of adRows) adInfo.set(String(r.adGroupAd.ad.id), r);

  // 2. Pull asset linkage + the asset content (text for HEADLINE/DESCRIPTION,
  //    resource_name for image fields)
  console.log(`— Reading asset linkage + content`);
  const linkRows = await runQuery(
    client,
    `
    SELECT
      ad_group_ad.ad.id,
      ad_group_ad_asset_view.field_type,
      asset.resource_name,
      asset.id,
      asset.type,
      asset.text_asset.text
    FROM ad_group_ad_asset_view
    WHERE ad_group_ad.ad.id IN (${TARGET_AD_IDS.join(",")})
    `,
  );

  // adId → fieldType → list of {rn, text?}
  const links = new Map<string, Map<string, { rn: string; text?: string }[]>>();
  for (const r of linkRows) {
    const adId = String(r.adGroupAd.ad.id);
    const ft = r.adGroupAdAssetView.fieldType;
    if (!links.has(adId)) links.set(adId, new Map());
    const ad = links.get(adId)!;
    if (!ad.has(ft)) ad.set(ft, []);
    ad.get(ft)!.push({
      rn: r.asset.resourceName,
      text: r.asset.textAsset?.text,
    });
  }

  // 3. Build payload + pause + create
  for (const adId of TARGET_AD_IDS) {
    const r = adInfo.get(adId);
    if (!r) {
      console.error(`  ad ${adId} not found, skipping`);
      continue;
    }
    const adGroupRn: string = r.adGroup.resourceName;
    const finalUrl: string = r.adGroupAd.ad.finalUrls?.[0] ?? "";
    const businessName: string = r.adGroupAd.ad.demandGenMultiAssetAd?.businessName ?? "Belvoir";
    const adLinks = links.get(adId)!;

    const headlines = (adLinks.get("HEADLINE") ?? [])
      .map((a) => a.text)
      .filter((t): t is string => !!t)
      .map((text) => ({ text }));

    const existingDescriptions = (adLinks.get("DESCRIPTION") ?? [])
      .map((a) => a.text)
      .filter((t): t is string => !!t);
    const allDescriptions = [
      ...existingDescriptions,
      ...EXTRA_DESCRIPTIONS[adId],
    ].slice(0, 5).map((text) => ({ text }));

    const imageRefs = (ft: string) =>
      (adLinks.get(ft) ?? []).map(({ rn }) => ({ asset: rn }));

    const adPayload: Record<string, unknown> = {
      business_name: businessName,
      headlines,
      descriptions: allDescriptions,
      logo_images: imageRefs("LOGO"),
    };
    const mkt = imageRefs("MARKETING_IMAGE");
    if (mkt.length) adPayload.marketing_images = mkt;
    const sq = imageRefs("SQUARE_MARKETING_IMAGE");
    if (sq.length) adPayload.square_marketing_images = sq;
    const tall = imageRefs("TALL_PORTRAIT_MARKETING_IMAGE");
    if (tall.length) adPayload.tall_portrait_marketing_images = tall;
    const portrait = imageRefs("PORTRAIT_MARKETING_IMAGE");
    if (portrait.length) adPayload.portrait_marketing_images = portrait;

    console.log(`\n— Ad ${adId}`);
    console.log(`  ag=${adGroupRn}`);
    console.log(`  headlines=${headlines.length}  descriptions=${allDescriptions.length}  logo=${(adPayload.logo_images as any[]).length}  mkt=${mkt.length}  sq=${sq.length}  tall=${tall.length}  portrait=${portrait.length}`);

    // Pause original first
    console.log(`  pausing original...`);
    await client.mutateResource("adGroupAds", [
      {
        update: {
          resource_name: r.adGroupAd.resourceName,
          status: "PAUSED",
        },
        update_mask: "status",
      },
    ]);

    // Create new ad
    console.log(`  creating fresh ad...`);
    const createRes = await client.mutateResource("adGroupAds", [
      {
        create: {
          ad_group: adGroupRn,
          status: "ENABLED",
          ad: {
            final_urls: [finalUrl],
            name: `belvoir_dg_${adId}_v2_260428`,
            demand_gen_multi_asset_ad: adPayload,
          },
        },
      },
    ]);
    console.log(`  ✓ created: ${createRes.results[0].resourceName}`);
  }

  console.log("\n=== DONE ===");
  console.log("3 fresh ads created → triggers a new review pass for each.");
  console.log("Old 3 ads paused. Winter off-season ad was already paused.");
  console.log("Manual step: Google Ads UI → for each NEW ad → Policy column → 'Resubmit for review' if available, to push to front of queue.");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
