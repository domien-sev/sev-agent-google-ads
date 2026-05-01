import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
  managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
});

async function run() {
  const rows: any[] = await client.query(
    "SELECT ad_group_ad.ad.id, ad_group_ad.ad.final_urls, ad_group_ad.resource_name FROM ad_group_ad WHERE ad_group.resource_name = 'customers/6267337247/adGroups/195733379195' AND ad_group_ad.status != 'REMOVED' LIMIT 1"
  );
  // SDK wraps results in a nested structure
  const adId = rows[0]?.results?.[0]?.adGroupAd?.ad?.id;
  if (!adId) {
    console.log("No FR ad found:", JSON.stringify(rows, null, 2));
    return;
  }

  console.log(`Updating ad ${adId} final URL...`);
  await client.mutateResource("ads", [{
    update: {
      resource_name: `customers/6267337247/ads/${adId}`,
      final_urls: ["https://www.shoppingeventvip.be/fr/event/le-salon-vip?ref=gads"],
    },
    updateMask: "final_urls",
  }]);
  console.log("✓ FR ad URL updated with ?ref=gads");
}

run().catch(console.error);
