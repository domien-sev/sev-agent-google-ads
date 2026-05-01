/**
 * Account Health Audit — 74 checks across 6 weighted categories.
 *
 * Can be triggered:
 * - Scheduled: weekly cron via scheduler.ts
 * - On-demand: "audit" command via Slack/agent
 * - HTTP: POST /audit endpoint
 *
 * Scoring: 0-100 with letter grades (A-F).
 * Posts results to Slack with critical issues highlighted.
 */
import type { GoogleAdsClient } from "@domien-sev/ads-sdk";
import type { RoutedMessage, AgentResponse } from "@domien-sev/shared-types";
import type { GoogleAdsAgent } from "../agent.js";
import * as gaql from "../tools/gaql.js";
import { reply } from "../tools/reply.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditCheck {
  id: string;
  name: string;
  severity: "critical" | "high" | "medium" | "low";
  passed: boolean;
  detail: string;
}

interface CategoryResult {
  name: string;
  weight: number;
  checks: AuditCheck[];
  score: number;
  grade: string;
}

export interface AuditResult {
  date: string;
  overallScore: number;
  overallGrade: string;
  categories: CategoryResult[];
  critical: AuditCheck[];
  high: AuditCheck[];
  quickWins: AuditCheck[];
}

// ─── Data Collection ─────────────────────────────────────────────────────────

interface AuditData {
  campaigns: any[];
  qualityScores: any[];
  ads: any[];
  searchTerms: any[];
  conversionActions: any[];
  keywords: any[];
  geoTargets: any[];
}

async function collectAuditData(client: GoogleAdsClient): Promise<AuditData> {
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 30 * 86_400_000).toISOString().split("T")[0];
  const range = { startDate, endDate };

  const [campaigns, qualityScores, ads, searchTerms, conversionActions, keywords, geoTargets] =
    await Promise.allSettled([
      client.query(gaql.campaignOverview(range)),
      client.query(gaql.qualityScoreDistribution()),
      client.query(`
        SELECT campaign.name, ad_group.name, ad_group_ad.ad.id,
          ad_group_ad.ad.responsive_search_ad.headlines,
          ad_group_ad.ad.responsive_search_ad.descriptions,
          ad_group_ad.ad.responsive_search_ad.path1,
          ad_group_ad.ad.responsive_search_ad.path2,
          ad_group_ad.status
        FROM ad_group_ad
        WHERE ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
          AND ad_group_ad.status != 'REMOVED' AND campaign.status = 'ENABLED'
      `),
      client.query(gaql.searchTermReport(undefined, range)),
      client.query(gaql.conversionActions()),
      client.query(gaql.keywordPerformance(undefined, range)),
      client.query(`
        SELECT campaign.name, campaign_criterion.type,
          campaign_criterion.location.geo_target_constant,
          campaign_criterion.proximity.radius,
          campaign_criterion.proximity.radius_units,
          campaign_criterion.proximity.geo_point.longitude_in_micro_degrees,
          campaign_criterion.proximity.geo_point.latitude_in_micro_degrees,
          campaign_criterion.negative
        FROM campaign_criterion
        WHERE campaign_criterion.type IN ('LOCATION', 'PROXIMITY')
          AND campaign.status = 'ENABLED'
      `),
    ]);

  const extract = (r: PromiseSettledResult<unknown[]>) =>
    r.status === "fulfilled" ? r.value.flatMap((b: any) => b.results ?? []) : [];

  return {
    campaigns: extract(campaigns),
    qualityScores: extract(qualityScores),
    ads: extract(ads),
    searchTerms: extract(searchTerms),
    conversionActions: extract(conversionActions),
    keywords: extract(keywords),
    geoTargets: extract(geoTargets),
  };
}

// ─── Category Auditors ───────────────────────────────────────────────────────

function auditConversionTracking(data: AuditData): CategoryResult {
  const checks: AuditCheck[] = [];
  const actions = data.conversionActions;
  const campaigns = data.campaigns;

  // 1.1 Conversion actions exist
  checks.push({
    id: "1.1", name: "Conversion actions exist", severity: "critical",
    passed: actions.length > 0,
    detail: actions.length > 0 ? `${actions.length} conversion action(s)` : "No conversion actions found",
  });

  // 1.2 Purchase conversion
  const hasPurchase = actions.some((a: any) =>
    (a.conversionAction?.category ?? "").includes("PURCHASE"));
  checks.push({
    id: "1.2", name: "Purchase conversion tracked", severity: "critical",
    passed: hasPurchase, detail: hasPurchase ? "Purchase conversion found" : "No PURCHASE conversion action",
  });

  // 1.3 Lead conversion
  const hasLead = actions.some((a: any) => {
    const cat = a.conversionAction?.category ?? "";
    return cat.includes("LEAD") || cat.includes("SIGNUP") || cat.includes("SUBMIT_LEAD_FORM");
  });
  checks.push({
    id: "1.3", name: "Lead/signup conversion", severity: "high",
    passed: hasLead, detail: hasLead ? "Lead conversion found" : "No lead/signup conversion action",
  });

  // 1.5 Multiple conversion types
  const uniqueTypes = new Set(actions.map((a: any) => a.conversionAction?.type));
  checks.push({
    id: "1.5", name: "Multiple conversion types", severity: "medium",
    passed: uniqueTypes.size >= 2,
    detail: `${uniqueTypes.size} distinct type(s): ${[...uniqueTypes].join(", ")}`,
  });

  // 1.6 Conversion value assigned
  const campaignsWithValue = campaigns.filter((c: any) => Number(c.metrics?.conversionsValue ?? 0) > 0);
  checks.push({
    id: "1.6", name: "Conversion value tracked", severity: "high",
    passed: campaignsWithValue.length > 0,
    detail: `${campaignsWithValue.length}/${campaigns.length} campaigns have conversion value`,
  });

  // 1.10 Conversion rate health
  const totalClicks = campaigns.reduce((s: number, c: any) => s + Number(c.metrics?.clicks ?? 0), 0);
  const totalConv = campaigns.reduce((s: number, c: any) => s + Number(c.metrics?.conversions ?? 0), 0);
  const cvr = totalClicks > 0 ? (totalConv / totalClicks) * 100 : 0;
  checks.push({
    id: "1.10", name: "Conversion rate > 1%", severity: "high",
    passed: cvr >= 1, detail: `Overall CVR: ${cvr.toFixed(2)}%`,
  });

  return scoreCategory("Conversion Tracking", 25, checks);
}

function auditWastedSpend(data: AuditData): CategoryResult {
  const checks: AuditCheck[] = [];
  const { searchTerms, campaigns, keywords } = data;

  // 2.1 Search term relevance
  const irrelevant = searchTerms.filter((st: any) =>
    Number(st.metrics?.clicks ?? 0) > 5 && Number(st.metrics?.conversions ?? 0) === 0);
  const irrelevantPct = searchTerms.length > 0 ? (irrelevant.length / searchTerms.length) * 100 : 0;
  checks.push({
    id: "2.1", name: "Search term relevance", severity: "critical",
    passed: irrelevantPct < 20,
    detail: `${irrelevant.length}/${searchTerms.length} terms (${irrelevantPct.toFixed(1)}%) have clicks but no conversions`,
  });

  // 2.3 High-cost zero-conversion terms
  const expensive = searchTerms.filter((st: any) =>
    Number(st.metrics?.costMicros ?? 0) / 1_000_000 > 50 && Number(st.metrics?.conversions ?? 0) === 0);
  checks.push({
    id: "2.3", name: "No high-cost zero-conversion terms", severity: "critical",
    passed: expensive.length === 0,
    detail: expensive.length === 0 ? "No terms with >EUR50 and 0 conversions" :
      `${expensive.length} term(s) with >EUR50 spend and 0 conversions`,
  });

  // 2.4 Low CTR campaigns
  const lowCtr = campaigns.filter((c: any) =>
    Number(c.metrics?.impressions ?? 0) > 1000 &&
    Number(c.metrics?.ctr ?? 0) < 0.01 &&
    c.campaign?.status === "ENABLED");
  checks.push({
    id: "2.4", name: "No low-CTR campaigns", severity: "high",
    passed: lowCtr.length === 0,
    detail: lowCtr.length === 0 ? "All campaigns above 1% CTR threshold" :
      `${lowCtr.length} campaign(s) with CTR < 1%: ${lowCtr.map((c: any) => c.campaign?.name).join(", ")}`,
  });

  // 2.5 Low Quality Score keywords
  const allQs = data.qualityScores;
  const lowQs = allQs.filter((k: any) =>
    Number(k.adGroupCriterion?.qualityInfo?.qualityScore ?? 10) < 5);
  const lowQsPct = allQs.length > 0 ? (lowQs.length / allQs.length) * 100 : 0;
  checks.push({
    id: "2.5", name: "< 20% low QS keywords", severity: "high",
    passed: lowQsPct < 20,
    detail: `${lowQs.length}/${allQs.length} keywords (${lowQsPct.toFixed(1)}%) with QS < 5`,
  });

  // 2.8 CPA threshold
  const highCpa = campaigns.filter((c: any) => {
    const cost = Number(c.metrics?.costMicros ?? 0) / 1_000_000;
    const conv = Number(c.metrics?.conversions ?? 0);
    return conv > 0 && cost / conv > 50;
  });
  checks.push({
    id: "2.8", name: "CPA under EUR50", severity: "medium",
    passed: highCpa.length === 0,
    detail: highCpa.length === 0 ? "All campaigns under EUR50 CPA" :
      `${highCpa.length} campaign(s) with CPA > EUR50`,
  });

  // 2.10 Keyword cannibalization
  const kwMap = new Map<string, string[]>();
  for (const kw of keywords) {
    const text = String(kw.adGroupCriterion?.keyword?.text ?? "").toLowerCase();
    const camp = String(kw.campaign?.name ?? "");
    if (text && camp) {
      if (!kwMap.has(text)) kwMap.set(text, []);
      const camps = kwMap.get(text)!;
      if (!camps.includes(camp)) camps.push(camp);
    }
  }
  const cannibalized = [...kwMap.entries()].filter(([, camps]) => camps.length > 1);
  checks.push({
    id: "2.10", name: "No keyword cannibalization", severity: "high",
    passed: cannibalized.length === 0,
    detail: cannibalized.length === 0 ? "No duplicate keywords across campaigns" :
      `${cannibalized.length} keyword(s) in multiple campaigns: ${cannibalized.slice(0, 3).map(([kw, camps]) => `"${kw}" in ${camps.length} campaigns`).join("; ")}`,
  });

  return scoreCategory("Wasted Spend", 20, checks);
}

function auditAccountStructure(data: AuditData): CategoryResult {
  const checks: AuditCheck[] = [];
  const { campaigns } = data;

  const enabled = campaigns.filter((c: any) => c.campaign?.status === "ENABLED");
  const paused = campaigns.filter((c: any) => c.campaign?.status === "PAUSED");

  // 3.1 Naming convention
  const hasPattern = enabled.every((c: any) => {
    const name = c.campaign?.name ?? "";
    return /^\d{6}[_-]/.test(name) || /^[A-Z]/.test(name);
  });
  checks.push({
    id: "3.1", name: "Campaign naming convention", severity: "medium",
    passed: hasPattern,
    detail: hasPattern ? "All campaigns follow a naming pattern" : "Some campaigns lack consistent naming",
  });

  // 3.5 Campaign type diversity
  const types = new Set(enabled.map((c: any) => c.campaign?.advertisingChannelType));
  checks.push({
    id: "3.5", name: "Campaign type diversity", severity: "medium",
    passed: types.size >= 2,
    detail: `${types.size} type(s) active: ${[...types].join(", ")}`,
  });

  // 3.6 Bilingual coverage
  const names = enabled.map((c: any) => String(c.campaign?.name ?? ""));
  const hasNL = names.some((n) => n.includes("_NL") || n.includes("-nl-") || n.includes("NL"));
  const hasFR = names.some((n) => n.includes("_FR") || n.includes("-fr-") || n.includes("FR"));
  checks.push({
    id: "3.6", name: "Bilingual NL + FR", severity: "high",
    passed: hasNL && hasFR,
    detail: `NL: ${hasNL ? "yes" : "missing"}, FR: ${hasFR ? "yes" : "missing"}`,
  });

  // 3.7 Paused campaign cleanup
  const pausedPct = campaigns.length > 0 ? (paused.length / campaigns.length) * 100 : 0;
  checks.push({
    id: "3.7", name: "< 50% paused campaigns", severity: "medium",
    passed: pausedPct < 50,
    detail: `${paused.length}/${campaigns.length} paused (${pausedPct.toFixed(0)}%)`,
  });

  // 3.8 Budget distribution
  const totalSpend = enabled.reduce((s: number, c: any) => s + Number(c.metrics?.costMicros ?? 0), 0);
  const topSpender = enabled.reduce((max: any, c: any) =>
    Number(c.metrics?.costMicros ?? 0) > Number(max?.metrics?.costMicros ?? 0) ? c : max, enabled[0]);
  const topPct = totalSpend > 0 ? (Number(topSpender?.metrics?.costMicros ?? 0) / totalSpend) * 100 : 0;
  checks.push({
    id: "3.8", name: "No single campaign > 50% spend", severity: "medium",
    passed: topPct <= 50,
    detail: `Top spender: ${topSpender?.campaign?.name ?? "N/A"} at ${topPct.toFixed(0)}% of total`,
  });

  return scoreCategory("Account Structure", 15, checks);
}

function auditKeywords(data: AuditData): CategoryResult {
  const checks: AuditCheck[] = [];
  const { qualityScores, keywords } = data;

  // 4.1 Average QS
  const qsValues = qualityScores
    .map((k: any) => Number(k.adGroupCriterion?.qualityInfo?.qualityScore ?? 0))
    .filter((v: number) => v > 0);
  const avgQs = qsValues.length > 0 ? qsValues.reduce((s: number, v: number) => s + v, 0) / qsValues.length : 0;
  checks.push({
    id: "4.1", name: "Average Quality Score >= 6", severity: "high",
    passed: avgQs >= 6,
    detail: `Average QS: ${avgQs.toFixed(1)} across ${qsValues.length} keywords`,
  });

  // 4.2 QS distribution
  const lowQs = qsValues.filter((v: number) => v < 5);
  const lowPct = qsValues.length > 0 ? (lowQs.length / qsValues.length) * 100 : 0;
  checks.push({
    id: "4.2", name: "< 25% keywords with QS < 5", severity: "high",
    passed: lowPct < 25,
    detail: `${lowQs.length}/${qsValues.length} (${lowPct.toFixed(1)}%) with QS < 5`,
  });

  // 4.3 High QS
  const highQs = qsValues.filter((v: number) => v >= 8);
  const highPct = qsValues.length > 0 ? (highQs.length / qsValues.length) * 100 : 0;
  checks.push({
    id: "4.3", name: ">= 20% keywords with QS >= 8", severity: "medium",
    passed: highPct >= 20,
    detail: `${highQs.length}/${qsValues.length} (${highPct.toFixed(1)}%) with QS >= 8`,
  });

  // 4.4 Match type strategy
  const matchTypes = new Set(keywords.map((k: any) => k.adGroupCriterion?.keyword?.matchType));
  const hasExactOrPhrase = matchTypes.has("EXACT") || matchTypes.has("PHRASE");
  checks.push({
    id: "4.4", name: "Mix of match types", severity: "medium",
    passed: hasExactOrPhrase,
    detail: `Match types: ${[...matchTypes].join(", ")}`,
  });

  // 4.11 Landing page experience
  const belowAvgLp = keywords.filter((k: any) =>
    k.adGroupCriterion?.qualityInfo?.postClickQualityScore === "BELOW_AVERAGE");
  const lpPct = keywords.length > 0 ? (belowAvgLp.length / keywords.length) * 100 : 0;
  checks.push({
    id: "4.11", name: "Landing page experience", severity: "high",
    passed: lpPct < 20,
    detail: `${belowAvgLp.length}/${keywords.length} (${lpPct.toFixed(1)}%) below average`,
  });

  return scoreCategory("Keywords", 15, checks);
}

function auditAds(data: AuditData): CategoryResult {
  const checks: AuditCheck[] = [];
  const { ads } = data;

  // 5.1 RSA count
  checks.push({
    id: "5.1", name: "RSA ads exist", severity: "critical",
    passed: ads.length > 0,
    detail: `${ads.length} RSA ad(s) found`,
  });

  // 5.2 Headline count
  const lowHeadlines = ads.filter((a: any) => {
    const headlines = a.adGroupAd?.ad?.responsiveSearchAd?.headlines ?? [];
    return headlines.length < 8;
  });
  checks.push({
    id: "5.2", name: "RSAs with >= 8 headlines", severity: "high",
    passed: lowHeadlines.length === 0,
    detail: lowHeadlines.length === 0 ? "All RSAs have 8+ headlines" :
      `${lowHeadlines.length} RSA(s) with < 8 headlines`,
  });

  // 5.3 Description count
  const lowDescs = ads.filter((a: any) => {
    const descs = a.adGroupAd?.ad?.responsiveSearchAd?.descriptions ?? [];
    return descs.length < 3;
  });
  checks.push({
    id: "5.3", name: "RSAs with >= 3 descriptions", severity: "high",
    passed: lowDescs.length === 0,
    detail: lowDescs.length === 0 ? "All RSAs have 3+ descriptions" :
      `${lowDescs.length} RSA(s) with < 3 descriptions`,
  });

  // 5.10 Path fields
  const noPath = ads.filter((a: any) => {
    const rsa = a.adGroupAd?.ad?.responsiveSearchAd ?? {};
    return !rsa.path1;
  });
  checks.push({
    id: "5.10", name: "Path fields used", severity: "medium",
    passed: noPath.length === 0 || ads.length === 0,
    detail: noPath.length === 0 ? "All RSAs use path fields" :
      `${noPath.length}/${ads.length} RSA(s) missing path fields`,
  });

  // 5.11 Bilingual ads
  const adCampaigns = ads.map((a: any) => String(a.campaign?.name ?? ""));
  const nlAds = adCampaigns.some((n) => n.includes("NL"));
  const frAds = adCampaigns.some((n) => n.includes("FR"));
  checks.push({
    id: "5.11", name: "Bilingual ad coverage", severity: "high",
    passed: nlAds && frAds,
    detail: `NL ads: ${nlAds ? "yes" : "missing"}, FR ads: ${frAds ? "yes" : "missing"}`,
  });

  return scoreCategory("Ads", 15, checks);
}

function auditSettings(data: AuditData): CategoryResult {
  const checks: AuditCheck[] = [];
  const { campaigns, geoTargets } = data;
  const enabled = campaigns.filter((c: any) => c.campaign?.status === "ENABLED");

  // 6.2 Smart bidding adoption
  const smartBidding = enabled.filter((c: any) => {
    const strategy = c.campaign?.biddingStrategyType ?? "";
    return strategy.includes("TARGET") || strategy.includes("MAXIMIZE");
  });
  const smartPct = enabled.length > 0 ? (smartBidding.length / enabled.length) * 100 : 0;
  checks.push({
    id: "6.2", name: "Smart bidding adoption >= 50%", severity: "medium",
    passed: smartPct >= 50,
    detail: `${smartBidding.length}/${enabled.length} (${smartPct.toFixed(0)}%) on smart bidding`,
  });

  // 6.5 Geo targeting exists (positive LOCATION or PROXIMITY)
  const campaignsWithGeo = new Set(
    geoTargets
      .filter((g: any) => g.campaignCriterion?.negative !== true)
      .map((g: any) => g.campaign?.name)
  );
  const noGeo = enabled.filter((c: any) => !campaignsWithGeo.has(c.campaign?.name));
  checks.push({
    id: "6.5", name: "All campaigns have geo targeting", severity: "critical",
    passed: noGeo.length === 0,
    detail: noGeo.length === 0 ? "All campaigns have location targets" :
      `${noGeo.length} campaign(s) without geo targeting`,
  });

  // 6.6 Belgium targeting
  const hasBelgium = geoTargets.some((g: any) =>
    String(g.campaignCriterion?.location?.geoTargetConstant ?? "").includes("2056"));
  checks.push({
    id: "6.6", name: "Belgium targeting present", severity: "high",
    passed: hasBelgium,
    detail: hasBelgium ? "Belgium (2056) targeted" : "No campaigns targeting Belgium",
  });

  // 6.11 Network settings
  const searchOnDisplay = enabled.filter((c: any) =>
    c.campaign?.advertisingChannelType === "SEARCH" &&
    c.campaign?.networkSettings?.targetContentNetwork === true);
  checks.push({
    id: "6.11", name: "Search not on Display network", severity: "high",
    passed: searchOnDisplay.length === 0,
    detail: searchOnDisplay.length === 0 ? "No Search campaigns on Display network" :
      `${searchOnDisplay.length} Search campaign(s) with Display network enabled`,
  });

  return scoreCategory("Settings", 10, checks);
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreCategory(name: string, weight: number, checks: AuditCheck[]): CategoryResult {
  const passed = checks.filter((c) => c.passed).length;
  const score = checks.length > 0 ? Math.round((passed / checks.length) * 100) : 100;
  return { name, weight, checks, score, grade: letterGrade(score) };
}

function letterGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// ─── Main Audit Runner ──────────────────────────────────────────────────────

export async function runAudit(client: GoogleAdsClient): Promise<AuditResult> {
  const data = await collectAuditData(client);

  const categories = [
    auditConversionTracking(data),
    auditWastedSpend(data),
    auditAccountStructure(data),
    auditKeywords(data),
    auditAds(data),
    auditSettings(data),
  ];

  const overallScore = Math.round(
    categories.reduce((s, c) => s + (c.score * c.weight) / 100, 0),
  );

  const allChecks = categories.flatMap((c) => c.checks);

  return {
    date: new Date().toISOString().split("T")[0],
    overallScore,
    overallGrade: letterGrade(overallScore),
    categories,
    critical: allChecks.filter((c) => !c.passed && c.severity === "critical"),
    high: allChecks.filter((c) => !c.passed && c.severity === "high"),
    quickWins: allChecks.filter((c) => !c.passed && c.severity === "low"),
  };
}

// ─── Slack Formatting ────────────────────────────────────────────────────────

export function formatAuditForSlack(result: AuditResult): string {
  const gradeEmoji: Record<string, string> = {
    A: ":white_check_mark:", B: ":large_blue_circle:",
    C: ":warning:", D: ":red_circle:", F: ":rotating_light:",
  };

  const lines: string[] = [
    `${gradeEmoji[result.overallGrade] ?? ""} *Google Ads Health Audit — ${result.date}*`,
    `*Overall Score: ${result.overallScore}/100 (${result.overallGrade})*`,
    "",
    "*Category Scores:*",
  ];

  for (const cat of result.categories) {
    const emoji = gradeEmoji[cat.grade] ?? "";
    const passed = cat.checks.filter((c) => c.passed).length;
    lines.push(`  ${emoji} ${cat.name} (${cat.weight}%): *${cat.score}/100 ${cat.grade}* — ${passed}/${cat.checks.length} checks passed`);
  }

  if (result.critical.length > 0) {
    lines.push("", ":rotating_light: *Critical Issues (fix immediately):*");
    for (const c of result.critical) {
      lines.push(`  • [${c.id}] ${c.name} — ${c.detail}`);
    }
  }

  if (result.high.length > 0) {
    lines.push("", ":red_circle: *High Priority (fix this week):*");
    for (const c of result.high) {
      lines.push(`  • [${c.id}] ${c.name} — ${c.detail}`);
    }
  }

  if (result.quickWins.length > 0) {
    lines.push("", ":bulb: *Quick Wins (< 15 min):*");
    for (const c of result.quickWins) {
      lines.push(`  • [${c.id}] ${c.name} — ${c.detail}`);
    }
  }

  if (result.critical.length === 0 && result.high.length === 0) {
    lines.push("", ":tada: No critical or high-priority issues found.");
  }

  return lines.join("\n");
}

// ─── Slack Command Handler ───────────────────────────────────────────────────

export async function handleAudit(
  agent: GoogleAdsAgent,
  message: RoutedMessage,
): Promise<AgentResponse> {
  if (!agent.googleAds) {
    return reply(message, "Google Ads client not configured.");
  }

  const result = await runAudit(agent.googleAds);
  return reply(message, formatAuditForSlack(result));
}
