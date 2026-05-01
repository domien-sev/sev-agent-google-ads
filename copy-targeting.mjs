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

const CUST = process.env.GOOGLE_ADS_CUSTOMER_ID;
const SOURCE_AG = "190145648370";
const TARGET_AGS = ["194741788545", "194654329919", "192340103221"];

// 1. Fetch all criteria from source (locations + audiences + anything else)
console.log("=== Fetching source ad group criteria ===");
const src = await client.query(`
  SELECT ad_group_criterion.type,
         ad_group_criterion.negative,
         ad_group_criterion.location.geo_target_constant,
         ad_group_criterion.language.language_constant,
         ad_group_criterion.audience.audience,
         ad_group_criterion.user_list.user_list,
         ad_group_criterion.user_interest.user_interest_category,
         ad_group_criterion.gender.type,
         ad_group_criterion.age_range.type,
         ad_group_criterion.parental_status.type
  FROM ad_group_criterion
  WHERE ad_group.id = ${SOURCE_AG}
    AND ad_group_criterion.negative = FALSE
`);
const rows = src[0].results || [];
console.log(`Source has ${rows.length} criteria`);
console.log(JSON.stringify(rows, null, 2));

// 2. Build create ops per target
function buildCreate(c, targetAgRn) {
  const crit = c.adGroupCriterion;
  const base = { ad_group: targetAgRn, status: "ENABLED", negative: false };
  switch (crit.type) {
    case "LOCATION":
      return { ...base, location: { geo_target_constant: crit.location.geoTargetConstant } };
    case "LANGUAGE":
      return { ...base, language: { language_constant: crit.language.languageConstant } };
    case "AUDIENCE":
      return { ...base, audience: { audience: crit.audience.audience } };
    case "USER_LIST":
      return { ...base, user_list: { user_list: crit.userList.userList } };
    case "USER_INTEREST":
      return { ...base, user_interest: { user_interest_category: crit.userInterest.userInterestCategory } };
    case "GENDER":
      return { ...base, gender: { type: crit.gender.type } };
    case "AGE_RANGE":
      return { ...base, age_range: { type: crit.ageRange.type } };
    case "PARENTAL_STATUS":
      return { ...base, parental_status: { type: crit.parentalStatus.type } };
    default:
      return null;
  }
}

console.log("\n=== Copying criteria to 3 new ad groups ===");
for (const targetId of TARGET_AGS) {
  const targetRn = `customers/${CUST}/adGroups/${targetId}`;
  const ops = rows.map((c) => {
    const create = buildCreate(c, targetRn);
    return create ? { create } : null;
  }).filter(Boolean);

  if (!ops.length) {
    console.log(`  ${targetId}: nothing to copy`);
    continue;
  }

  try {
    const r = await client.mutateResource("adGroupCriteria", ops);
    console.log(`  ${targetId}: copied ${r.results.length} criteria`);
  } catch (err) {
    console.error(`  ${targetId}: FAILED`, err.message);
  }
}

console.log("\n=== Verify: re-query targets ===");
for (const targetId of TARGET_AGS) {
  const r = await client.query(`
    SELECT ad_group_criterion.type
    FROM ad_group_criterion
    WHERE ad_group.id = ${targetId} AND ad_group_criterion.negative = FALSE
  `);
  const count = (r[0].results || []).length;
  console.log(`  ${targetId}: ${count} criteria`);
}
