/**
 * Quick audit: pull all campaigns + conversion actions to diagnose
 * profitability issues and conversion value gaps.
 *
 * Usage: GH_PKG_TOKEN=... npx tsx --require dotenv/config scripts/audit-profitability.ts
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
  managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
});

/** searchStream returns [{results: [...]}] — flatten to row array */
function flattenResults(raw: any): any[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((chunk: any) => chunk.results ?? []);
  }
  if (raw?.results) return raw.results;
  return [];
}

async function main() {
  // First, dump one row raw to understand structure
  const rawTest = await client.query(`
    SELECT campaign.id, campaign.name, metrics.cost_micros
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 1
  `);
  console.log("RAW RESPONSE SAMPLE:");
  console.log(JSON.stringify(rawTest, null, 2).slice(0, 1500));
  console.log("\n---\n");

  const rows = flattenResults(rawTest);
  if (rows.length > 0) {
    console.log("FIRST ROW STRUCTURE:");
    console.log(JSON.stringify(rows[0], null, 2));
    console.log("\n---\n");
  }

  // Now pull full campaign data
  console.log("=== CAMPAIGN PERFORMANCE (Last 30 days) ===\n");

  const rawCampaigns = await client.query(`
    SELECT
      campaign.id, campaign.name, campaign.status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      campaign_budget.amount_micros,
      metrics.impressions, metrics.clicks, metrics.ctr,
      metrics.cost_micros, metrics.conversions, metrics.conversions_value,
      metrics.all_conversions, metrics.all_conversions_value,
      metrics.average_cpc, metrics.cost_per_conversion
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
      AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
  `);

  const campaigns = flattenResults(rawCampaigns);
  const issues: string[] = [];
  let totalCost = 0, totalConv = 0, totalConvValue = 0, totalAllConv = 0, totalAllConvValue = 0;

  for (const row of campaigns) {
    // Handle both camelCase and snake_case
    const c = row.campaign ?? {};
    const m = row.metrics ?? {};
    const b = row.campaignBudget ?? row.campaign_budget ?? {};

    const costMicros = Number(m.costMicros ?? m.cost_micros ?? 0);
    const cost = costMicros / 1_000_000;
    const conv = Number(m.conversions ?? 0);
    const convVal = Number(m.conversionsValue ?? m.conversions_value ?? 0);
    const allConv = Number(m.allConversions ?? m.all_conversions ?? 0);
    const allConvVal = Number(m.allConversionsValue ?? m.all_conversions_value ?? 0);
    const budgetMicros = Number(b.amountMicros ?? b.amount_micros ?? 0);
    const budgetDay = budgetMicros / 1_000_000;
    const impressions = Number(m.impressions ?? 0);
    const clicks = Number(m.clicks ?? 0);
    const status = c.status ?? "?";
    const name = c.name ?? "?";
    const id = c.id ?? "?";
    const channelType = c.advertisingChannelType ?? c.advertising_channel_type ?? "?";
    const biddingType = c.biddingStrategyType ?? c.bidding_strategy_type ?? "?";
    const roas = cost > 0 ? (convVal / cost).toFixed(2) : "N/A";
    const cpa = conv > 0 ? (cost / conv).toFixed(2) : "N/A";

    totalCost += cost;
    totalConv += conv;
    totalConvValue += convVal;
    totalAllConv += allConv;
    totalAllConvValue += allConvVal;

    console.log(
      `${id} | ${name} | ${status} | ${channelType} | ${biddingType} | €${budgetDay.toFixed(2)}/d | ${impressions} imp | ${clicks} clk | €${cost.toFixed(2)} | ${conv} conv | €${convVal.toFixed(2)} val | ${allConv} allConv | €${allConvVal.toFixed(2)} allVal | ROAS ${roas} | CPA ${cpa}`
    );

    if (status === "ENABLED" || status === "2") {
      if (cost > 20 && conv === 0) {
        issues.push(`WASTE: ${name}: €${cost.toFixed(2)} spent, 0 conversions`);
      }
      if (conv > 0 && convVal === 0) {
        issues.push(`NO VALUE: ${name}: ${conv} conversions but €0 conversion value`);
      }
      if (conv > 0 && convVal > 0 && convVal / cost < 1) {
        issues.push(`UNPROFITABLE: ${name}: ROAS ${roas}x (cost €${cost.toFixed(2)}, value €${convVal.toFixed(2)})`);
      }
      if (allConv > conv + 0.5) {
        issues.push(`NON-PRIMARY: ${name}: ${allConv.toFixed(1)} all_conversions vs ${conv.toFixed(1)} primary — ${(allConv - conv).toFixed(1)} non-primary`);
      }
      if (allConvVal > 0 && convVal === 0) {
        issues.push(`VALUE GAP: ${name}: all_conversions_value €${allConvVal.toFixed(2)} but primary conversions_value €0`);
      }
    }
  }

  console.log("\n" + "-".repeat(80));
  console.log(
    `TOTALS: Cost €${totalCost.toFixed(2)} | Conv ${totalConv.toFixed(1)} | ConvVal €${totalConvValue.toFixed(2)} | AllConv ${totalAllConv.toFixed(1)} | AllConvVal €${totalAllConvValue.toFixed(2)} | ROAS ${totalCost > 0 ? (totalConvValue / totalCost).toFixed(2) : "N/A"}x`
  );

  // === CONVERSION ACTIONS ===
  console.log("\n=== CONVERSION ACTIONS ===\n");

  const rawConvActions = await client.query(`
    SELECT
      conversion_action.id,
      conversion_action.name,
      conversion_action.type,
      conversion_action.status,
      conversion_action.category,
      conversion_action.value_settings.default_value,
      conversion_action.value_settings.always_use_default_value,
      conversion_action.primary_for_goal,
      metrics.all_conversions,
      metrics.all_conversions_value,
      metrics.conversions,
      metrics.conversions_value
    FROM conversion_action
    WHERE conversion_action.status = 'ENABLED'
    ORDER BY metrics.all_conversions DESC
  `);

  const convActions = flattenResults(rawConvActions);

  console.log("ID | Name | Type | Category | Primary | DefaultVal | AlwaysDefault | Conv | ConvVal | AllConv | AllConvVal");
  console.log("-".repeat(140));

  for (const row of convActions) {
    const ca = row.conversionAction ?? row.conversion_action ?? {};
    const m = row.metrics ?? {};
    const vs = ca.valueSettings ?? ca.value_settings ?? {};
    const defaultVal = Number(vs.defaultValue ?? vs.default_value ?? 0);
    const alwaysDefault = vs.alwaysUseDefaultValue ?? vs.always_use_default_value ?? false;

    console.log(
      `${ca.id} | ${ca.name} | ${ca.type} | ${ca.category} | ${ca.primaryForGoal ?? ca.primary_for_goal ?? "?"} | €${defaultVal} | ${alwaysDefault} | ${Number(m.conversions ?? 0).toFixed(1)} | €${Number(m.conversionsValue ?? m.conversions_value ?? 0).toFixed(2)} | ${Number(m.allConversions ?? m.all_conversions ?? 0).toFixed(1)} | €${Number(m.allConversionsValue ?? m.all_conversions_value ?? 0).toFixed(2)}`
    );
  }

  // === ISSUES ===
  if (issues.length > 0) {
    console.log("\n=== ISSUES FOUND ===\n");
    for (const issue of issues) {
      console.log(issue);
    }
  }

  // === CONVERSION VALUE DIAGNOSIS ===
  console.log("\n=== CONVERSION VALUE DIAGNOSIS ===\n");

  const noValueActions = convActions.filter((row: any) => {
    const m = row.metrics ?? {};
    return Number(m.conversions ?? 0) > 0 && Number(m.conversionsValue ?? m.conversions_value ?? 0) === 0;
  });

  if (noValueActions.length > 0) {
    console.log("CONVERSION ACTIONS WITH CONVERSIONS BUT NO VALUE:");
    for (const row of noValueActions) {
      const ca = row.conversionAction ?? row.conversion_action ?? {};
      const m = row.metrics ?? {};
      const vs = ca.valueSettings ?? ca.value_settings ?? {};
      console.log(`  "${ca.name}" (${ca.type}, ${ca.category}): ${Number(m.conversions ?? 0).toFixed(1)} conv, €0 value — default: €${vs.defaultValue ?? vs.default_value ?? 0}, always_default: ${vs.alwaysUseDefaultValue ?? vs.always_use_default_value ?? false}`);
    }
    console.log("\nFIX: Set default_value on these conversion actions, or pass dynamic values via conversion tracking tag/API.");
  } else {
    console.log("All conversion actions with conversions have value assigned.");
  }
}

main().catch(console.error);
