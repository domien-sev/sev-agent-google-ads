/**
 * Generic keyword adder — edit the config below and run.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const CPC_MICROS = "600000"; // €0.60

const BATCHES: Array<{ lang: string; campaignRn: string; keywords: Array<{ text: string; matchType: string }> }> = [
  // Birkenstock Physical NL
  {
    lang: "Birkenstock Physical NL",
    campaignRn: "customers/6267337247/campaigns/23699901355",
    keywords: [
      { text: "sandalen dames outlet", matchType: "PHRASE" },
      { text: "sandalen heren korting", matchType: "PHRASE" },
      { text: "clogs dames sale", matchType: "PHRASE" },
      { text: "comfortschoenen outlet", matchType: "PHRASE" },
      { text: "kurk sandalen korting", matchType: "PHRASE" },
      { text: "slippers dames outlet", matchType: "PHRASE" },
      { text: "zomersandalen sale", matchType: "PHRASE" },
      { text: "pantoffels korting", matchType: "PHRASE" },
    ],
  },
  // Birkenstock Physical FR
  {
    lang: "Birkenstock Physical FR",
    campaignRn: "customers/6267337247/campaigns/23695254218",
    keywords: [
      { text: "sandales femme outlet", matchType: "PHRASE" },
      { text: "sandales homme soldes", matchType: "PHRASE" },
      { text: "sabots femme soldes", matchType: "PHRASE" },
      { text: "chaussures confort outlet", matchType: "PHRASE" },
      { text: "sandales liège soldes", matchType: "PHRASE" },
      { text: "mules femme outlet", matchType: "PHRASE" },
      { text: "sandales été soldes", matchType: "PHRASE" },
      { text: "pantoufles soldes", matchType: "PHRASE" },
    ],
  },
  // Birkenstock Ecom NL
  {
    lang: "Birkenstock Ecom NL",
    campaignRn: "customers/6267337247/campaigns/23698108052",
    keywords: [
      { text: "sandalen dames outlet", matchType: "PHRASE" },
      { text: "sandalen heren korting", matchType: "PHRASE" },
      { text: "clogs dames sale", matchType: "PHRASE" },
      { text: "comfortschoenen outlet", matchType: "PHRASE" },
      { text: "kurk sandalen korting", matchType: "PHRASE" },
      { text: "slippers dames outlet", matchType: "PHRASE" },
      { text: "zomersandalen sale", matchType: "PHRASE" },
      { text: "pantoffels korting", matchType: "PHRASE" },
    ],
  },
  // Birkenstock Ecom FR
  {
    lang: "Birkenstock Ecom FR",
    campaignRn: "customers/6267337247/campaigns/23698108760",
    keywords: [
      { text: "sandales femme outlet", matchType: "PHRASE" },
      { text: "sandales homme soldes", matchType: "PHRASE" },
      { text: "sabots femme soldes", matchType: "PHRASE" },
      { text: "chaussures confort outlet", matchType: "PHRASE" },
      { text: "sandales liège soldes", matchType: "PHRASE" },
      { text: "mules femme outlet", matchType: "PHRASE" },
      { text: "sandales été soldes", matchType: "PHRASE" },
      { text: "pantoufles soldes", matchType: "PHRASE" },
    ],
  },
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

  for (const batch of BATCHES) {
    console.log(`\n--- ${batch.lang} ---`);
    const rows: any[] = await client.query(
      `SELECT ad_group.resource_name FROM ad_group WHERE campaign.resource_name = '${batch.campaignRn}' AND ad_group.status != 'REMOVED' LIMIT 1`
    );
    const adGroupRn = rows[0]?.results?.[0]?.adGroup?.resourceName;
    if (!adGroupRn) { console.error(`No ad group found`); continue; }

    const ops = batch.keywords.map(kw => ({
      create: {
        ad_group: adGroupRn,
        status: "ENABLED",
        cpc_bid_micros: CPC_MICROS,
        keyword: { text: kw.text, match_type: kw.matchType },
      },
    }));

    try {
      const result = await client.mutateResource("adGroupCriteria", ops);
      console.log(`✓ Added ${result.results.length} keywords at €0.60`);
    } catch (err) {
      console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log("\n✅ Done!");
}

main().catch(console.error);
