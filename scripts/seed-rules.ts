/**
 * Seed Google Ads optimization rules into Directus ad_rules collection.
 *
 * Usage:
 *   DIRECTUS_URL=https://ops.shoppingeventvip.be DIRECTUS_TOKEN=<token> npx tsx scripts/seed-rules.ts
 *
 * Rules follow the fashion e-commerce outlet model:
 * - Short campaign windows (event-based sales)
 * - Belgium market (NL+FR)
 * - ROAS-driven with safety guards
 */

const DIRECTUS_URL =
  process.env.DIRECTUS_URL ?? "https://ops.shoppingeventvip.be";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN ?? "";

if (!DIRECTUS_TOKEN) {
  console.error("❌ DIRECTUS_TOKEN is required");
  process.exit(1);
}

interface SeedRule {
  name: string;
  platform: "google" | "all";
  trigger: unknown;
  action: { type: string; params: Record<string, unknown> };
  enabled: boolean;
}

const rules: SeedRule[] = [
  // ── Budget scaling ────────────────────────────────────────────────

  {
    name: "Scale budget: high ROAS (>3.0, 7d)",
    platform: "google",
    trigger: {
      logic: "and",
      conditions: [
        { metric: "roas", operator: "gt", value: 3.0, period_days: 7 },
        { metric: "conversions", operator: "gte", value: 5, period_days: 7 },
      ],
      min_spend: 100,
      min_days_active: 5,
    },
    action: {
      type: "scale_budget",
      params: { factor: 1.2 }, // +20%
    },
    enabled: true,
  },

  {
    name: "Scale budget: excellent ROAS (>5.0, 7d)",
    platform: "google",
    trigger: {
      logic: "and",
      conditions: [
        { metric: "roas", operator: "gt", value: 5.0, period_days: 7 },
        { metric: "conversions", operator: "gte", value: 10, period_days: 7 },
      ],
      min_spend: 200,
      min_days_active: 7,
    },
    action: {
      type: "scale_budget",
      params: { factor: 1.3 }, // +30% (max single action)
    },
    enabled: true,
  },

  {
    name: "Reduce budget: low ROAS (<1.0, 7d)",
    platform: "google",
    trigger: {
      logic: "and",
      conditions: [
        { metric: "roas", operator: "lt", value: 1.0, period_days: 7 },
        { metric: "spend", operator: "gt", value: 50, period_days: 7 },
      ],
      min_spend: 50,
      min_days_active: 5,
    },
    action: {
      type: "scale_budget",
      params: { factor: 0.8 }, // -20%
    },
    enabled: true,
  },

  // ── Campaign pause ────────────────────────────────────────────────

  {
    name: "Pause: very low ROAS (<0.5, 14d)",
    platform: "google",
    trigger: {
      logic: "and",
      conditions: [
        { metric: "roas", operator: "lt", value: 0.5, period_days: 14 },
        { metric: "spend", operator: "gt", value: 100, period_days: 14 },
      ],
      min_spend: 100,
      min_days_active: 7,
    },
    action: {
      type: "pause",
      params: { reason: "Sustained poor ROAS (<0.5) over 14 days" },
    },
    enabled: true,
  },

  {
    name: "Pause: zero conversions with spend (7d)",
    platform: "google",
    trigger: {
      logic: "and",
      conditions: [
        { metric: "conversions", operator: "eq", value: 0, period_days: 7 },
        { metric: "spend", operator: "gt", value: 75, period_days: 7 },
      ],
      min_spend: 75,
      min_days_active: 7,
    },
    action: {
      type: "pause",
      params: { reason: "No conversions after €75+ spend in 7 days" },
    },
    enabled: true,
  },

  // ── Alerts ────────────────────────────────────────────────────────

  {
    name: "Alert: high CPA (>€30, 7d)",
    platform: "google",
    trigger: {
      logic: "and",
      conditions: [
        { metric: "cpa", operator: "gt", value: 30, period_days: 7 },
        { metric: "conversions", operator: "gte", value: 3, period_days: 7 },
      ],
      min_spend: 50,
    },
    action: {
      type: "alert",
      params: {
        severity: "warning",
        message: "CPA exceeds €30 — review keyword targeting and landing pages",
      },
    },
    enabled: true,
  },

  {
    name: "Alert: low CTR (<1.0%, 7d)",
    platform: "google",
    trigger: {
      logic: "and",
      conditions: [
        { metric: "ctr", operator: "lt", value: 1.0, period_days: 7 },
        {
          metric: "impressions",
          operator: "gte",
          value: 1000,
          period_days: 7,
        },
      ],
      min_spend: 30,
    },
    action: {
      type: "alert",
      params: {
        severity: "warning",
        message:
          "CTR below 1% — review ad copy relevance and keyword match types",
      },
    },
    enabled: true,
  },

  {
    name: "Alert: low quality score (<4)",
    platform: "google",
    trigger: {
      metric: "quality_score",
      operator: "lt",
      value: 4,
      period_days: 7,
    },
    action: {
      type: "alert",
      params: {
        severity: "warning",
        message:
          "Quality score below 4 — review ad relevance, landing page experience, and expected CTR",
      },
    },
    enabled: true,
  },

  // ── Keyword-level actions ─────────────────────────────────────────

  {
    name: "Reduce keyword bid: high CPA (>€40, 7d)",
    platform: "google",
    trigger: {
      logic: "and",
      conditions: [
        { metric: "cpa", operator: "gt", value: 40, period_days: 7 },
        { metric: "conversions", operator: "gte", value: 2, period_days: 7 },
      ],
      min_spend: 50,
    },
    action: {
      type: "adjust_keyword_bid",
      params: { factor: 0.8 }, // -20% bid
    },
    enabled: true,
  },

  {
    name: "Increase keyword bid: high ROAS + low impression share",
    platform: "google",
    trigger: {
      logic: "and",
      conditions: [
        { metric: "roas", operator: "gt", value: 4.0, period_days: 7 },
        { metric: "ctr", operator: "gt", value: 3.0, period_days: 7 },
      ],
      min_spend: 50,
      min_days_active: 5,
    },
    action: {
      type: "adjust_keyword_bid",
      params: { factor: 1.15 }, // +15% bid
    },
    enabled: true,
  },

  // ── Ad-level actions ──────────────────────────────────────────────

  {
    name: "Pause ad: very low CTR (<0.5%, 14d)",
    platform: "google",
    trigger: {
      logic: "and",
      conditions: [
        { metric: "ctr", operator: "lt", value: 0.5, period_days: 14 },
        {
          metric: "impressions",
          operator: "gte",
          value: 2000,
          period_days: 14,
        },
      ],
      min_spend: 30,
      min_days_active: 7,
    },
    action: {
      type: "pause_ad",
      params: { reason: "CTR consistently below 0.5% with sufficient impressions" },
    },
    enabled: true,
  },

  // ── Cross-platform rules ──────────────────────────────────────────

  {
    name: "Alert: high daily spend (>€150/day)",
    platform: "all",
    trigger: {
      metric: "spend",
      operator: "gt",
      value: 150,
      period_days: 1,
    },
    action: {
      type: "alert",
      params: {
        severity: "critical",
        message:
          "Daily spend exceeds €150 — verify this is within expected range",
      },
    },
    enabled: true,
  },
];

async function seed() {
  console.log(
    `\n🌱 Seeding ${rules.length} optimization rules into ${DIRECTUS_URL}/items/ad_rules\n`,
  );

  // Check for existing Google rules to avoid duplicates
  const existingRes = await fetch(
    `${DIRECTUS_URL}/items/ad_rules?filter[platform][_in]=google,all&fields=id,name`,
    { headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` } },
  );

  if (!existingRes.ok) {
    console.error(
      `❌ Failed to check existing rules: ${existingRes.status} ${existingRes.statusText}`,
    );
    const body = await existingRes.text();
    console.error(body);
    process.exit(1);
  }

  const existing = (await existingRes.json()).data as {
    id: string;
    name: string;
  }[];
  const existingNames = new Set(existing.map((r) => r.name));

  if (existing.length > 0) {
    console.log(`ℹ️  Found ${existing.length} existing rule(s):`);
    existing.forEach((r) => console.log(`   - ${r.name} (${r.id})`));
    console.log();
  }

  let created = 0;
  let skipped = 0;

  for (const rule of rules) {
    if (existingNames.has(rule.name)) {
      console.log(`⏭️  Skipped (exists): ${rule.name}`);
      skipped++;
      continue;
    }

    const res = await fetch(`${DIRECTUS_URL}/items/ad_rules`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DIRECTUS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rule),
    });

    if (res.ok) {
      const data = (await res.json()).data;
      console.log(`✅ Created: ${rule.name} (${data.id})`);
      created++;
    } else {
      const err = await res.text();
      console.error(`❌ Failed: ${rule.name} — ${res.status}: ${err}`);
    }
  }

  console.log(
    `\n📊 Done: ${created} created, ${skipped} skipped (already exist)\n`,
  );
}

seed().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
