import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID!;
const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  customerId: CUSTOMER_ID,
  managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
});

const REENABLE = [
  { id: "23702785891", name: "260326_agent_ecom_Timberland_Timberland_FR", allConv: 12 },
  { id: "23702799349", name: "260324_agent_ecom_Eastpak_Eastpak_FR", allConv: 24 },
  { id: "23717803835", name: "260401_CentPurCentIamKlean_CentPurCentIamklean_NL", allConv: 13 },
  { id: "23717802128", name: "260401_CentPurCentIamKlean_CentPurCentIamklean_FR", allConv: 5 },
  { id: "23698117433", name: "260320_agent_ecom_HamptonBays_HamptonBays_NL", allConv: 1 },
];

async function main() {
  for (const c of REENABLE) {
    try {
      await client.mutateResource("campaigns", [
        { update: { resourceName: `customers/${CUSTOMER_ID}/campaigns/${c.id}`, status: "ENABLED" }, updateMask: "status" },
      ]);
      console.log(`OK: ${c.name} (${c.allConv} allConv)`);
    } catch (err: any) {
      console.error(`FAIL: ${c.name} — ${err.message?.slice(0, 100)}`);
    }
  }
}

main().catch(console.error);
