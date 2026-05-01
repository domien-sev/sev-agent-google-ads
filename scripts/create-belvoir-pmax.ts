import { GoogleAdsClient } from "@domien-sev/ads-sdk";
import { buildCampaign } from "../src/tools/campaign-builder.js";
import { generateArticleCopy } from "../src/tools/article-copy.js";
import { fetchBelvoirArticle } from "../src/tools/belvoir-article.js";
import type { CampaignConfig } from "../src/types.js";

const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
  managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
});

async function main() {
  const article = await fetchBelvoirArticle("https://belvoir.be/nl-BE/blog/lentejassen-trends-2026");
  console.log(`Article: ${article.title_nl}\n`);

  console.log("Generating ad copy...");
  const adCopy = await generateArticleCopy(article);

  for (const lang of ["nl", "fr"] as const) {
    const name = `belvoir_260406_lentejassen-trends-2026_pmax_${lang.toUpperCase()}`;
    console.log(`\nCreating PMax: ${name}`);

    const config: CampaignConfig = {
      type: "pmax",
      name,
      dailyBudgetMicros: 10_000_000,
      locations: ["BE"],
      languages: [lang],
      startDate: new Date().toISOString().split("T")[0],
      endDate: "2026-04-20",
      targetCountry: "BE",
      // Skip asset group for now — PMax requires AssetGroupAsset links
      // which need a deeper builder fix. Campaign created without assets.
      // assetGroup: { ... },
      // PMax with Brand Guidelines requires logo + business name
      logoImageAsset: "customers/6267337247/assets/73011795371",
      businessName: "Belvoir",
    };

    try {
      const result = await buildCampaign(client, config);
      console.log(`  OK: ${result.campaignResourceName}`);
    } catch (err: any) {
      console.error(`  FAIL: ${err.message?.slice(0, 1000)}`);
    }
  }
}

main().catch(console.error);
