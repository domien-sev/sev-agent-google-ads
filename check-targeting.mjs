import { GoogleAdsClient } from "@domien-sev/ads-sdk";
import "dotenv/config";

const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  customerId: process.env.GOOGLE_ADS_CUSTOMER_ID,
  loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
});

const CAMPAIGN_ID = "23713849405";
const NEW_AG_IDS = ["194741788545", "194654329919", "192340103221"];

console.log("=== Campaign-level criteria (geo + language) ===");
const campCrit = await client.query(`
  SELECT campaign_criterion.type,
         campaign_criterion.negative,
         campaign_criterion.location.geo_target_constant,
         campaign_criterion.language.language_constant,
         campaign_criterion.proximity.address.city_name,
         campaign_criterion.proximity.radius
  FROM campaign_criterion
  WHERE campaign.id = ${CAMPAIGN_ID}
`);
console.log(JSON.stringify(campCrit, null, 2));

console.log("\n=== Ad-group-level criteria for 3 new ad groups ===");
for (const agId of NEW_AG_IDS) {
  const r = await client.query(`
    SELECT ad_group_criterion.type,
           ad_group_criterion.negative,
           ad_group_criterion.audience.audience,
           ad_group_criterion.user_list.user_list,
           ad_group_criterion.user_interest.user_interest_category,
           ad_group.name
    FROM ad_group_criterion
    WHERE ad_group.id = ${agId}
  `);
  console.log(`\nAd group ${agId}:`, JSON.stringify(r, null, 2));
}

console.log("\n=== Reference: All Videos (existing) ad group criteria ===");
const existing = await client.query(`
  SELECT ad_group_criterion.type,
         ad_group_criterion.negative,
         ad_group_criterion.audience.audience,
         ad_group_criterion.user_list.user_list,
         ad_group_criterion.user_interest.user_interest_category
  FROM ad_group_criterion
  WHERE ad_group.id = 190145648370
`);
console.log(JSON.stringify(existing, null, 2));
