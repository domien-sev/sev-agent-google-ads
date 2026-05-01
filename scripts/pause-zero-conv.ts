/**
 * Pause all enabled campaigns with 0 primary conversions in last 30 days.
 *
 * Usage: npx tsx --require dotenv/config scripts/pause-zero-conv.ts [--dry-run]
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const DRY_RUN = process.argv.includes("--dry-run");
const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID!;

const client = new GoogleAdsClient({
  developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  customerId: CUSTOMER_ID,
  managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
});

const CAMPAIGNS_TO_PAUSE = [
  { id: "23714205310", name: "Le Salon VIP - Display - NL", cost: 195.78 },
  { id: "23699901355", name: "260411_agent_physical_Birkenstock_SalonVIP_NL", cost: 107.24 },
  { id: "23702785891", name: "260326_agent_ecom_Timberland_Timberland_FR", cost: 96.45 },
  { id: "23695247489", name: "260411_agent_physical_Brax_SalonVIP_NL", cost: 89.06 },
  { id: "23695254218", name: "260411_agent_physical_Birkenstock_SalonVIP_FR", cost: 77.04 },
  { id: "23699903743", name: "260411_agent_physical_Timberland_SalonVIP_NL", cost: 69.64 },
  { id: "23695251827", name: "260411_agent_physical_Xandres_SalonVIP_FR", cost: 62.25 },
  { id: "23702799349", name: "260324_agent_ecom_Eastpak_Eastpak_FR", cost: 53.29 },
  { id: "23699880679", name: "260411_agent_physical_Blakely_SalonVIP_NL", cost: 39.83 },
  { id: "23714153721", name: "260411_Mayerline_SalonVIP_NL", cost: 30.96 },
  { id: "23689889943", name: "260411_agent_physical_WoodWick_SalonVIP_NL", cost: 30.69 },
  { id: "23695267664", name: "260411_agent_physical_HamptonBays_SalonVIP_NL", cost: 30.39 },
  { id: "23689890159", name: "260411_agent_physical_WoodWick_SalonVIP_FR", cost: 27.66 },
  { id: "23689901193", name: "260411_agent_physical_RiverWoods_SalonVIP_FR", cost: 26.33 },
  { id: "23699874190", name: "260411_agent_physical_LesCordes_SalonVIP_NL", cost: 25.61 },
  { id: "23692778376", name: "260318_agent_ecom_Scapa_CerrutiGigueScapa_NL", cost: 20.54 },
  { id: "23699878222", name: "260411_agent_physical_Osaka_SalonVIP_NL", cost: 20.54 },
  { id: "23699903899", name: "260411_agent_physical_Timberland_SalonVIP_FR", cost: 20.50 },
  { id: "23698138445", name: "260318_agent_ecom_Gigue_CerrutiGigueScapa_NL", cost: 19.99 },
  { id: "23695233572", name: "260411_agent_physical_LyleScott_SalonVIP_FR", cost: 19.84 },
  { id: "23719436828", name: "260411_Mayerline_SalonVIP_FR", cost: 19.52 },
  { id: "23695273412", name: "260411_agent_physical_BlueBay_SalonVIP_NL", cost: 19.07 },
  { id: "23699891215", name: "260411_agent_physical_Brax_SalonVIP_FR", cost: 15.98 },
  { id: "23717803835", name: "260401_CentPurCentIamKlean_CentPurCentIamklean_NL", cost: 8.82 },
  { id: "23717802128", name: "260401_CentPurCentIamKlean_CentPurCentIamklean_FR", cost: 5.94 },
  { id: "23695236650", name: "260411_agent_physical_CycleurdeLuxe_SalonVIP_FR", cost: 5.35 },
  { id: "23695270031", name: "260411_agent_physical_DianevonFurstenberg_SalonVIP_NL", cost: 5.17 },
  { id: "23692778547", name: "260318_agent_ecom_Scapa_CerrutiGigueScapa_FR", cost: 4.53 },
  { id: "23689879572", name: "260411_agent_physical_SweetLemon_SalonVIP_NL", cost: 4.16 },
  { id: "23699878765", name: "260411_agent_physical_Osaka_SalonVIP_FR", cost: 3.58 },
  { id: "23695256351", name: "260411_agent_physical_Jeff_SalonVIP_FR", cost: 2.97 },
  { id: "23695243676", name: "260411_agent_physical_Blakely_SalonVIP_FR", cost: 2.20 },
  { id: "23702801254", name: "260320_agent_ecom_HamptonBays_HamptonBays_FR", cost: 1.98 },
  { id: "23695271456", name: "260411_agent_physical_DianevonFurstenberg_SalonVIP_FR", cost: 1.78 },
  { id: "23689894521", name: "260411_agent_physical_MiaZia_SalonVIP_FR", cost: 1.00 },
  { id: "23698117433", name: "260320_agent_ecom_HamptonBays_HamptonBays_NL", cost: 0.96 },
];

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Pausing ${CAMPAIGNS_TO_PAUSE.length} campaigns (€${CAMPAIGNS_TO_PAUSE.reduce((s, c) => s + c.cost, 0).toFixed(2)} wasted)\n`);

  let ok = 0, fail = 0;
  for (const camp of CAMPAIGNS_TO_PAUSE) {
    const resourceName = `customers/${CUSTOMER_ID}/campaigns/${camp.id}`;
    if (DRY_RUN) {
      console.log(`  [DRY] ${camp.name} (€${camp.cost.toFixed(2)})`);
      continue;
    }
    try {
      await client.mutateResource("campaigns", [
        { update: { resourceName, status: "PAUSED" }, updateMask: "status" },
      ]);
      console.log(`  OK: ${camp.name}`);
      ok++;
    } catch (err: any) {
      console.error(`  FAIL: ${camp.name} — ${err.message?.slice(0, 100)}`);
      fail++;
    }
  }

  console.log(`\nDone. ${ok} paused, ${fail} failed.`);
}

main().catch(console.error);
