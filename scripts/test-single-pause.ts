import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
  managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
});

async function main() {
  try {
    const r = await client.mutateResource("adGroupCriteria", [{
      update: {
        resource_name: "customers/6267337247/adGroupCriteria/193365510885~301255281497",
        status: "PAUSED",
      },
      updateMask: "status",
    }]);
    console.log("OK", JSON.stringify(r));
  } catch (e: any) {
    console.log("ERR:", e.message);
  }
}
main();
