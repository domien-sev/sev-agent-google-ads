/**
 * DRY-RUN: report keyword duplication across ENABLED campaigns.
 *
 * Groups keywords by (normalized text + match type) and flags any group
 * where the same keyword lives in 2+ ENABLED campaigns. Per group,
 * shows 30-day performance per campaign so we can decide which to keep.
 *
 * Usage: GH_PKG_TOKEN=... npx tsx --require dotenv/config scripts/report-keyword-cannibalization.ts
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";
import * as fs from "node:fs";

const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
  managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
});

function flat(raw: any): any[] {
  if (Array.isArray(raw)) return raw.flatMap((c: any) => c.results ?? []);
  return raw?.results ?? [];
}

type Row = {
  text: string;
  matchType: string;
  campaign: string;
  campaignId: string;
  adGroup: string;
  criterionResource: string;
  status: string;
  impressions: number;
  clicks: number;
  cost: number;
  conv: number;
  convValue: number;
};

async function main() {
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 30 * 86_400_000).toISOString().split("T")[0];

  const raw = flat(
    await client.query(`
      SELECT campaign.id, campaign.name,
        ad_group.name,
        ad_group_criterion.resource_name,
        ad_group_criterion.status,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        metrics.impressions, metrics.clicks, metrics.cost_micros,
        metrics.conversions, metrics.conversions_value
      FROM keyword_view
      WHERE campaign.status = 'ENABLED'
        AND ad_group.status = 'ENABLED'
        AND ad_group_criterion.status != 'REMOVED'
        AND segments.date BETWEEN '${startDate}' AND '${endDate}'
    `)
  );

  const rows: Row[] = raw.map((r: any) => ({
    text: String(r.adGroupCriterion?.keyword?.text ?? "").toLowerCase().trim(),
    matchType: r.adGroupCriterion?.keyword?.matchType ?? "",
    campaign: r.campaign?.name ?? "",
    campaignId: String(r.campaign?.id ?? ""),
    adGroup: r.adGroup?.name ?? "",
    criterionResource: r.adGroupCriterion?.resourceName ?? "",
    status: r.adGroupCriterion?.status ?? "",
    impressions: Number(r.metrics?.impressions ?? 0),
    clicks: Number(r.metrics?.clicks ?? 0),
    cost: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
    conv: Number(r.metrics?.conversions ?? 0),
    convValue: Number(r.metrics?.conversionsValue ?? 0),
  }));

  // Aggregate across segments — same criterion appears multiple times (one per date).
  const agg = new Map<string, Row>();
  for (const r of rows) {
    const k = `${r.criterionResource}`;
    const prev = agg.get(k);
    if (prev) {
      prev.impressions += r.impressions;
      prev.clicks += r.clicks;
      prev.cost += r.cost;
      prev.conv += r.conv;
      prev.convValue += r.convValue;
    } else {
      agg.set(k, { ...r });
    }
  }

  // Infer language from campaign name: _NL / Dutch → NL, _FR / French → FR, else UNK.
  function lang(name: string): string {
    const n = name.toLowerCase();
    if (/_nl\b|dutch/.test(n)) return "NL";
    if (/_fr\b|french/.test(n)) return "FR";
    return "UNK";
  }

  // Group by (text + matchType + language). Only flag groups with 2+ distinct
  // campaigns targeting the SAME language — language-splits (NL vs FR) are legit.
  const groups = new Map<string, Row[]>();
  for (const r of agg.values()) {
    const key = `${r.text}||${r.matchType}||${lang(r.campaign)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const dupes: { key: string; rows: Row[] }[] = [];
  for (const [key, rs] of groups) {
    const distinctCampaigns = new Set(rs.map((r) => r.campaignId));
    if (distinctCampaigns.size >= 2) dupes.push({ key, rows: rs });
  }

  dupes.sort((a, b) => {
    const totalA = a.rows.reduce((s, r) => s + r.cost, 0);
    const totalB = b.rows.reduce((s, r) => s + r.cost, 0);
    return totalB - totalA;
  });

  console.log(`\n=== Keyword Cannibalization Report ===`);
  console.log(`Window: ${startDate} → ${endDate}`);
  console.log(`Total active kw rows    : ${agg.size}`);
  console.log(`Duplicated (text+match) : ${dupes.length}`);
  console.log(`Sum dup rows            : ${dupes.reduce((s, d) => s + d.rows.length, 0)}\n`);

  console.log("Within-language dup groups (all), by 30d spend:\n");
  for (const d of dupes) {
    const [text, mt, lg] = d.key.split("||");
    const totalCost = d.rows.reduce((s, r) => s + r.cost, 0);
    const totalConv = d.rows.reduce((s, r) => s + r.conv, 0);
    console.log(`"${text}" [${mt}] lang=${lg} — in ${new Set(d.rows.map((r) => r.campaignId)).size} campaigns, €${totalCost.toFixed(2)} / ${totalConv.toFixed(1)} conv`);
    // best per-campaign perf
    const byCampaign = new Map<string, Row & { total: number }>();
    for (const r of d.rows) {
      const prev = byCampaign.get(r.campaignId);
      if (prev) {
        prev.impressions += r.impressions;
        prev.clicks += r.clicks;
        prev.cost += r.cost;
        prev.conv += r.conv;
        prev.convValue += r.convValue;
      } else {
        byCampaign.set(r.campaignId, { ...r, total: 0 });
      }
    }
    const sorted = [...byCampaign.values()].sort((a, b) => {
      // Winner: most conversion value, tiebreak on clicks
      if (b.convValue !== a.convValue) return b.convValue - a.convValue;
      return b.clicks - a.clicks;
    });
    sorted.forEach((r, i) => {
      const marker = i === 0 ? "KEEP " : "PAUSE";
      console.log(`   ${marker}  ${r.campaign} / ${r.adGroup}  impr=${r.impressions} clk=${r.clicks} €${r.cost.toFixed(2)} conv=${r.conv.toFixed(1)} val=€${r.convValue.toFixed(2)}`);
    });
    console.log();
  }

  // Dump full plan to JSON for next-step execution
  const plan = dupes.map((d) => {
    const [text, mt, lg] = d.key.split("||");
    const byCampaign = new Map<string, { campaign: string; campaignId: string; rows: Row[]; cost: number; conv: number; convValue: number; clicks: number }>();
    for (const r of d.rows) {
      const entry = byCampaign.get(r.campaignId) ?? { campaign: r.campaign, campaignId: r.campaignId, rows: [], cost: 0, conv: 0, convValue: 0, clicks: 0 };
      entry.rows.push(r);
      entry.cost += r.cost;
      entry.conv += r.conv;
      entry.convValue += r.convValue;
      entry.clicks += r.clicks;
      byCampaign.set(r.campaignId, entry);
    }
    const sorted = [...byCampaign.values()].sort((a, b) => (b.convValue - a.convValue) || (b.clicks - a.clicks));
    return {
      keyword: text,
      matchType: mt,
      language: lg,
      keep: sorted[0]?.campaign,
      pause: sorted.slice(1).map((c) => ({
        campaign: c.campaign,
        cost: Number(c.cost.toFixed(2)),
        conv: Number(c.conv.toFixed(1)),
        convValue: Number(c.convValue.toFixed(2)),
        criterionResources: c.rows.map((r) => r.criterionResource),
      })),
    };
  });

  fs.writeFileSync("scripts/cannibalization-plan.json", JSON.stringify(plan, null, 2));
  console.log(`\nFull plan written to scripts/cannibalization-plan.json (${plan.length} groups)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
