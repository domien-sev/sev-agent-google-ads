/**
 * Per-asset review state for the 4 stuck Belvoir Demand Gen campaigns.
 * Read-only.
 *
 * v23 quirk: policy_summary was removed from ad_group_ad_asset_view, so we
 * walk the linkage first, then fetch policy_summary from the `asset` resource.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

type Row = Record<string, any>;

const STUCK_IDS = [23756207664, 23756208420, 23776223501, 23780869582];

async function runQuery(client: GoogleAdsClient, gaql: string): Promise<Row[]> {
  const res = (await client.query(gaql)) as Row[];
  return res.flatMap((batch) => batch.results ?? []);
}

function fmt(s: string | undefined | null): string {
  return s ?? "—";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
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

  // 1. Linkage: ad ↔ asset for the 4 stuck campaigns
  const links = await runQuery(
    client,
    `
    SELECT
      campaign.id,
      campaign.name,
      ad_group_ad.ad.id,
      ad_group_ad_asset_view.field_type,
      ad_group_ad_asset_view.performance_label,
      asset.id,
      asset.type
    FROM ad_group_ad_asset_view
    WHERE campaign.id IN (${STUCK_IDS.join(",")})
    `,
  );

  console.log(`Found ${links.length} ad↔asset links across the 4 campaigns.\n`);

  const assetIds = [...new Set(links.map((r) => String(r.asset.id)))];
  console.log(`Unique assets: ${assetIds.length}`);

  // 2. Per-asset details + policy_summary
  const assetRows = await runQuery(
    client,
    `
    SELECT
      asset.id,
      asset.name,
      asset.type,
      asset.final_urls,
      asset.policy_summary.approval_status,
      asset.policy_summary.review_status,
      asset.policy_summary.policy_topic_entries,
      asset.youtube_video_asset.youtube_video_id,
      asset.youtube_video_asset.youtube_video_title,
      asset.image_asset.full_size.url,
      asset.text_asset.text
    FROM asset
    WHERE asset.id IN (${assetIds.join(",")})
    `,
  );

  const byAssetId = new Map<string, Row>();
  for (const r of assetRows) byAssetId.set(String(r.asset.id), r);

  // 3. Group output by campaign → ad → field_type
  const grouped = new Map<string, Map<string, Row[]>>();
  for (const r of links) {
    const cKey = `[${r.campaign.id}] ${r.campaign.name}`;
    const aKey = String(r.adGroupAd.ad.id);
    if (!grouped.has(cKey)) grouped.set(cKey, new Map());
    const camp = grouped.get(cKey)!;
    if (!camp.has(aKey)) camp.set(aKey, []);
    camp.get(aKey)!.push(r);
  }

  // Roll-up counters
  let nApproved = 0,
    nDisapproved = 0,
    nReviewing = 0,
    nLimited = 0,
    nUnknown = 0;
  const disapproveTopics = new Map<string, number>();
  const reviewingByType = new Map<string, number>();

  for (const [cKey, ads] of grouped) {
    console.log(`\n━━━ ${cKey} ━━━`);
    for (const [adId, rows] of ads) {
      console.log(`\n  Ad ${adId} — ${rows.length} asset link(s)`);
      const byField = new Map<string, Row[]>();
      for (const r of rows) {
        const ft = r.adGroupAdAssetView.fieldType ?? "?";
        if (!byField.has(ft)) byField.set(ft, []);
        byField.get(ft)!.push(r);
      }
      for (const [field, frows] of byField) {
        // status histogram for this field
        const fieldStats: Record<string, number> = {};
        const samples: string[] = [];
        for (const r of frows) {
          const a = byAssetId.get(String(r.asset.id))?.asset ?? {};
          const ps = a.policySummary ?? {};
          const status = `${fmt(ps.approvalStatus)}/${fmt(ps.reviewStatus)}`;
          fieldStats[status] = (fieldStats[status] ?? 0) + 1;

          // Counters
          const ap = ps.approvalStatus;
          const rv = ps.reviewStatus;
          if (ap === "APPROVED") nApproved++;
          else if (ap === "DISAPPROVED") nDisapproved++;
          else if (ap === "APPROVED_LIMITED") nLimited++;
          else nUnknown++;
          if (rv === "REVIEW_IN_PROGRESS") {
            nReviewing++;
            reviewingByType.set(field, (reviewingByType.get(field) ?? 0) + 1);
          }
          if (ap === "DISAPPROVED" && ps.policyTopicEntries?.length) {
            for (const t of ps.policyTopicEntries) {
              disapproveTopics.set(t.topic, (disapproveTopics.get(t.topic) ?? 0) + 1);
            }
          }

          // Take 1-2 samples per field for visual confirmation
          if (samples.length < 2) {
            let label = "";
            if (a.type === "TEXT") label = `"${truncate(a.textAsset?.text ?? "", 70)}"`;
            else if (a.type === "IMAGE") label = a.imageAsset?.fullSize?.url ?? a.name ?? "(image)";
            else if (a.type === "YOUTUBE_VIDEO") label = `yt:${a.youtubeVideoAsset?.youtubeVideoId} "${truncate(a.youtubeVideoAsset?.youtubeVideoTitle ?? "", 50)}"`;
            else label = a.name ?? a.type ?? "?";
            samples.push(`asset ${a.id} ${status}  ${label}`);
            if (a.finalUrls?.length) samples[samples.length - 1] += `  finalUrls=${a.finalUrls.join(",")}`;
          }
        }
        const histogram = Object.entries(fieldStats).map(([k, v]) => `${v}×${k}`).join(", ");
        console.log(`    [${field}] ${frows.length} assets — ${histogram}`);
        for (const s of samples) console.log(`       ${s}`);
      }
    }
  }

  // 4. Ad-level final URLs (DG-specific)
  console.log("\n\n=== Ad-level final URLs ===\n");
  const ads = await runQuery(
    client,
    `
    SELECT
      campaign.id,
      ad_group_ad.ad.id,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.tracking_url_template
    FROM ad_group_ad
    WHERE campaign.id IN (${STUCK_IDS.join(",")})
      AND ad_group_ad.status != 'REMOVED'
    `,
  );
  for (const r of ads) {
    const ad = r.adGroupAd.ad;
    console.log(`  [${r.campaign.id}] ad ${ad.id}`);
    console.log(`    finalUrls: ${(ad.finalUrls ?? []).join(", ") || "—"}`);
    console.log(`    trackingTemplate: ${fmt(ad.trackingUrlTemplate)}`);
  }

  // 5. Summary
  console.log("\n\n=== ROLL-UP ===");
  console.log(`Total ad↔asset links: ${links.length}`);
  console.log(`Approval status: APPROVED=${nApproved}  DISAPPROVED=${nDisapproved}  LIMITED=${nLimited}  UNKNOWN/PENDING=${nUnknown}`);
  console.log(`In active review: ${nReviewing}`);
  if (reviewingByType.size > 0) {
    console.log("By field-type still in review:");
    for (const [k, v] of reviewingByType) console.log(`  ${k}: ${v}`);
  }
  if (disapproveTopics.size > 0) {
    console.log("Disapproval topics:");
    for (const [k, v] of disapproveTopics) console.log(`  ${k}: ${v}`);
  }
  console.log("\n=== done ===\n");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
