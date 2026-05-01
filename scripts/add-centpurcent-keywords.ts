/**
 * Add product/category keywords to Cent Pur Cent & I am Klean campaigns.
 * CPC: €0.60 for all (phrase/broad).
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const CPC_MICROS = "600000"; // €0.60

const NL_CAMPAIGN_RN = "customers/6267337247/campaigns/23717803835";
const FR_CAMPAIGN_RN = "customers/6267337247/campaigns/23717802128";

const NL_KEYWORDS = [
  { text: "minerale make-up outlet", matchType: "PHRASE" },
  { text: "natuurlijke foundation korting", matchType: "PHRASE" },
  { text: "vegan make-up", matchType: "BROAD" },
  { text: "minerale foundation", matchType: "PHRASE" },
  { text: "clean beauty korting", matchType: "PHRASE" },
  { text: "cosmetica outlet België", matchType: "PHRASE" },
  { text: "oogschaduw palette sale", matchType: "PHRASE" },
  { text: "mascara natuurlijk", matchType: "PHRASE" },
  { text: "concealer mineraal", matchType: "PHRASE" },
  { text: "nagellak vegan", matchType: "PHRASE" },
  { text: "huidverzorging natuurlijk outlet", matchType: "PHRASE" },
  { text: "make-up stockverkoop", matchType: "PHRASE" },
];

const FR_KEYWORDS = [
  { text: "maquillage minéral outlet", matchType: "PHRASE" },
  { text: "fond de teint naturel soldes", matchType: "PHRASE" },
  { text: "maquillage vegan", matchType: "BROAD" },
  { text: "cosmétique naturelle", matchType: "PHRASE" },
  { text: "fond de teint minéral", matchType: "PHRASE" },
  { text: "clean beauty soldes", matchType: "PHRASE" },
  { text: "palette fards à paupières", matchType: "PHRASE" },
  { text: "mascara naturel", matchType: "PHRASE" },
  { text: "vernis à ongles vegan", matchType: "PHRASE" },
  { text: "cosmétique outlet Belgique", matchType: "PHRASE" },
  { text: "soin visage naturel soldes", matchType: "PHRASE" },
  { text: "maquillage déstockage", matchType: "PHRASE" },
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

  for (const [lang, campaignRn, keywords] of [
    ["NL", NL_CAMPAIGN_RN, NL_KEYWORDS],
    ["FR", FR_CAMPAIGN_RN, FR_KEYWORDS],
  ] as const) {
    console.log(`\n--- ${lang} ---`);

    // Find ad group
    const rows: any[] = await client.query(
      `SELECT ad_group.resource_name FROM ad_group WHERE campaign.resource_name = '${campaignRn}' AND ad_group.status != 'REMOVED' LIMIT 1`
    );
    const adGroupRn = rows[0]?.results?.[0]?.adGroup?.resourceName;
    if (!adGroupRn) {
      console.error(`No ad group found for ${lang}`);
      continue;
    }
    console.log(`Ad group: ${adGroupRn}`);

    const ops = keywords.map(kw => ({
      create: {
        ad_group: adGroupRn,
        status: "ENABLED",
        cpc_bid_micros: CPC_MICROS,
        keyword: {
          text: kw.text,
          match_type: kw.matchType,
        },
      },
    }));

    try {
      const result = await client.mutateResource("adGroupCriteria", ops);
      console.log(`✓ Added ${result.results.length} keywords at €0.60 CPC`);
    } catch (err) {
      console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n✅ Done!");
}

main().catch(console.error);
