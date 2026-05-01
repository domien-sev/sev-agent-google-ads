/**
 * Belvoir content-specific optimization rules.
 * Evaluates performance of article campaigns and generates recommendations.
 */

import type { GoogleAdsAgent } from "../agent.js";
import type { RoutedMessage, AgentResponse } from "@domien-sev/shared-types";
import { reply } from "../tools/reply.js";

interface CampaignMetrics {
  id: string;
  name: string;
  status: string;
  type: string;
  cost: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  conversionsValue: number;
  roas: number;
  daysActive: number;
}

interface Recommendation {
  campaignName: string;
  rule: string;
  action: string;
  reason: string;
  severity: "critical" | "warning" | "info";
}

/**
 * Fetch Belvoir campaign metrics with date-range awareness.
 */
async function fetchBelvoirMetrics(agent: GoogleAdsAgent): Promise<CampaignMetrics[]> {
  if (!agent.googleAds) throw new Error("Google Ads client not configured");

  const raw = await agent.googleAds.query(`
    SELECT
      campaign.id, campaign.name, campaign.status,
      campaign.advertising_channel_type,
      campaign.start_date,
      metrics.impressions, metrics.clicks, metrics.ctr,
      metrics.cost_micros, metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.name LIKE 'belvoir_%'
      AND campaign.status = 'ENABLED'
    ORDER BY metrics.cost_micros DESC
  `);

  const rows = Array.isArray(raw) ? raw.flatMap((c: any) => c.results || []) : [];
  const now = Date.now();

  return rows.map((row: any) => {
    const c = row.campaign || {};
    const m = row.metrics || {};
    const cost = Number(m.costMicros || 0) / 1_000_000;
    const conv = Number(m.conversions || 0);
    const convVal = Number(m.conversionsValue || 0);
    const startDate = c.startDate ? new Date(c.startDate.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")) : new Date();
    const daysActive = Math.max(1, Math.floor((now - startDate.getTime()) / 86_400_000));

    return {
      id: c.id,
      name: c.name,
      status: c.status,
      type: c.advertisingChannelType,
      cost,
      impressions: Number(m.impressions || 0),
      clicks: Number(m.clicks || 0),
      ctr: Number(m.ctr || 0),
      conversions: conv,
      conversionsValue: convVal,
      roas: cost > 0 ? convVal / cost : 0,
      daysActive,
    };
  });
}

/**
 * Evaluate content-specific optimization rules.
 */
function evaluateRules(campaigns: CampaignMetrics[]): Recommendation[] {
  const recommendations: Recommendation[] = [];

  for (const c of campaigns) {
    // Rule 1: Low engagement — CTR < 0.5% after 3 days, spend > €10
    if (c.daysActive >= 3 && c.ctr < 0.005 && c.cost > 10) {
      recommendations.push({
        campaignName: c.name,
        rule: "low-engagement",
        action: "pause",
        reason: `CTR ${(c.ctr * 100).toFixed(2)}% after ${c.daysActive}d with €${c.cost.toFixed(2)} spent`,
        severity: "critical",
      });
    }

    // Rule 2: High performer — ROAS > 3x after 7 days
    if (c.daysActive >= 7 && c.roas > 3 && c.conversions >= 2) {
      recommendations.push({
        campaignName: c.name,
        rule: "high-performer",
        action: "scale budget +25%",
        reason: `ROAS ${c.roas.toFixed(2)}x with ${c.conversions.toFixed(1)} conversions over ${c.daysActive}d`,
        severity: "info",
      });
    }

    // Rule 3: Zero conversions after significant spend
    if (c.daysActive >= 5 && c.cost > 30 && c.conversions === 0) {
      recommendations.push({
        campaignName: c.name,
        rule: "zero-conversions",
        action: "pause",
        reason: `€${c.cost.toFixed(2)} spent over ${c.daysActive}d with zero conversions`,
        severity: "critical",
      });
    }

    // Rule 4: Unprofitable — ROAS < 0.5x after 7 days with meaningful spend
    if (c.daysActive >= 7 && c.cost > 20 && c.roas > 0 && c.roas < 0.5) {
      recommendations.push({
        campaignName: c.name,
        rule: "unprofitable",
        action: "reduce budget -30%",
        reason: `ROAS ${c.roas.toFixed(2)}x — spending more than earning`,
        severity: "warning",
      });
    }

    // Rule 5: Good CTR but no conversions — potential landing page issue
    if (c.daysActive >= 5 && c.ctr > 0.02 && c.clicks > 50 && c.conversions === 0) {
      recommendations.push({
        campaignName: c.name,
        rule: "high-ctr-no-conv",
        action: "review landing page + conversion tracking",
        reason: `CTR ${(c.ctr * 100).toFixed(2)}% with ${c.clicks} clicks but 0 conversions`,
        severity: "warning",
      });
    }
  }

  // Rule 6: Language rebalance — compare NL vs FR pairs
  const pairs = new Map<string, { nl?: CampaignMetrics; fr?: CampaignMetrics }>();
  for (const c of campaigns) {
    const base = c.name.replace(/_(?:NL|FR)$/, "");
    const lang = c.name.endsWith("_NL") ? "nl" : c.name.endsWith("_FR") ? "fr" : null;
    if (!lang) continue;
    const pair = pairs.get(base) || {};
    pair[lang] = c;
    pairs.set(base, pair);
  }

  for (const [base, pair] of pairs) {
    if (!pair.nl || !pair.fr) continue;
    if (pair.nl.cost < 10 || pair.fr.cost < 10) continue; // Not enough data

    if (pair.nl.roas > 0 && pair.fr.roas > 0) {
      const ratio = pair.nl.roas / pair.fr.roas;
      if (ratio > 2) {
        recommendations.push({
          campaignName: `${base}_FR`,
          rule: "language-rebalance",
          action: "shift 20% budget from FR to NL",
          reason: `NL ROAS ${pair.nl.roas.toFixed(2)}x vs FR ROAS ${pair.fr.roas.toFixed(2)}x (${ratio.toFixed(1)}x difference)`,
          severity: "info",
        });
      } else if (1 / ratio > 2) {
        recommendations.push({
          campaignName: `${base}_NL`,
          rule: "language-rebalance",
          action: "shift 20% budget from NL to FR",
          reason: `FR ROAS ${pair.fr.roas.toFixed(2)}x vs NL ROAS ${pair.nl.roas.toFixed(2)}x (${(1 / ratio).toFixed(1)}x difference)`,
          severity: "info",
        });
      }
    }
  }

  return recommendations;
}

/**
 * Handle `belvoir optimize` command.
 */
export async function handleBelvoirOptimize(
  agent: GoogleAdsAgent,
  message: RoutedMessage,
): Promise<AgentResponse> {
  try {
    const metrics = await fetchBelvoirMetrics(agent);

    if (metrics.length === 0) {
      return reply(message, "*Belvoir Optimization*\n\nNo active Belvoir campaigns found.");
    }

    const recommendations = evaluateRules(metrics);

    const lines = [
      "*Belvoir Content Optimization*",
      `Analyzed ${metrics.length} active campaigns`,
      "",
    ];

    if (recommendations.length === 0) {
      lines.push("✅ All campaigns performing within acceptable ranges. No actions needed.");
    } else {
      const critical = recommendations.filter((r) => r.severity === "critical");
      const warnings = recommendations.filter((r) => r.severity === "warning");
      const info = recommendations.filter((r) => r.severity === "info");

      if (critical.length > 0) {
        lines.push(`*🔴 Critical (${critical.length}):*`);
        for (const r of critical) {
          lines.push(`  • \`${r.campaignName}\` — ${r.action}: ${r.reason}`);
        }
        lines.push("");
      }
      if (warnings.length > 0) {
        lines.push(`*🟡 Warnings (${warnings.length}):*`);
        for (const r of warnings) {
          lines.push(`  • \`${r.campaignName}\` �� ${r.action}: ${r.reason}`);
        }
        lines.push("");
      }
      if (info.length > 0) {
        lines.push(`*ℹ️ Opportunities (${info.length}):*`);
        for (const r of info) {
          lines.push(`  • \`${r.campaignName}\` — ${r.action}: ${r.reason}`);
        }
      }
    }

    return reply(message, lines.join("\n"));
  } catch (err) {
    return reply(message, `Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
