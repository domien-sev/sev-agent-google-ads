/**
 * Find CentPurCent campaigns and apply Claude Code label.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const CLAUDE_CODE_LABEL = "customers/6267337247/labels/22157248252";

async function main() {
  const client = new GoogleAdsClient({
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  });

  const rows: any[] = await client.query(
    `SELECT campaign.resource_name, campaign.name FROM campaign WHERE campaign.name LIKE '%CentPurCent%' AND campaign.status != 'REMOVED'`
  );

  const campaigns = rows[0]?.results ?? [];
  console.log(`Found ${campaigns.length} CentPurCent campaigns\n`);

  for (const row of campaigns) {
    const name = row.campaign.name;
    const rn = row.campaign.resourceName;
    console.log(`${name} — ${rn}`);

    try {
      await client.mutateResource("campaignLabels", [{
        create: {
          campaign: rn,
          label: CLAUDE_CODE_LABEL,
        },
      }]);
      console.log(`  ✓ label applied`);
    } catch (err: any) {
      if (err.message?.includes("ALREADY_EXISTS")) {
        console.log(`  — already has label`);
      } else {
        console.error(`  ✗ ${err.message}`);
      }
    }
  }
}

main().catch(console.error);
