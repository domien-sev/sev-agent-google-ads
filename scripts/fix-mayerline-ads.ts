/**
 * Fix NL ad descriptions (max 90 chars) and update FR ad URL.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const NL_AD_GROUP = "customers/6267337247/adGroups/196654138284";
const FR_AD_GROUP = "customers/6267337247/adGroups/195733379195";

const NL_HEADLINES = [
  "Mayerline Private Sale", "Le Salon VIP Sint-Niklaas", "Mayerline tot -70% Korting",
  "11-26 April Sint-Niklaas", "Beperkte Plaatsen", "Belgische Elegantie",
  "Mayerline Outlet Verkoop", "Premium Damesmode", "Perfect Passende Stijl",
  "Topmerken Outlet Verkoop", "Exclusieve Kortingen", "Shop Mayerline Outlet",
  "VIP Shopping Ervaring", "Schrijf Nu In", "Gratis Parking",
];

// All descriptions ≤90 chars
const NL_DESCRIPTIONS = [
  "Mayerline met kortingen tot 70%. Belgische elegantie aan outletprijzen.",          // 71
  "Premium damesmode aan outletprijzen. 11-26 april Sint-Niklaas. Schrijf in!",      // 76
  "Mayerline outlet: perfect passende silhouetten. Beperkte plaatsen!",               // 67
  "Le Salon VIP: 9 topmerken waaronder Mayerline. Exclusieve toegang.",               // 69
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

  // 1. Create NL ad with fixed descriptions + ?ref=gads
  console.log("Creating NL ad with fixed descriptions...");
  try {
    const result = await client.mutateResource("adGroupAds", [{
      create: {
        ad_group: NL_AD_GROUP,
        status: "ENABLED",
        ad: {
          responsive_search_ad: {
            headlines: NL_HEADLINES.map(text => ({ text })),
            descriptions: NL_DESCRIPTIONS.map(text => ({ text })),
            path1: "Mayerline",
            path2: "Outlet",
          },
          final_urls: ["https://www.shoppingeventvip.be/nl/event/le-salon-vip?ref=gads"],
        },
      },
    }]);
    console.log(`✓ NL ad created: ${result.results[0].resourceName}`);
  } catch (err) {
    console.error(`✗ NL ad: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Update FR ad final URL
  console.log("\nFinding and updating FR ad...");
  try {
    const query = `SELECT ad_group_ad.ad.id, ad_group_ad.ad.final_urls FROM ad_group_ad WHERE ad_group.resource_name = '${FR_AD_GROUP}' AND ad_group_ad.status != 'REMOVED' LIMIT 1`;
    const rows: any[] = await client.query(query);
    console.log(`  Found ${rows.length} FR ad(s)`);
    if (rows.length > 0) {
      const adId = rows[0].adGroupAd?.ad?.id ?? rows[0].ad_group_ad?.ad?.id;
      console.log(`  Ad ID: ${adId}`);
      await client.mutateResource("ads", [{
        update: {
          resource_name: `customers/6267337247/ads/${adId}`,
          final_urls: ["https://www.shoppingeventvip.be/fr/event/le-salon-vip?ref=gads"],
        },
        updateMask: "final_urls",
      }]);
      console.log(`✓ FR ad URL updated`);
    }
  } catch (err) {
    console.error(`✗ FR ad: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("\n✅ Done!");
}

main().catch(console.error);
