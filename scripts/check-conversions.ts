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
  const raw = await client.query(`SELECT conversion_action.id, conversion_action.name, conversion_action.type, conversion_action.status, conversion_action.category, conversion_action.value_settings.default_value, conversion_action.value_settings.always_use_default_value, conversion_action.primary_for_goal, metrics.all_conversions, metrics.all_conversions_value FROM conversion_action WHERE conversion_action.status = 'ENABLED' ORDER BY metrics.all_conversions DESC`);
  const rows = Array.isArray(raw) ? raw.flatMap((c: any) => c.results || []) : [];
  for (const row of rows) {
    const ca = (row as any).conversionAction || {};
    const m = (row as any).metrics || {};
    const vs = ca.valueSettings || {};
    console.log(`${ca.id} | ${ca.name} | ${ca.type} | ${ca.category} | primary=${ca.primaryForGoal} | defVal=${vs.defaultValue} | alwaysDef=${vs.alwaysUseDefaultValue} | allConv=${m.allConversions} | allConvVal=${m.allConversionsValue}`);
  }
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
