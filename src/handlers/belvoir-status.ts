/**
 * Belvoir pipeline status and ROI reporting handler.
 * Shows active article campaigns, spend, revenue, and per-article ROI.
 */

import type { GoogleAdsAgent } from "../agent.js";
import type { RoutedMessage, AgentResponse } from "@domien-sev/shared-types";
import { reply } from "../tools/reply.js";

/**
 * Query Google Ads for all Belvoir campaigns and compute performance.
 */
async function getBelvoirCampaignStats(agent: GoogleAdsAgent): Promise<{
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    type: string;
    cost: number;
    impressions: number;
    clicks: number;
    conversions: number;
    conversionsValue: number;
    ctr: number;
    roas: number;
  }>;
  totals: {
    campaignCount: number;
    enabledCount: number;
    totalCost: number;
    totalConversions: number;
    totalConversionsValue: number;
    overallRoas: number;
  };
}> {
  if (!agent.googleAds) throw new Error("Google Ads client not configured");

  const raw = await agent.googleAds.query(`
    SELECT
      campaign.id, campaign.name, campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions, metrics.clicks, metrics.ctr,
      metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.name LIKE 'belvoir_%'
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `);

  const rows = Array.isArray(raw) ? raw.flatMap((c: any) => c.results || []) : [];

  let totalCost = 0;
  let totalConversions = 0;
  let totalConversionsValue = 0;
  let enabledCount = 0;

  const campaigns = rows.map((row: any) => {
    const c = row.campaign || {};
    const m = row.metrics || {};
    const cost = Number(m.costMicros || 0) / 1_000_000;
    const conv = Number(m.conversions || 0);
    const convVal = Number(m.conversionsValue || 0);
    const impressions = Number(m.impressions || 0);
    const clicks = Number(m.clicks || 0);
    const ctr = Number(m.ctr || 0);
    const roas = cost > 0 ? convVal / cost : 0;

    totalCost += cost;
    totalConversions += conv;
    totalConversionsValue += convVal;
    if (c.status === "ENABLED") enabledCount++;

    return {
      id: c.id,
      name: c.name,
      status: c.status,
      type: c.advertisingChannelType,
      cost,
      impressions,
      clicks,
      conversions: conv,
      conversionsValue: convVal,
      ctr,
      roas,
    };
  });

  return {
    campaigns,
    totals: {
      campaignCount: campaigns.length,
      enabledCount,
      totalCost,
      totalConversions,
      totalConversionsValue,
      overallRoas: totalCost > 0 ? totalConversionsValue / totalCost : 0,
    },
  };
}

/**
 * Group campaigns by article (based on slug in campaign name).
 */
function groupByArticle(campaigns: Array<{ name: string; cost: number; conversions: number; conversionsValue: number; status: string }>): Map<string, {
  slug: string;
  campaigns: number;
  enabled: number;
  totalCost: number;
  totalConversions: number;
  totalValue: number;
  roi: number;
}> {
  const groups = new Map<string, {
    slug: string;
    campaigns: number;
    enabled: number;
    totalCost: number;
    totalConversions: number;
    totalValue: number;
    roi: number;
  }>();

  for (const c of campaigns) {
    // Extract slug: belvoir_YYMMDD_<slug>_<type>_<LANG>
    const parts = c.name.split("_");
    const slug = parts.length >= 3 ? parts.slice(2, -2).join("_") : c.name;

    const existing = groups.get(slug) || {
      slug,
      campaigns: 0,
      enabled: 0,
      totalCost: 0,
      totalConversions: 0,
      totalValue: 0,
      roi: 0,
    };

    existing.campaigns++;
    if (c.status === "ENABLED") existing.enabled++;
    existing.totalCost += c.cost;
    existing.totalConversions += c.conversions;
    existing.totalValue += c.conversionsValue;
    existing.roi = existing.totalCost > 0 ? existing.totalValue / existing.totalCost : 0;

    groups.set(slug, existing);
  }

  return groups;
}

/**
 * Handle `belvoir status` command — show pipeline overview.
 */
export async function handleBelvoirStatus(
  agent: GoogleAdsAgent,
  message: RoutedMessage,
): Promise<AgentResponse> {
  try {
    const stats = await getBelvoirCampaignStats(agent);

    if (stats.campaigns.length === 0) {
      return reply(message, "*Belvoir Pipeline Status*\n\nNo Belvoir campaigns found. Use `belvoir article <url> --execute` to create your first campaigns.");
    }

    const articleGroups = groupByArticle(stats.campaigns);

    const lines = [
      "*Belvoir Pipeline Status (Last 30 days)*",
      "",
      `Campaigns: ${stats.totals.campaignCount} total (${stats.totals.enabledCount} active)`,
      `Total spend: €${stats.totals.totalCost.toFixed(2)}`,
      `Conversions: ${stats.totals.totalConversions.toFixed(1)} | Value: €${stats.totals.totalConversionsValue.toFixed(2)}`,
      `Overall ROAS: ${stats.totals.overallRoas.toFixed(2)}x`,
      "",
      "*Per Article:*",
    ];

    for (const [slug, group] of articleGroups) {
      const status = group.enabled > 0 ? "🟢" : "⏸";
      lines.push(
        `${status} \`${slug}\` — ${group.campaigns} campaigns (${group.enabled} active) | €${group.totalCost.toFixed(2)} spent | ${group.totalConversions.toFixed(1)} conv | ROAS ${group.roi.toFixed(2)}x`
      );
    }

    return reply(message, lines.join("\n"));
  } catch (err) {
    return reply(message, `Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
