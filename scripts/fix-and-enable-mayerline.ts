/**
 * Fix NL ad (DESTINATION_NOT_WORKING) by appending ?ref=gads, and enable both Mayerline campaigns.
 *
 * Usage: cd sev-agent-channel-google-ads && npx tsx --require dotenv/config scripts/fix-and-enable-mayerline.ts
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const NL_CAMPAIGN = "customers/6267337247/campaigns/23714153721";
const NL_AD_GROUP = "customers/6267337247/adGroups/196654138284";
const FR_CAMPAIGN = "customers/6267337247/campaigns/23719436828";
const FR_AD_GROUP = "customers/6267337247/adGroups/195733379195";

const NL_HEADLINES = [
  "Mayerline Private Sale", "Le Salon VIP Sint-Niklaas", "Mayerline tot -70% Korting",
  "11-26 April Sint-Niklaas", "Beperkte Plaatsen", "Belgische Elegantie",
  "Mayerline Outlet Verkoop", "Premium Damesmode", "Perfect Passende Stijl",
  "Topmerken Outlet Verkoop", "Exclusieve Kortingen", "Shop Mayerline Outlet",
  "VIP Shopping Ervaring", "Schrijf Nu In", "Gratis Parking",
];

const NL_DESCRIPTIONS = [
  "Ontdek Mayerline met kortingen tot 70%. Belgische elegantie voor een fractie van de prijs bij Le Salon VIP.",
  "Premium damesmode van Mayerline aan outletprijzen. 11-26 april in Sint-Niklaas. Inschrijving verplicht.",
  "Exclusieve Mayerline outlet: perfect passende silhouetten met hoge kortingen. Beperkte plaatsen beschikbaar.",
  "Le Salon VIP: 9 topmerken waaronder Mayerline. Schrijf je nu in voor exclusieve toegang tot de private sale.",
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

  // 1. Create the NL ad with ?ref=gads parameter
  console.log("Creating NL ad with ?ref=gads fix...");
  try {
    const adResult = await client.mutateResource("adGroupAds", [{
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
    console.log(`✓ NL ad created: ${adResult.results[0].resourceName}`);
  } catch (err) {
    console.error(`✗ NL ad failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Also update FR ad final URL to use ?ref=gads for consistency
  // First find the FR ad resource name
  console.log("\nUpdating FR ad URL to include ?ref=gads...");
  try {
    const query = `SELECT ad_group_ad.resource_name, ad_group_ad.ad.id FROM ad_group_ad WHERE ad_group.resource_name = '${FR_AD_GROUP}' AND ad_group_ad.status != 'REMOVED'`;
    const rows = await client.query(query);
    if (rows.length > 0) {
      const adRn = (rows[0] as any).ad_group_ad.resource_name;
      const adId = (rows[0] as any).ad_group_ad.ad.id;
      // Update final URL on the ad
      await client.mutateResource("ads", [{
        update: {
          resource_name: `customers/6267337247/ads/${adId}`,
          final_urls: ["https://www.shoppingeventvip.be/fr/event/le-salon-vip?ref=gads"],
        },
        updateMask: "final_urls",
      }]);
      console.log(`✓ FR ad URL updated: ${adRn}`);
    }
  } catch (err) {
    console.error(`✗ FR ad URL update failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Enable both campaigns
  console.log("\nEnabling campaigns...");
  for (const [label, rn] of [["NL", NL_CAMPAIGN], ["FR", FR_CAMPAIGN]] as const) {
    try {
      await client.mutateResource("campaigns", [{
        update: {
          resource_name: rn,
          status: "ENABLED",
        },
        updateMask: "status",
      }]);
      console.log(`✓ ${label} campaign ENABLED`);
    } catch (err) {
      console.error(`✗ ${label} enable failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n✅ Done!");
}

main().catch(console.error);
