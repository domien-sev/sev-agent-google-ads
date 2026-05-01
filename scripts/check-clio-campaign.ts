import "dotenv/config";
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const client = new GoogleAdsClient({
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
});

console.log("Querying campaigns...");
try {
  const r = await client.query("SELECT campaign.id, campaign.name, campaign.status FROM campaign ORDER BY campaign.id DESC LIMIT 5");
  console.log("Result:", JSON.stringify(r, null, 2));
} catch (e: any) {
  console.error("Error:", e.message);
}
