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
const SOURCE_AG = "190145648370";

// 1. Asset group signals (Demand Gen uses these for audiences)
console.log("=== Asset groups on campaign ===");
try {
  const ag = await client.query(`
    SELECT asset_group.id, asset_group.name, asset_group.status
    FROM asset_group
    WHERE campaign.id = ${CAMPAIGN_ID}
  `);
  console.log(JSON.stringify(ag, null, 2));
} catch (e) { console.log("  no asset groups or not applicable"); }

// 2. Asset group signals (audience-like)
console.log("\n=== Asset group signals ===");
try {
  const sig = await client.query(`
    SELECT asset_group_signal.asset_group,
           asset_group_signal.audience.audience
    FROM asset_group_signal
    WHERE asset_group.campaign = 'customers/${process.env.GOOGLE_ADS_CUSTOMER_ID}/campaigns/${CAMPAIGN_ID}'
  `);
  console.log(JSON.stringify(sig, null, 2));
} catch (e) { console.log("  signals query failed:", e.message.slice(0, 200)); }

// 3. Full ad_group_criterion dump on source (all fields)
console.log("\n=== Full source ad_group_criterion dump ===");
const full = await client.query(`
  SELECT ad_group_criterion.type,
         ad_group_criterion.criterion_id,
         ad_group_criterion.negative,
         ad_group_criterion.status,
         ad_group_criterion.display_name,
         ad_group_criterion.resource_name
  FROM ad_group_criterion
  WHERE ad_group.id = ${SOURCE_AG}
`);
console.log(JSON.stringify(full, null, 2));

// 4. Audience resource on ad group (separate concept)
console.log("\n=== ad_group.audience_setting ===");
const agRow = await client.query(`
  SELECT ad_group.id, ad_group.name,
         ad_group.audience_setting.use_audience_grouped,
         ad_group.targeting_setting.target_restrictions
  FROM ad_group
  WHERE ad_group.id = ${SOURCE_AG}
`);
console.log(JSON.stringify(agRow, null, 2));

// 5. Campaign-level audiences / settings
console.log("\n=== Campaign audience/targeting settings ===");
const camp = await client.query(`
  SELECT campaign.id, campaign.name,
         campaign.targeting_setting.target_restrictions,
         campaign.audience_setting.use_audience_grouped,
         campaign.demand_gen_campaign_settings.upgraded_targeting
  FROM campaign
  WHERE campaign.id = ${CAMPAIGN_ID}
`);
console.log(JSON.stringify(camp, null, 2));
