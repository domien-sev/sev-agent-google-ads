import { GoogleAdsClient } from "@domien-sev/ads-sdk";
import { handleBelvoirPipeline, formatPipelineResult } from "../src/handlers/belvoir-pipeline.js";

const agent = {
  googleAds: new GoogleAdsClient({
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  }),
  logger: { info: console.log, warn: console.warn, error: console.error },
};

async function main() {
  const url = process.argv[2] || "https://belvoir.be/nl-BE/blog/lentejassen-trends-2026";
  console.log(`Running pipeline preview for: ${url}\n`);

  const execute = process.argv.includes("--execute");
  console.log(`Mode: ${execute ? "EXECUTE" : "PREVIEW"}\n`);

  const result = await handleBelvoirPipeline(agent as any, {
    articleUrl: url,
    execute,
  });

  console.log(formatPipelineResult(result));
  console.log("\n--- Raw JSON ---");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
