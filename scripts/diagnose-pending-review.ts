/**
 * Diagnose ads stuck in review.
 *
 * Identifies enabled campaigns with zero impressions in the last 14 days
 * (signal: ads not serving) and dumps per-ad + per-asset policy review state
 * so we can tell why they aren't running.
 *
 * Read-only — no mutations.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

type Row = Record<string, any>;

async function runQuery(client: GoogleAdsClient, gaql: string): Promise<Row[]> {
  const res = (await client.query(gaql)) as Row[];
  // searchStream returns an array of batches; each batch has .results
  return res.flatMap((batch) => batch.results ?? []);
}

function fmt(s: string | undefined): string {
  return s ?? "—";
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

  console.log(`\n=== Account ${process.env.GOOGLE_ADS_CUSTOMER_ID} ===\n`);

  // 1. Account-level signals
  console.log("--- Customer info ---");
  const customer = await runQuery(
    client,
    `SELECT customer.id, customer.descriptive_name, customer.status, customer.test_account, customer.auto_tagging_enabled, customer.pay_per_conversion_eligibility_failure_reasons FROM customer LIMIT 1`,
  );
  console.log(JSON.stringify(customer[0] ?? {}, null, 2));

  // 2. Find suspicious campaigns: ENABLED, recent, zero impressions
  console.log("\n--- Enabled campaigns with 0 impressions in last 14 days ---");
  const stuckCampaigns = await runQuery(
    client,
    `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.serving_status,
      campaign.advertising_channel_type,
      campaign.advertising_channel_sub_type,
      campaign.primary_status,
      campaign.primary_status_reasons,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros
    FROM campaign
    WHERE campaign.status = 'ENABLED'
      AND segments.date DURING LAST_14_DAYS
    `,
  );

  // Aggregate impressions per campaign (segments.date duplicates rows)
  const byCampaign = new Map<string, Row>();
  for (const r of stuckCampaigns) {
    const id = String(r.campaign.id);
    const cur = byCampaign.get(id);
    if (!cur) {
      byCampaign.set(id, { ...r, _impressions: Number(r.metrics?.impressions ?? 0) });
    } else {
      cur._impressions += Number(r.metrics?.impressions ?? 0);
    }
  }

  const stuck = [...byCampaign.values()].filter((r) => r._impressions === 0);
  // Also include enabled campaigns with NO date rows (never served)
  const allEnabled = await runQuery(
    client,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status, campaign.advertising_channel_type, campaign.advertising_channel_sub_type, campaign.primary_status, campaign.primary_status_reasons FROM campaign WHERE campaign.status = 'ENABLED'`,
  );
  for (const r of allEnabled) {
    const id = String(r.campaign.id);
    if (!byCampaign.has(id)) {
      stuck.push({ ...r, _impressions: 0 });
    }
  }

  console.log(`Found ${stuck.length} ENABLED campaign(s) with 0 impressions in last 14 days:\n`);
  for (const r of stuck) {
    const c = r.campaign;
    console.log(`  • [${c.id}] ${c.name}`);
    console.log(`      type=${c.advertisingChannelType}/${c.advertisingChannelSubType ?? "-"}  serving=${fmt(c.servingStatus)}  primary=${fmt(c.primaryStatus)}`);
    if (c.primaryStatusReasons?.length) {
      console.log(`      reasons: ${c.primaryStatusReasons.join(", ")}`);
    }
  }

  if (stuck.length === 0) {
    console.log("\n(no stuck campaigns detected — exiting)");
    return;
  }

  const stuckIds = stuck.map((r) => r.campaign.id);

  // 3. Per-ad policy review status for those campaigns
  console.log("\n\n--- Ad-level review status (ad_group_ad.policy_summary) ---");
  const ads = await runQuery(
    client,
    `
    SELECT
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      ad_group_ad.ad.id,
      ad_group_ad.ad.type,
      ad_group_ad.status,
      ad_group_ad.policy_summary.approval_status,
      ad_group_ad.policy_summary.review_status,
      ad_group_ad.policy_summary.policy_topic_entries
    FROM ad_group_ad
    WHERE campaign.id IN (${stuckIds.join(",")})
      AND ad_group_ad.status != 'REMOVED'
    `,
  );

  for (const r of ads) {
    const ad = r.adGroupAd;
    const ps = ad.policySummary ?? {};
    console.log(`\n  [campaign ${r.campaign.id}] ${r.campaign.name}`);
    console.log(`    ad ${ad.ad.id} (${ad.ad.type}, status=${ad.status})`);
    console.log(`      approval=${fmt(ps.approvalStatus)}  review=${fmt(ps.reviewStatus)}`);
    if (ps.policyTopicEntries?.length) {
      for (const t of ps.policyTopicEntries) {
        console.log(`      topic: ${t.topic} type=${t.type}`);
        if (t.evidences?.length) {
          for (const e of t.evidences) {
            console.log(`         evidence: ${JSON.stringify(e).slice(0, 300)}`);
          }
        }
        if (t.constraints?.length) {
          for (const c of t.constraints) {
            console.log(`         constraint: ${JSON.stringify(c).slice(0, 200)}`);
          }
        }
      }
    }
  }

  // 4. Per-asset review status (PMax / Demand Gen)
  console.log("\n\n--- Asset-level review status (asset_group_asset.policy_summary) ---");
  const assets = await runQuery(
    client,
    `
    SELECT
      campaign.id,
      campaign.name,
      asset_group.id,
      asset_group.name,
      asset_group.status,
      asset_group.primary_status,
      asset_group.primary_status_reasons,
      asset_group_asset.asset,
      asset_group_asset.field_type,
      asset_group_asset.status,
      asset_group_asset.primary_status,
      asset_group_asset.primary_status_reasons,
      asset_group_asset.policy_summary.approval_status,
      asset_group_asset.policy_summary.review_status,
      asset_group_asset.policy_summary.policy_topic_entries
    FROM asset_group_asset
    WHERE campaign.id IN (${stuckIds.join(",")})
      AND asset_group_asset.status != 'REMOVED'
    `,
  );

  if (assets.length === 0) {
    console.log("(no asset-group assets — these are likely Search/Shopping campaigns, not PMax/DG)");
  } else {
    for (const r of assets) {
      const ps = r.assetGroupAsset.policySummary ?? {};
      console.log(`\n  [${r.campaign.id}] ${r.campaign.name} / ag=${r.assetGroup.name} (ag-status=${r.assetGroup.primaryStatus})`);
      console.log(`    field=${r.assetGroupAsset.fieldType}  status=${r.assetGroupAsset.status}/${r.assetGroupAsset.primaryStatus}`);
      console.log(`    approval=${fmt(ps.approvalStatus)}  review=${fmt(ps.reviewStatus)}`);
      if (r.assetGroupAsset.primaryStatusReasons?.length) {
        console.log(`    reasons: ${r.assetGroupAsset.primaryStatusReasons.join(", ")}`);
      }
      if (ps.policyTopicEntries?.length) {
        for (const t of ps.policyTopicEntries) {
          console.log(`    topic: ${t.topic} type=${t.type}`);
        }
      }
    }
  }

  console.log("\n=== done ===\n");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
