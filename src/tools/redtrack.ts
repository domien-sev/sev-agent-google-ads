/**
 * RedTrack integration for Google Ads campaign tracking.
 * Uses @domien-sev/redtrack-sdk for the three-step campaign creation
 * (offer → stream → campaign PUT) that properly binds funnels.
 */

import { RedTrackClient } from "@domien-sev/redtrack-sdk";

const REDTRACK_API_URL = process.env.REDTRACK_API_URL ?? "https://api.redtrack.io";
const REDTRACK_API_KEY = process.env.REDTRACK_API_KEY ?? "";

/** Google Ads tracking params appended to the tracking URL by RedTrack */
const GOOGLE_ADS_TRACKING_PARAMS =
  "utm_campaign={replace}&sub2={keyword}&sub3={matchtype}&sub4={adgroupid}" +
  "&sub5={creative}&sub6={campaignid}&sub7={device}&sub8={adposition}" +
  "&sub9={network}&sub10={placement}&utm_source=Google&wbraid={wbraid}" +
  "&gbraid={gbraid}&ref_id={gclid}";

/**
 * Belvoir house offer in RedTrack — reused across all article campaigns
 * so per-article attribution comes from sub-IDs in the tracking template
 * (sub4={adgroupid}) rather than from distinct offers.
 */
const BELVOIR_OFFER_ID = "6817ab4aaefa777a6adbf9ea";

let client: RedTrackClient | null = null;

function getClient(): RedTrackClient {
  if (!client) {
    client = new RedTrackClient({ apiKey: REDTRACK_API_KEY, apiUrl: REDTRACK_API_URL });
  }
  return client;
}

export function isRedTrackConfigured(): boolean {
  return REDTRACK_API_KEY.length > 0;
}

/**
 * Create a full RedTrack campaign for an event Google Ads campaign.
 * Returns the tracking template to use in Google Ads campaign settings.
 */
export async function createRedTrackCampaign(params: {
  brand: string;
  eventType: "physical" | "online";
  landingPageUrl: string;
}): Promise<{ trackingUrl: string; campaignId: string; trackingTemplate: string } | null> {
  if (!isRedTrackConfigured()) {
    console.warn("[redtrack] Not configured — skipping");
    return null;
  }

  try {
    const result = await getClient().createEventCampaign({
      brand: params.brand,
      eventType: params.eventType,
      channel: "google-ads",
      landingPageUrl: params.landingPageUrl,
    });

    const trackingTemplate = `{lpurl}?cmpid=${result.campaignId}&${GOOGLE_ADS_TRACKING_PARAMS}`;

    console.log(`[redtrack] Created campaign ${result.campaignId}`);
    console.log(`[redtrack] Tracking URL: ${result.trackingUrl}`);
    console.log(`[redtrack] Tracking template: ${trackingTemplate}`);

    return {
      trackingUrl: result.trackingUrl,
      campaignId: result.campaignId,
      trackingTemplate,
    };
  } catch (err) {
    console.error(`[redtrack] Error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Create a Belvoir RedTrack campaign that reuses the house Belvoir offer.
 * Title format mirrors the existing convention: `{YYMMDD}-gd-belvoir-be-{lang}-{theme}`.
 *
 * `theme` should be a stable per-campaign slug (e.g. category name "mode" or
 * an article slug). Per-article attribution within a category-level campaign
 * comes from `sub4={adgroupid}` already in the tracking template.
 */
export async function createBelvoirRedTrackCampaign(params: {
  lang: "nl" | "fr";
  theme: string;
  date?: Date;
}): Promise<{ trackingUrl: string; campaignId: string; trackingTemplate: string } | null> {
  if (!isRedTrackConfigured()) {
    console.warn("[redtrack] Not configured — skipping");
    return null;
  }

  const d = params.date ?? new Date();
  const yymmdd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const safeTheme = params.theme.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const title = `${yymmdd}-gd-belvoir-be-${params.lang}-${safeTheme}`;

  // RedTrack's 3-step create (campaign → stream → PUT bind) occasionally
  // 404s on the PUT step due to read-after-write lag. Retry once with a
  // small delay before giving up.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await getClient().createCampaignWithOffer({
        title,
        channel: "google-ads",
        offerId: BELVOIR_OFFER_ID,
      });

      const trackingTemplate = `{lpurl}?cmpid=${result.campaignId}&${GOOGLE_ADS_TRACKING_PARAMS}`;

      console.log(`[redtrack] Created Belvoir campaign ${result.campaignId} (${title})`);
      return {
        trackingUrl: result.trackingUrl,
        campaignId: result.campaignId,
        trackingTemplate,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const transient = msg.includes("404") || msg.includes("Campaign not found");
      if (attempt === 1 && transient) {
        console.warn(`[redtrack] Belvoir transient error (will retry): ${msg.slice(0, 120)}`);
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      console.error(`[redtrack] Belvoir error: ${msg}`);
      return null;
    }
  }
  return null;
}
