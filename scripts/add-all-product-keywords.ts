/**
 * Add product/category keywords to ALL active campaigns.
 * €0.60 CPC for all product keywords.
 */
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

const CPC_MICROS = "600000";

const BATCHES: Array<{ label: string; campaignRn: string; keywords: Array<{ text: string; matchType: string }> }> = [

  // ===================== AMÉLIE & AMÉLIE (Salon VIP) =====================
  { label: "Amélie NL", campaignRn: "customers/6267337247/campaigns/23695230872", keywords: [
    { text: "dameskleding outlet", matchType: "PHRASE" },
    { text: "jurken dames korting", matchType: "PHRASE" },
    { text: "handtassen dames outlet", matchType: "PHRASE" },
    { text: "blazer dames sale", matchType: "PHRASE" },
    { text: "jeans dames korting", matchType: "PHRASE" },
    { text: "sjaals dames outlet", matchType: "PHRASE" },
    { text: "dames juwelen korting", matchType: "PHRASE" },
    { text: "tops dames sale", matchType: "PHRASE" },
  ]},
  { label: "Amélie FR", campaignRn: "customers/6267337247/campaigns/23689867581", keywords: [
    { text: "vêtements femme outlet", matchType: "PHRASE" },
    { text: "robes femme soldes", matchType: "PHRASE" },
    { text: "sacs à main femme outlet", matchType: "PHRASE" },
    { text: "blazer femme soldes", matchType: "PHRASE" },
    { text: "jean femme soldes", matchType: "PHRASE" },
    { text: "foulards femme outlet", matchType: "PHRASE" },
    { text: "bijoux femme soldes", matchType: "PHRASE" },
    { text: "tops femme soldes", matchType: "PHRASE" },
  ]},

  // ===================== BLAKELY (Salon VIP) =====================
  { label: "Blakely NL", campaignRn: "customers/6267337247/campaigns/23699880679", keywords: [
    { text: "sportkleding heren outlet", matchType: "PHRASE" },
    { text: "joggers heren korting", matchType: "PHRASE" },
    { text: "hoodie heren sale", matchType: "PHRASE" },
    { text: "trainingspak heren outlet", matchType: "PHRASE" },
    { text: "gym kleding heren korting", matchType: "PHRASE" },
    { text: "streetwear heren sale", matchType: "PHRASE" },
    { text: "t-shirt heren outlet", matchType: "PHRASE" },
    { text: "shorts heren korting", matchType: "PHRASE" },
  ]},
  { label: "Blakely FR", campaignRn: "customers/6267337247/campaigns/23695243676", keywords: [
    { text: "vêtements sport homme outlet", matchType: "PHRASE" },
    { text: "jogging homme soldes", matchType: "PHRASE" },
    { text: "sweat à capuche homme soldes", matchType: "PHRASE" },
    { text: "survêtement homme outlet", matchType: "PHRASE" },
    { text: "vêtements gym homme", matchType: "PHRASE" },
    { text: "streetwear homme soldes", matchType: "PHRASE" },
    { text: "t-shirt homme outlet", matchType: "PHRASE" },
    { text: "short homme soldes", matchType: "PHRASE" },
  ]},

  // ===================== BLUE BAY (Salon VIP) =====================
  { label: "Blue Bay NL", campaignRn: "customers/6267337247/campaigns/23695273412", keywords: [
    { text: "kinderkleding outlet", matchType: "PHRASE" },
    { text: "kinderjurken korting", matchType: "PHRASE" },
    { text: "babykleding sale", matchType: "PHRASE" },
    { text: "kinderjassen outlet", matchType: "PHRASE" },
    { text: "meisjeskleding korting", matchType: "PHRASE" },
    { text: "jongenskleding outlet", matchType: "PHRASE" },
    { text: "tienerkleding sale", matchType: "PHRASE" },
    { text: "communiekleding korting", matchType: "PHRASE" },
  ]},
  { label: "Blue Bay FR", campaignRn: "customers/6267337247/campaigns/23695274348", keywords: [
    { text: "vêtements enfants outlet", matchType: "PHRASE" },
    { text: "robe fille soldes", matchType: "PHRASE" },
    { text: "vêtements bébé soldes", matchType: "PHRASE" },
    { text: "manteau enfant outlet", matchType: "PHRASE" },
    { text: "vêtements fille soldes", matchType: "PHRASE" },
    { text: "vêtements garçon outlet", matchType: "PHRASE" },
    { text: "mode ado soldes", matchType: "PHRASE" },
    { text: "communion soldes", matchType: "PHRASE" },
  ]},

  // ===================== BRAX (Salon VIP) =====================
  { label: "Brax NL", campaignRn: "customers/6267337247/campaigns/23695247489", keywords: [
    { text: "herenbroeken outlet", matchType: "PHRASE" },
    { text: "chino heren korting", matchType: "PHRASE" },
    { text: "jeans heren sale", matchType: "PHRASE" },
    { text: "damesbroeken outlet", matchType: "PHRASE" },
    { text: "polo heren korting", matchType: "PHRASE" },
    { text: "blazer heren sale", matchType: "PHRASE" },
    { text: "overhemden heren outlet", matchType: "PHRASE" },
    { text: "kwaliteitsbroeken korting", matchType: "PHRASE" },
  ]},
  { label: "Brax FR", campaignRn: "customers/6267337247/campaigns/23699891215", keywords: [
    { text: "pantalon homme outlet", matchType: "PHRASE" },
    { text: "chino homme soldes", matchType: "PHRASE" },
    { text: "jean homme soldes", matchType: "PHRASE" },
    { text: "pantalon femme outlet", matchType: "PHRASE" },
    { text: "polo homme soldes", matchType: "PHRASE" },
    { text: "blazer homme outlet", matchType: "PHRASE" },
    { text: "chemise homme soldes", matchType: "PHRASE" },
    { text: "pantalon chino soldes", matchType: "PHRASE" },
  ]},

  // ===================== CYCLEUR DE LUXE (Salon VIP) =====================
  { label: "Cycleur NL", campaignRn: "customers/6267337247/campaigns/23699872006", keywords: [
    { text: "herenschoenen outlet", matchType: "PHRASE" },
    { text: "leren sneakers heren korting", matchType: "PHRASE" },
    { text: "boots heren sale", matchType: "PHRASE" },
    { text: "veterschoenen heren outlet", matchType: "PHRASE" },
    { text: "casual schoenen heren korting", matchType: "PHRASE" },
    { text: "premium sneakers heren", matchType: "PHRASE" },
    { text: "designer schoenen heren outlet", matchType: "PHRASE" },
  ]},
  { label: "Cycleur FR", campaignRn: "customers/6267337247/campaigns/23695236650", keywords: [
    { text: "chaussures homme outlet", matchType: "PHRASE" },
    { text: "sneakers cuir homme soldes", matchType: "PHRASE" },
    { text: "bottines homme soldes", matchType: "PHRASE" },
    { text: "chaussures en cuir homme outlet", matchType: "PHRASE" },
    { text: "chaussures casual homme soldes", matchType: "PHRASE" },
    { text: "sneakers premium homme", matchType: "PHRASE" },
    { text: "chaussures designer homme outlet", matchType: "PHRASE" },
  ]},

  // ===================== HAMPTON BAYS (Salon VIP + Ecom = 4 campaigns) =====================
  { label: "Hampton Physical NL", campaignRn: "customers/6267337247/campaigns/23695267664", keywords: [
    { text: "linnen blouse dames outlet", matchType: "PHRASE" },
    { text: "gebreide trui dames korting", matchType: "PHRASE" },
    { text: "wijde broek dames sale", matchType: "PHRASE" },
    { text: "cardigan dames outlet", matchType: "PHRASE" },
    { text: "casual jurk dames korting", matchType: "PHRASE" },
    { text: "zomerblouse dames sale", matchType: "PHRASE" },
    { text: "katoenen jurk outlet", matchType: "PHRASE" },
  ]},
  { label: "Hampton Physical FR", campaignRn: "customers/6267337247/campaigns/23695268078", keywords: [
    { text: "blouse en lin femme outlet", matchType: "PHRASE" },
    { text: "pull en maille femme soldes", matchType: "PHRASE" },
    { text: "pantalon large femme soldes", matchType: "PHRASE" },
    { text: "cardigan femme outlet", matchType: "PHRASE" },
    { text: "robe décontractée femme soldes", matchType: "PHRASE" },
    { text: "blouse d'été femme outlet", matchType: "PHRASE" },
    { text: "robe en coton soldes", matchType: "PHRASE" },
  ]},
  { label: "Hampton Ecom NL", campaignRn: "customers/6267337247/campaigns/23698117433", keywords: [
    { text: "linnen blouse dames outlet", matchType: "PHRASE" },
    { text: "gebreide trui dames korting", matchType: "PHRASE" },
    { text: "wijde broek dames sale", matchType: "PHRASE" },
    { text: "cardigan dames outlet", matchType: "PHRASE" },
    { text: "casual jurk dames korting", matchType: "PHRASE" },
    { text: "zomerblouse dames sale", matchType: "PHRASE" },
    { text: "katoenen jurk outlet", matchType: "PHRASE" },
  ]},
  { label: "Hampton Ecom FR", campaignRn: "customers/6267337247/campaigns/23702801254", keywords: [
    { text: "blouse en lin femme outlet", matchType: "PHRASE" },
    { text: "pull en maille femme soldes", matchType: "PHRASE" },
    { text: "pantalon large femme soldes", matchType: "PHRASE" },
    { text: "cardigan femme outlet", matchType: "PHRASE" },
    { text: "robe décontractée femme soldes", matchType: "PHRASE" },
    { text: "blouse d'été femme outlet", matchType: "PHRASE" },
    { text: "robe en coton soldes", matchType: "PHRASE" },
  ]},

  // ===================== JEFF (Salon VIP) =====================
  { label: "Jeff NL", campaignRn: "customers/6267337247/campaigns/23699897746", keywords: [
    { text: "heren t-shirt outlet", matchType: "PHRASE" },
    { text: "polo heren korting", matchType: "PHRASE" },
    { text: "jeans heren sale", matchType: "PHRASE" },
    { text: "chino broek heren outlet", matchType: "PHRASE" },
    { text: "sweater heren korting", matchType: "PHRASE" },
    { text: "herenjack sale", matchType: "PHRASE" },
    { text: "casual herenkleding outlet", matchType: "PHRASE" },
  ]},
  { label: "Jeff FR", campaignRn: "customers/6267337247/campaigns/23695256351", keywords: [
    { text: "t-shirt homme outlet", matchType: "PHRASE" },
    { text: "polo homme soldes", matchType: "PHRASE" },
    { text: "jean homme outlet", matchType: "PHRASE" },
    { text: "pantalon chino homme soldes", matchType: "PHRASE" },
    { text: "pull homme outlet", matchType: "PHRASE" },
    { text: "veste homme soldes", matchType: "PHRASE" },
    { text: "vêtements homme décontractés outlet", matchType: "PHRASE" },
  ]},

  // ===================== LES CORDES (Salon VIP) =====================
  { label: "Les Cordes NL", campaignRn: "customers/6267337247/campaigns/23699874190", keywords: [
    { text: "handtas dames outlet", matchType: "PHRASE" },
    { text: "schoudertas dames korting", matchType: "PHRASE" },
    { text: "crossbody tas sale", matchType: "PHRASE" },
    { text: "clutch dames outlet", matchType: "PHRASE" },
    { text: "damestas korting", matchType: "PHRASE" },
    { text: "riem dames outlet", matchType: "PHRASE" },
    { text: "portemonnee dames sale", matchType: "PHRASE" },
    { text: "gekleurde handtas outlet", matchType: "PHRASE" },
  ]},
  { label: "Les Cordes FR", campaignRn: "customers/6267337247/campaigns/23699874145", keywords: [
    { text: "sac à main femme outlet", matchType: "PHRASE" },
    { text: "sac bandoulière femme soldes", matchType: "PHRASE" },
    { text: "sac crossbody soldes", matchType: "PHRASE" },
    { text: "pochette femme outlet", matchType: "PHRASE" },
    { text: "sac femme soldes", matchType: "PHRASE" },
    { text: "ceinture femme outlet", matchType: "PHRASE" },
    { text: "portefeuille femme soldes", matchType: "PHRASE" },
    { text: "sac coloré outlet", matchType: "PHRASE" },
  ]},

  // ===================== LYLE & SCOTT (Salon VIP) =====================
  { label: "Lyle NL", campaignRn: "customers/6267337247/campaigns/23695233596", keywords: [
    { text: "polo heren outlet", matchType: "PHRASE" },
    { text: "herentrui korting", matchType: "PHRASE" },
    { text: "hoodie heren sale", matchType: "PHRASE" },
    { text: "heren sweater outlet", matchType: "PHRASE" },
    { text: "overhemd heren korting", matchType: "PHRASE" },
    { text: "herenjack sale", matchType: "PHRASE" },
    { text: "lamswollen trui heren outlet", matchType: "PHRASE" },
    { text: "golf polo heren", matchType: "PHRASE" },
  ]},
  { label: "Lyle FR", campaignRn: "customers/6267337247/campaigns/23695233572", keywords: [
    { text: "polo homme outlet", matchType: "PHRASE" },
    { text: "pull homme soldes", matchType: "PHRASE" },
    { text: "sweat à capuche homme outlet", matchType: "PHRASE" },
    { text: "sweatshirt homme soldes", matchType: "PHRASE" },
    { text: "chemise homme outlet", matchType: "PHRASE" },
    { text: "veste homme soldes", matchType: "PHRASE" },
    { text: "pull en laine homme outlet", matchType: "PHRASE" },
    { text: "polo golf homme", matchType: "PHRASE" },
  ]},

  // ===================== MIA ZIA (Salon VIP) =====================
  { label: "Mia Zia NL", campaignRn: "customers/6267337247/campaigns/23689893720", keywords: [
    { text: "sjaal dames outlet", matchType: "PHRASE" },
    { text: "poncho dames korting", matchType: "PHRASE" },
    { text: "armband dames sale", matchType: "PHRASE" },
    { text: "ketting dames outlet", matchType: "PHRASE" },
    { text: "muts dames korting", matchType: "PHRASE" },
    { text: "boho sieraden outlet", matchType: "PHRASE" },
    { text: "accessoires dames sale", matchType: "PHRASE" },
  ]},
  { label: "Mia Zia FR", campaignRn: "customers/6267337247/campaigns/23689894521", keywords: [
    { text: "écharpe femme outlet", matchType: "PHRASE" },
    { text: "poncho femme soldes", matchType: "PHRASE" },
    { text: "bracelet femme soldes", matchType: "PHRASE" },
    { text: "collier femme outlet", matchType: "PHRASE" },
    { text: "bonnet femme soldes", matchType: "PHRASE" },
    { text: "bijoux bohème outlet", matchType: "PHRASE" },
    { text: "accessoires femme soldes", matchType: "PHRASE" },
  ]},

  // ===================== OSAKA (Salon VIP) =====================
  { label: "Osaka NL", campaignRn: "customers/6267337247/campaigns/23699878222", keywords: [
    { text: "hockeystick outlet", matchType: "PHRASE" },
    { text: "padel racket korting", matchType: "PHRASE" },
    { text: "hockeytas sale", matchType: "PHRASE" },
    { text: "sportkleding outlet", matchType: "PHRASE" },
    { text: "hockeyschoenen korting", matchType: "PHRASE" },
    { text: "scheenbeschermers sale", matchType: "PHRASE" },
    { text: "padel schoenen outlet", matchType: "PHRASE" },
    { text: "hockey uitrusting korting", matchType: "PHRASE" },
  ]},
  { label: "Osaka FR", campaignRn: "customers/6267337247/campaigns/23699878765", keywords: [
    { text: "crosse de hockey outlet", matchType: "PHRASE" },
    { text: "raquette de padel soldes", matchType: "PHRASE" },
    { text: "sac de hockey soldes", matchType: "PHRASE" },
    { text: "vêtements sport outlet", matchType: "PHRASE" },
    { text: "chaussures de hockey soldes", matchType: "PHRASE" },
    { text: "protège-tibias soldes", matchType: "PHRASE" },
    { text: "chaussures padel outlet", matchType: "PHRASE" },
    { text: "équipement hockey soldes", matchType: "PHRASE" },
  ]},

  // ===================== RIVER WOODS (Salon VIP + Extra Days = 4 campaigns) =====================
  { label: "River Physical NL", campaignRn: "customers/6267337247/campaigns/23689894062", keywords: [
    { text: "polo heren outlet", matchType: "PHRASE" },
    { text: "chino broek korting", matchType: "PHRASE" },
    { text: "herentrui sale", matchType: "PHRASE" },
    { text: "casual overhemd outlet", matchType: "PHRASE" },
    { text: "dames pullover korting", matchType: "PHRASE" },
    { text: "kinderkledij outlet", matchType: "PHRASE" },
    { text: "zomerjas heren sale", matchType: "PHRASE" },
  ]},
  { label: "River Physical FR", campaignRn: "customers/6267337247/campaigns/23689901193", keywords: [
    { text: "polo homme outlet", matchType: "PHRASE" },
    { text: "pantalon chino soldes", matchType: "PHRASE" },
    { text: "pull homme outlet", matchType: "PHRASE" },
    { text: "chemise homme soldes", matchType: "PHRASE" },
    { text: "pull femme outlet", matchType: "PHRASE" },
    { text: "vêtements enfants soldes", matchType: "PHRASE" },
    { text: "veste légère homme outlet", matchType: "PHRASE" },
  ]},
  { label: "River Extra NL", campaignRn: "customers/6267337247/campaigns/23712386097", keywords: [
    { text: "polo heren outlet", matchType: "PHRASE" },
    { text: "chino broek korting", matchType: "PHRASE" },
    { text: "herentrui sale", matchType: "PHRASE" },
    { text: "casual overhemd outlet", matchType: "PHRASE" },
    { text: "dames pullover korting", matchType: "PHRASE" },
    { text: "kinderkledij outlet", matchType: "PHRASE" },
    { text: "zomerjas heren sale", matchType: "PHRASE" },
  ]},
  { label: "River Extra FR", campaignRn: "customers/6267337247/campaigns/23722270792", keywords: [
    { text: "polo homme outlet", matchType: "PHRASE" },
    { text: "pantalon chino soldes", matchType: "PHRASE" },
    { text: "pull homme outlet", matchType: "PHRASE" },
    { text: "chemise homme soldes", matchType: "PHRASE" },
    { text: "pull femme outlet", matchType: "PHRASE" },
    { text: "vêtements enfants soldes", matchType: "PHRASE" },
    { text: "veste légère homme outlet", matchType: "PHRASE" },
  ]},

  // ===================== SWEET LEMON (Salon VIP) =====================
  { label: "Sweet Lemon NL", campaignRn: "customers/6267337247/campaigns/23689879572", keywords: [
    { text: "damesschoenen outlet", matchType: "PHRASE" },
    { text: "pumps dames korting", matchType: "PHRASE" },
    { text: "sandalen dames sale", matchType: "PHRASE" },
    { text: "enkellaarsjes dames outlet", matchType: "PHRASE" },
    { text: "ballerina schoenen korting", matchType: "PHRASE" },
    { text: "leren schoenen dames sale", matchType: "PHRASE" },
    { text: "laarzen dames outlet", matchType: "PHRASE" },
  ]},
  { label: "Sweet Lemon FR", campaignRn: "customers/6267337247/campaigns/23699884960", keywords: [
    { text: "chaussures femme outlet", matchType: "PHRASE" },
    { text: "escarpins femme soldes", matchType: "PHRASE" },
    { text: "sandales femme soldes", matchType: "PHRASE" },
    { text: "bottines femme outlet", matchType: "PHRASE" },
    { text: "ballerines femme soldes", matchType: "PHRASE" },
    { text: "chaussures en cuir femme outlet", matchType: "PHRASE" },
    { text: "bottes femme soldes", matchType: "PHRASE" },
  ]},

  // ===================== TIMBERLAND (Salon VIP + Ecom = 4 campaigns) =====================
  { label: "Timb Physical NL", campaignRn: "customers/6267337247/campaigns/23699903743", keywords: [
    { text: "wandelschoenen outlet", matchType: "PHRASE" },
    { text: "waterproof laarzen korting", matchType: "PHRASE" },
    { text: "boots heren sale", matchType: "PHRASE" },
    { text: "outdoor jas korting", matchType: "PHRASE" },
    { text: "winterlaarzen outlet", matchType: "PHRASE" },
    { text: "waterdichte schoenen sale", matchType: "PHRASE" },
    { text: "herenlaarzen outlet", matchType: "PHRASE" },
  ]},
  { label: "Timb Physical FR", campaignRn: "customers/6267337247/campaigns/23699903899", keywords: [
    { text: "chaussures de randonnée outlet", matchType: "PHRASE" },
    { text: "bottes imperméables soldes", matchType: "PHRASE" },
    { text: "bottes homme soldes", matchType: "PHRASE" },
    { text: "veste outdoor soldes", matchType: "PHRASE" },
    { text: "bottes d'hiver outlet", matchType: "PHRASE" },
    { text: "chaussures imperméables soldes", matchType: "PHRASE" },
    { text: "bottes homme outlet", matchType: "PHRASE" },
  ]},
  { label: "Timb Ecom NL", campaignRn: "customers/6267337247/campaigns/23692741137", keywords: [
    { text: "wandelschoenen outlet", matchType: "PHRASE" },
    { text: "waterproof laarzen korting", matchType: "PHRASE" },
    { text: "boots heren sale", matchType: "PHRASE" },
    { text: "outdoor jas korting", matchType: "PHRASE" },
    { text: "winterlaarzen outlet", matchType: "PHRASE" },
    { text: "waterdichte schoenen sale", matchType: "PHRASE" },
    { text: "herenlaarzen outlet", matchType: "PHRASE" },
  ]},
  { label: "Timb Ecom FR", campaignRn: "customers/6267337247/campaigns/23702785891", keywords: [
    { text: "chaussures de randonnée outlet", matchType: "PHRASE" },
    { text: "bottes imperméables soldes", matchType: "PHRASE" },
    { text: "bottes homme soldes", matchType: "PHRASE" },
    { text: "veste outdoor soldes", matchType: "PHRASE" },
    { text: "bottes d'hiver outlet", matchType: "PHRASE" },
    { text: "chaussures imperméables soldes", matchType: "PHRASE" },
    { text: "bottes homme outlet", matchType: "PHRASE" },
  ]},

  // ===================== WOODWICK (Salon VIP) =====================
  { label: "WoodWick NL", campaignRn: "customers/6267337247/campaigns/23689889943", keywords: [
    { text: "geurkaars outlet", matchType: "PHRASE" },
    { text: "kaars houten lont korting", matchType: "PHRASE" },
    { text: "wax melts sale", matchType: "PHRASE" },
    { text: "geurstokjes korting", matchType: "PHRASE" },
    { text: "huisparfum outlet", matchType: "PHRASE" },
    { text: "kaarsen cadeau korting", matchType: "PHRASE" },
    { text: "geurverspreider sale", matchType: "PHRASE" },
  ]},
  { label: "WoodWick FR", campaignRn: "customers/6267337247/campaigns/23689890159", keywords: [
    { text: "bougie parfumée outlet", matchType: "PHRASE" },
    { text: "bougie mèche bois soldes", matchType: "PHRASE" },
    { text: "fondants parfumés soldes", matchType: "PHRASE" },
    { text: "diffuseur de parfum outlet", matchType: "PHRASE" },
    { text: "parfum d'ambiance soldes", matchType: "PHRASE" },
    { text: "cadeau bougie outlet", matchType: "PHRASE" },
    { text: "bougie en cire soldes", matchType: "PHRASE" },
  ]},

  // ===================== XANDRES (Salon VIP) =====================
  { label: "Xandres Physical NL", campaignRn: "customers/6267337247/campaigns/23689886808", keywords: [
    { text: "elegante damesjurk outlet", matchType: "PHRASE" },
    { text: "blazer dames korting", matchType: "PHRASE" },
    { text: "zijden top dames sale", matchType: "PHRASE" },
    { text: "mantel dames outlet", matchType: "PHRASE" },
    { text: "geklede damesmode korting", matchType: "PHRASE" },
    { text: "designerkleding dames outlet", matchType: "PHRASE" },
    { text: "wijde broek dames sale", matchType: "PHRASE" },
  ]},
  { label: "Xandres Physical FR", campaignRn: "customers/6267337247/campaigns/23695251827", keywords: [
    { text: "robe élégante femme outlet", matchType: "PHRASE" },
    { text: "blazer femme soldes", matchType: "PHRASE" },
    { text: "haut en soie femme outlet", matchType: "PHRASE" },
    { text: "manteau femme soldes", matchType: "PHRASE" },
    { text: "mode femme élégante outlet", matchType: "PHRASE" },
    { text: "vêtements designer femme soldes", matchType: "PHRASE" },
    { text: "pantalon large femme outlet", matchType: "PHRASE" },
  ]},

  // ===================== ECOM: CERRUTI (NL + FR) =====================
  { label: "Cerruti Ecom NL", campaignRn: "customers/6267337247/campaigns/23698134665", keywords: [
    { text: "herenkostuum outlet", matchType: "PHRASE" },
    { text: "maatpak korting", matchType: "PHRASE" },
    { text: "zijden das sale", matchType: "PHRASE" },
    { text: "leren schoenen heren outlet", matchType: "PHRASE" },
    { text: "wollen mantel heren korting", matchType: "PHRASE" },
    { text: "herenmode luxe outlet", matchType: "PHRASE" },
  ]},
  { label: "Cerruti Ecom FR", campaignRn: "customers/6267337247/campaigns/23698136054", keywords: [
    { text: "costume homme outlet", matchType: "PHRASE" },
    { text: "cravate en soie soldes", matchType: "PHRASE" },
    { text: "chaussures en cuir homme outlet", matchType: "PHRASE" },
    { text: "manteau en laine homme soldes", matchType: "PHRASE" },
    { text: "chemise habillée homme outlet", matchType: "PHRASE" },
    { text: "mode luxe homme soldes", matchType: "PHRASE" },
  ]},

  // ===================== ECOM: GIGUE (NL + FR) =====================
  { label: "Gigue Ecom NL", campaignRn: "customers/6267337247/campaigns/23698138445", keywords: [
    { text: "damesjurk print outlet", matchType: "PHRASE" },
    { text: "blazer dames korting", matchType: "PHRASE" },
    { text: "zijden top dames sale", matchType: "PHRASE" },
    { text: "feestjurk dames outlet", matchType: "PHRASE" },
    { text: "rok dames korting", matchType: "PHRASE" },
    { text: "sjaal dames sale", matchType: "PHRASE" },
  ]},
  { label: "Gigue Ecom FR", campaignRn: "customers/6267337247/campaigns/23692776684", keywords: [
    { text: "robe imprimée femme outlet", matchType: "PHRASE" },
    { text: "blazer femme soldes", matchType: "PHRASE" },
    { text: "top en soie femme outlet", matchType: "PHRASE" },
    { text: "robe de fête femme soldes", matchType: "PHRASE" },
    { text: "jupe femme outlet", matchType: "PHRASE" },
    { text: "foulard femme soldes", matchType: "PHRASE" },
  ]},

  // ===================== ECOM: SCAPA (NL + FR) =====================
  { label: "Scapa Ecom NL", campaignRn: "customers/6267337247/campaigns/23692778376", keywords: [
    { text: "damesblazer outlet", matchType: "PHRASE" },
    { text: "zijden blouse dames korting", matchType: "PHRASE" },
    { text: "geklede broek dames sale", matchType: "PHRASE" },
    { text: "cocktailjurk outlet", matchType: "PHRASE" },
    { text: "wollen trui dames korting", matchType: "PHRASE" },
    { text: "kokerrok dames sale", matchType: "PHRASE" },
  ]},
  { label: "Scapa Ecom FR", campaignRn: "customers/6267337247/campaigns/23692778547", keywords: [
    { text: "blazer femme outlet", matchType: "PHRASE" },
    { text: "blouse en soie femme soldes", matchType: "PHRASE" },
    { text: "pantalon habillé femme outlet", matchType: "PHRASE" },
    { text: "robe de cocktail soldes", matchType: "PHRASE" },
    { text: "pull en laine femme outlet", matchType: "PHRASE" },
    { text: "jupe crayon femme soldes", matchType: "PHRASE" },
  ]},

  // ===================== ECOM: EASTPAK (NL + FR) =====================
  { label: "Eastpak Ecom NL", campaignRn: "customers/6267337247/campaigns/23702798554", keywords: [
    { text: "rugzak outlet", matchType: "PHRASE" },
    { text: "schooltas korting", matchType: "PHRASE" },
    { text: "laptoptas sale", matchType: "PHRASE" },
    { text: "heuptas outlet", matchType: "PHRASE" },
    { text: "reistas korting", matchType: "PHRASE" },
    { text: "pennenzak sale", matchType: "PHRASE" },
    { text: "rugzak school outlet", matchType: "PHRASE" },
  ]},
  { label: "Eastpak Ecom FR", campaignRn: "customers/6267337247/campaigns/23702799349", keywords: [
    { text: "sac à dos outlet", matchType: "PHRASE" },
    { text: "sac d'école soldes", matchType: "PHRASE" },
    { text: "sac pour laptop outlet", matchType: "PHRASE" },
    { text: "banane soldes", matchType: "PHRASE" },
    { text: "sac de voyage outlet", matchType: "PHRASE" },
    { text: "trousse soldes", matchType: "PHRASE" },
    { text: "sac à dos scolaire outlet", matchType: "PHRASE" },
  ]},

  // ===================== ECOM: TUMI (NL + FR) =====================
  { label: "TUMI Ecom NL", campaignRn: "customers/6267337247/campaigns/23698110380", keywords: [
    { text: "reiskoffer outlet", matchType: "PHRASE" },
    { text: "handbagage koffer korting", matchType: "PHRASE" },
    { text: "laptoptas leer sale", matchType: "PHRASE" },
    { text: "zakentas outlet", matchType: "PHRASE" },
    { text: "luxe reistas korting", matchType: "PHRASE" },
    { text: "leren rugzak outlet", matchType: "PHRASE" },
  ]},
  { label: "TUMI Ecom FR", campaignRn: "customers/6267337247/campaigns/23698111361", keywords: [
    { text: "valise cabine outlet", matchType: "PHRASE" },
    { text: "sac pour ordinateur soldes", matchType: "PHRASE" },
    { text: "bagage de luxe outlet", matchType: "PHRASE" },
    { text: "porte-documents soldes", matchType: "PHRASE" },
    { text: "sac de voyage luxe outlet", matchType: "PHRASE" },
    { text: "sac à dos cuir soldes", matchType: "PHRASE" },
  ]},

  // ===================== MARIE MÉRO (260325) =====================
  { label: "Marie Méro NL", campaignRn: "customers/6267337247/campaigns/23696354326", keywords: [
    { text: "feestjurk dames outlet", matchType: "PHRASE" },
    { text: "mantelpak dames korting", matchType: "PHRASE" },
    { text: "kokerrok dames sale", matchType: "PHRASE" },
    { text: "broekpak dames outlet", matchType: "PHRASE" },
    { text: "moeder van de bruid jurk", matchType: "PHRASE" },
    { text: "gelegenheidskleding dames korting", matchType: "PHRASE" },
    { text: "elegante jurk dames sale", matchType: "PHRASE" },
  ]},
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

  let totalAdded = 0;
  let totalFailed = 0;

  for (const batch of BATCHES) {
    process.stdout.write(`${batch.label}... `);
    const rows: any[] = await client.query(
      `SELECT ad_group.resource_name FROM ad_group WHERE campaign.resource_name = '${batch.campaignRn}' AND ad_group.status != 'REMOVED' LIMIT 1`
    );
    const adGroupRn = rows[0]?.results?.[0]?.adGroup?.resourceName;
    if (!adGroupRn) { console.log("✗ no ad group"); totalFailed++; continue; }

    const ops = batch.keywords.map(kw => ({
      create: {
        ad_group: adGroupRn,
        status: "ENABLED",
        cpc_bid_micros: CPC_MICROS,
        keyword: { text: kw.text, match_type: kw.matchType },
      },
    }));

    try {
      const result = await client.mutateResource("adGroupCriteria", ops);
      console.log(`✓ ${result.results.length} keywords`);
      totalAdded += result.results.length;
    } catch (err) {
      console.log(`✗ ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
      totalFailed++;
    }
  }

  console.log(`\n✅ Done! Added ${totalAdded} keywords across ${BATCHES.length} campaigns. Failed: ${totalFailed}`);
}

main().catch(console.error);
