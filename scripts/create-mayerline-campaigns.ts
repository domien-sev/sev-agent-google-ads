/**
 * One-off script: Create Mayerline NL + FR campaigns for Le Salon VIP
 * Event: April 11-26, 2026 at Bleckmann, Schrijberg 189/193, 9111 Sint-Niklaas (Belsele)
 *
 * Usage: cd sev-agent-channel-google-ads && npx tsx --require dotenv/config scripts/create-mayerline-campaigns.ts
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";
import { buildCampaign } from "../src/tools/campaign-builder.js";
import { createCampaignAssets } from "../src/tools/asset-builder.js";
import type { CampaignConfig } from "../src/types.js";

const CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID!;
const CLAUDE_CODE_LABEL = `customers/${CUSTOMER_ID}/labels/22157248252`;

const EVENT = {
  slug: "le-salon-vip",
  startDate: "2026-04-11",
  endDate: "2026-04-26",
  address: "Schrijberg 189/193",
  postalCode: "9111",
  city: "Sint-Niklaas",
  brands: [
    "Amélie & Amélie", "Lyle & Scott", "Diane von Furstenberg",
    "River Woods", "Cycleur de Luxe", "Hampton Bays",
    "Blue Bay", "Osaka", "Mayerline",
  ],
};

// Daily budget per campaign (€10/day each = €20/day total for Mayerline NL+FR)
const DAILY_BUDGET_MICROS = 10_000_000; // €10

// --- Keywords ---
const BASE_KEYWORDS = [
  { text: "Mayerline outlet", matchType: "EXACT" as const },
  { text: "Mayerline private sale", matchType: "EXACT" as const },
  { text: "Mayerline outlet Sint-Niklaas", matchType: "PHRASE" as const },
  { text: "Salon VIP Mayerline", matchType: "PHRASE" as const },
  { text: "Mayerline", matchType: "BROAD" as const },
];

const NL_KEYWORDS = [
  ...BASE_KEYWORDS,
  { text: "Mayerline solden", matchType: "PHRASE" as const },
  { text: "Mayerline korting", matchType: "PHRASE" as const },
  { text: "Mayerline uitverkoop", matchType: "PHRASE" as const },
  { text: "Mayerline sale", matchType: "PHRASE" as const },
  { text: "Mayerline kleding outlet", matchType: "PHRASE" as const },
];

const FR_KEYWORDS = [
  ...BASE_KEYWORDS,
  { text: "Mayerline soldes", matchType: "PHRASE" as const },
  { text: "Mayerline vente privée", matchType: "PHRASE" as const },
  { text: "Mayerline réduction", matchType: "PHRASE" as const },
  { text: "Mayerline promo", matchType: "PHRASE" as const },
  { text: "Mayerline mode outlet", matchType: "PHRASE" as const },
];

// --- Ad Copy ---
const NL_AD = {
  headlines: [
    "Mayerline Private Sale",
    "Le Salon VIP Sint-Niklaas",
    "Mayerline tot -70% Korting",
    "11-26 April Sint-Niklaas",
    "Beperkte Plaatsen",
    "Belgische Elegantie",
    "Mayerline Outlet Verkoop",
    "Premium Damesmode",
    "Perfect Passende Stijl",
    "Topmerken Outlet Verkoop",
    "Exclusieve Kortingen",
    "Shop Mayerline Outlet",
    "VIP Shopping Ervaring",
    "Schrijf Nu In",
    "Gratis Parking",
  ],
  descriptions: [
    "Ontdek Mayerline met kortingen tot 70%. Belgische elegantie voor een fractie van de prijs bij Le Salon VIP.",
    "Premium damesmode van Mayerline aan outletprijzen. 11-26 april in Sint-Niklaas. Inschrijving verplicht.",
    "Exclusieve Mayerline outlet: perfect passende silhouetten met hoge kortingen. Beperkte plaatsen beschikbaar.",
    "Le Salon VIP: 9 topmerken waaronder Mayerline. Schrijf je nu in voor exclusieve toegang tot de private sale.",
  ],
  finalUrl: "https://www.shoppingeventvip.be/nl/event/le-salon-vip",
  path1: "Mayerline",
  path2: "Outlet",
};

const FR_AD = {
  headlines: [
    "Mayerline Vente Privée",
    "Le Salon VIP Sint-Niklaas",
    "Mayerline jusqu'à -70%",
    "11-26 Avril Sint-Niklaas",
    "Places Limitées",
    "Élégance Belge",
    "Mayerline Outlet",
    "Mode Femme Premium",
    "Silhouettes Parfaites",
    "Grandes Marques Outlet",
    "Réductions Exclusives",
    "Achetez Mayerline Outlet",
    "Expérience VIP Shopping",
    "Inscrivez-vous",
    "Parking Gratuit",
  ],
  descriptions: [
    "Découvrez Mayerline avec des réductions jusqu'à 70%. Élégance belge à prix outlet au Salon VIP.",
    "Mode femme Mayerline à prix outlet. 11-26 avril à Sint-Niklaas. Inscription obligatoire.",
    "Outlet exclusif Mayerline: silhouettes parfaites à prix réduits. Places limitées — inscrivez-vous maintenant.",
    "Le Salon VIP: 9 grandes marques dont Mayerline. Inscrivez-vous pour un accès exclusif à la vente privée.",
  ],
  finalUrl: "https://www.shoppingeventvip.be/fr/event/le-salon-vip",
  path1: "Mayerline",
  path2: "Outlet",
};

// --- Sitelinks ---
const NL_SITELINKS = [
  { linkText: "Bekijk het Event", description1: "Alle details over de verkoop", description2: "Data, locatie en merken", finalUrl: "https://www.shoppingeventvip.be/nl/event/le-salon-vip" },
  { linkText: "Alle Merken", description1: "Ontdek alle deelnemende merken", description2: "9 topmerken aan outletprijzen", finalUrl: "https://www.shoppingeventvip.be/nl/merken" },
  { linkText: "Inschrijven", description1: "Schrijf je nu in", description2: "Beperkte plaatsen beschikbaar", finalUrl: "https://www.shoppingeventvip.be/nl/event/le-salon-vip" },
  { linkText: "Komende Events", description1: "Bekijk alle komende events", description2: "Private sales in heel België", finalUrl: "https://www.shoppingeventvip.be/nl" },
];

const FR_SITELINKS = [
  { linkText: "Voir l'Événement", description1: "Tous les détails de la vente", description2: "Dates, lieu et marques", finalUrl: "https://www.shoppingeventvip.be/fr/event/le-salon-vip" },
  { linkText: "Toutes les Marques", description1: "Découvrez toutes les marques", description2: "9 grandes marques à prix outlet", finalUrl: "https://www.shoppingeventvip.be/fr/marques" },
  { linkText: "S'inscrire", description1: "Inscrivez-vous maintenant", description2: "Places limitées disponibles", finalUrl: "https://www.shoppingeventvip.be/fr/event/le-salon-vip" },
  { linkText: "Événements à Venir", description1: "Voir tous les événements", description2: "Ventes privées en Belgique", finalUrl: "https://www.shoppingeventvip.be/fr" },
];

const NL_CALLOUTS = ["Tot -70% Korting", "Topmerken Outlet", "Exclusieve Verkoop", "Beperkte Plaatsen", "Inschrijving Verplicht", "Gratis Parking"];
const FR_CALLOUTS = ["Jusqu'à -70%", "Marques Premium", "Vente Exclusive", "Places Limitées", "Inscription Obligatoire", "Parking Gratuit"];

// --- Main ---
async function main() {
  const client = new GoogleAdsClient({
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
  });

  const campaigns: Array<{
    lang: string;
    name: string;
    config: CampaignConfig;
    sitelinks: typeof NL_SITELINKS;
    callouts: string[];
    promoText: string;
  }> = [
    {
      lang: "NL",
      name: "260411_Mayerline_SalonVIP_NL",
      config: {
        type: "search",
        name: "260411_Mayerline_SalonVIP_NL",
        dailyBudgetMicros: DAILY_BUDGET_MICROS,
        locations: [],
        languages: ["languageConstants/1010"], // Dutch
        startDate: EVENT.startDate,
        endDate: EVENT.endDate,
        keywords: NL_KEYWORDS,
        adGroupName: "260411_Mayerline_SalonVIP_NL",
        responsiveSearchAd: NL_AD,
        proximityRadius: 50,
        proximityAddress: EVENT.address,
        proximityPostalCode: EVENT.postalCode,
      },
      sitelinks: NL_SITELINKS,
      callouts: NL_CALLOUTS,
      promoText: "Outlet Verkoop Mayerline",
    },
    {
      lang: "FR",
      name: "260411_Mayerline_SalonVIP_FR",
      config: {
        type: "search",
        name: "260411_Mayerline_SalonVIP_FR",
        dailyBudgetMicros: DAILY_BUDGET_MICROS,
        locations: [],
        languages: ["languageConstants/1002"], // French
        startDate: EVENT.startDate,
        endDate: EVENT.endDate,
        keywords: FR_KEYWORDS,
        adGroupName: "260411_Mayerline_SalonVIP_FR",
        responsiveSearchAd: FR_AD,
        proximityRadius: 50,
        proximityAddress: EVENT.address,
        proximityPostalCode: EVENT.postalCode,
      },
      sitelinks: FR_SITELINKS,
      callouts: FR_CALLOUTS,
      promoText: "Vente Outlet Mayerline",
    },
  ];

  for (const c of campaigns) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Creating ${c.lang} campaign: ${c.name}`);
    console.log("=".repeat(60));

    try {
      // 1. Build campaign (budget + campaign + ad group + keywords + RSA)
      const result = await buildCampaign(client, c.config);
      console.log(`✓ Campaign: ${result.campaignResourceName}`);
      console.log(`✓ Ad Group: ${result.adGroupResourceName}`);
      if (result.adWarning) console.log(`⚠ Ad warning: ${result.adWarning}`);

      // 2. Apply "Claude Code" label
      try {
        await client.mutateResource("campaignLabels", [{
          create: {
            campaign: result.campaignResourceName,
            label: CLAUDE_CODE_LABEL,
          },
        }]);
        console.log(`✓ Label applied`);
      } catch (err) {
        console.warn(`⚠ Label: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 3. Add assets (sitelinks, callouts, structured snippet, promotion)
      const finalUrl = c.lang === "NL" ? NL_AD.finalUrl : FR_AD.finalUrl;
      const assetResult = await createCampaignAssets(client, result.campaignResourceName, {
        sitelinks: c.sitelinks,
        callouts: c.callouts,
        brands: EVENT.brands,
        promotionText: c.promoText,
        discountPercent: 70,
        finalUrl,
        eventStartDate: EVENT.startDate,
        eventEndDate: EVENT.endDate,
        language: c.lang.toLowerCase(),
        hasParking: true,
        eventType: "physical",
      });

      console.log(`✓ Sitelinks: ${assetResult.sitelinks}`);
      console.log(`✓ Callouts: ${assetResult.callouts}`);
      console.log(`✓ Structured Snippets: ${assetResult.structuredSnippets}`);
      console.log(`✓ Promotions: ${assetResult.promotions}`);
      if (assetResult.errors.length > 0) {
        console.warn(`⚠ Asset errors: ${assetResult.errors.join(", ")}`);
      }

      console.log(`\n✅ ${c.lang} campaign created PAUSED — review in Google Ads before enabling.`);
    } catch (err) {
      console.error(`\n❌ ${c.lang} campaign failed:`, err instanceof Error ? err.message : String(err));
    }
  }
}

main().catch(console.error);
