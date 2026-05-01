/**
 * Apply the within-language cannibalization plan: pause the "loser" keyword
 * criteria in each duplicate group, keep the winner.
 *
 * Reads scripts/cannibalization-plan.json produced by report-keyword-cannibalization.ts
 *
 * Usage: GH_PKG_TOKEN=... npx tsx --require dotenv/config scripts/apply-cannibalization-plan.ts
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

type PlanEntry = {
  keyword: string;
  matchType: string;
  language: string;
  keep: string;
  pause: {
    campaign: string;
    cost: number;
    conv: number;
    convValue: number;
    criterionResources: string[];
  }[];
};

async function main() {
  const plan: PlanEntry[] = JSON.parse(
    fs.readFileSync("scripts/cannibalization-plan.json", "utf8")
  );

  const operations: any[] = [];
  const actions: { keyword: string; campaign: string; resource: string }[] = [];

  for (const entry of plan) {
    for (const loser of entry.pause) {
      for (const resource of loser.criterionResources) {
        operations.push({
          update: { resource_name: resource, status: "PAUSED" },
          updateMask: "status",
        });
        actions.push({
          keyword: `${entry.keyword} [${entry.matchType}]`,
          campaign: loser.campaign,
          resource,
        });
      }
    }
  }

  console.log(`Pausing ${operations.length} duplicate keyword criteria across ${plan.length} groups.\n`);

  if (!operations.length) {
    console.log("Nothing to do.");
    return;
  }

  // One at a time — isolates bad ops instead of failing whole batch
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const a = actions[i];
    try {
      await client.mutateResource("adGroupCriteria", [op]);
      ok += 1;
      console.log(`✓ ${a.keyword}  in  ${a.campaign}`);
    } catch (err: any) {
      fail += 1;
      console.log(`✗ ${a.keyword}  in  ${a.campaign}  — ${err.message?.slice(0, 140)}`);
    }
  }

  console.log(`\nDone. OK=${ok}, FAIL=${fail}`);
  console.log(`\nExamples of what was paused:`);
  for (const a of actions.slice(0, 10)) {
    console.log(`  ${a.keyword}  in  ${a.campaign}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
