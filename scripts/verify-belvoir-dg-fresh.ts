/**
 * Verify the 3 freshly-created Belvoir DG ads + the state of the
 * 4 stuck campaigns after enrichment.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

type Row = Record<string, any>;

const STUCK_CAMPAIGNS = [23756207664, 23756208420, 23776223501, 23780869582];

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
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  });

  console.log("=== Campaign-level state ===");
  const camps = await runQuery(
    client,
    `
    SELECT campaign.id, campaign.name, campaign.status, campaign.serving_status, campaign.primary_status, campaign.primary_status_reasons
    FROM campaign
    WHERE campaign.id IN (${STUCK_CAMPAIGNS.join(",")})
    `,
  );
  for (const r of camps) {
    const c = r.campaign;
    console.log(`  [${c.id}] ${c.name}`);
    console.log(`    status=${c.status}  serving=${c.servingStatus}  primary=${c.primaryStatus}  reasons=${(c.primaryStatusReasons ?? []).join(",")}`);
  }

  console.log("\n=== Ad-level state across all 4 campaigns ===");
  const ads = await runQuery(
    client,
    `
    SELECT
      campaign.id,
      ad_group_ad.ad.id,
      ad_group_ad.status,
      ad_group_ad.policy_summary.approval_status,
      ad_group_ad.policy_summary.review_status
    FROM ad_group_ad
    WHERE campaign.id IN (${STUCK_CAMPAIGNS.join(",")})
      AND ad_group_ad.status != 'REMOVED'
    ORDER BY campaign.id, ad_group_ad.ad.id
    `,
  );
  let lastCamp = "";
  for (const r of ads) {
    if (r.campaign.id !== lastCamp) {
      console.log(`\n  Campaign ${r.campaign.id}:`);
      lastCamp = r.campaign.id;
    }
    const ps = r.adGroupAd.policySummary ?? {};
    console.log(`    ad ${r.adGroupAd.ad.id}: status=${r.adGroupAd.status}  approval=${ps.approvalStatus ?? "—"}  review=${ps.reviewStatus ?? "—"}`);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
