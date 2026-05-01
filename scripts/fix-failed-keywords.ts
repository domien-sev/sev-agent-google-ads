/**
 * Retry failed keyword batches — add one at a time to identify the bad one.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const CPC_MICROS = "600000";

const RETRIES = [
  { label: "Amélie NL", campaignRn: "customers/6267337247/campaigns/23695230872", keywords: [
    { text: "dameskleding outlet", matchType: "PHRASE" },
    { text: "jurken dames korting", matchType: "PHRASE" },
    { text: "handtassen dames outlet", matchType: "PHRASE" },
    { text: "blazer dames sale", matchType: "PHRASE" },
    { text: "jeans dames korting", matchType: "PHRASE" },
    { text: "sjaals dames outlet", matchType: "PHRASE" },
    { text: "dames juwelen korting", matchType: "PHRASE" },
    { text: "tops dames sale", matchType: "PHRASE" },
  ]},
  { label: "WoodWick NL", campaignRn: "customers/6267337247/campaigns/23689889943", keywords: [
    { text: "geurkaars outlet", matchType: "PHRASE" },
    { text: "kaars houten lont korting", matchType: "PHRASE" },
    { text: "wax melts sale", matchType: "PHRASE" },
    { text: "geurstokjes korting", matchType: "PHRASE" },
    { text: "huisparfum outlet", matchType: "PHRASE" },
    { text: "kaarsen cadeau korting", matchType: "PHRASE" },
    { text: "geurverspreider sale", matchType: "PHRASE" },
  ]},
];

async function main() {
  const client = new GoogleAdsClient({
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  });

  for (const batch of RETRIES) {
    console.log(`\n--- ${batch.label} ---`);
    const rows: any[] = await client.query(
      `SELECT ad_group.resource_name FROM ad_group WHERE campaign.resource_name = '${batch.campaignRn}' AND ad_group.status != 'REMOVED' LIMIT 1`
    );
    const adGroupRn = rows[0]?.results?.[0]?.adGroup?.resourceName;
    if (!adGroupRn) { console.log("No ad group"); continue; }

    for (const kw of batch.keywords) {
      try {
        await client.mutateResource("adGroupCriteria", [{
          create: {
            ad_group: adGroupRn,
            status: "ENABLED",
            cpc_bid_micros: CPC_MICROS,
            keyword: { text: kw.text, match_type: kw.matchType },
          },
        }]);
        console.log(`  ✓ ${kw.text}`);
      } catch (err: any) {
        const msg = err.message?.includes("ALREADY_EXISTS") ? "already exists" : err.message?.slice(0, 100);
        console.log(`  ✗ ${kw.text} — ${msg}`);
      }
    }
  }
}

main().catch(console.error);
