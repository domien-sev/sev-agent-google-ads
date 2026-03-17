import { BaseAgent } from "@domien-sev/agent-sdk";
import type { AgentConfig } from "@domien-sev/agent-sdk";
import type { RoutedMessage, AgentResponse, DirectusInstanceConfig } from "@domien-sev/shared-types";
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

import { handleResearch } from "./handlers/research.js";
import { handleCampaign } from "./handlers/campaign.js";
import { handleKeywords } from "./handlers/keywords.js";
import { handleAudiences } from "./handlers/audiences.js";
import { handleOptimize } from "./handlers/optimize.js";
import { handleReport } from "./handlers/report.js";
import { handleCreativeRequest } from "./handlers/creative-request.js";

export class GoogleAdsAgent extends BaseAgent {
  public googleAds!: GoogleAdsClient;

  constructor(config: AgentConfig) {
    // Add ops Directus instance if configured
    if (process.env.OPS_DIRECTUS_URL && process.env.OPS_DIRECTUS_TOKEN) {
      const opsConfig: DirectusInstanceConfig = {
        instance: "ops" as DirectusInstanceConfig["instance"],
        url: process.env.OPS_DIRECTUS_URL,
        token: process.env.OPS_DIRECTUS_TOKEN,
      };
      config.directusConfig.push(opsConfig);
    }

    super(config);
  }

  async onStart(): Promise<void> {
    this.logger.info("Initializing Google Ads agent...");

    // Initialize Google Ads client
    if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      this.googleAds = new GoogleAdsClient({
        developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
        clientId: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? "",
        refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN ?? "",
        customerId: process.env.GOOGLE_ADS_CUSTOMER_ID ?? "",
        managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
      });
      this.logger.info("Google Ads client initialized");
    } else {
      this.logger.warn("GOOGLE_ADS_DEVELOPER_TOKEN not set — Google Ads API calls will fail");
    }

    this.logger.info("Google Ads agent started");
  }

  async onStop(): Promise<void> {
    this.logger.info("Google Ads agent stopped");
  }

  async handleMessage(message: RoutedMessage): Promise<AgentResponse> {
    const text = message.text.trim().toLowerCase();
    this.logger.info(`Received: "${text}" from ${message.user_id}`);

    try {
      // Research & audit
      if (text.startsWith("research") || text.startsWith("audit") || text.startsWith("discover")) {
        return handleResearch(this, message);
      }

      // Campaign management
      if (text.startsWith("create") && text.includes("campaign")) {
        return handleCampaign(this, message);
      }

      // Keywords
      if (text.startsWith("keyword") || text.startsWith("add negative") || text.startsWith("search term")) {
        return handleKeywords(this, message);
      }

      // Audiences
      if (text.includes("audience") || text.startsWith("create segment")) {
        return handleAudiences(this, message);
      }

      // Optimization
      if (text.startsWith("optimize") || text.startsWith("rebalance") || text.startsWith("improve quality")) {
        return handleOptimize(this, message);
      }

      // Reporting
      if (text.startsWith("report") || text.startsWith("performance") || text.startsWith("quality score")) {
        return handleReport(this, message);
      }

      // Creative requests
      if (text.startsWith("request creative") || text.startsWith("need creative")) {
        return handleCreativeRequest(this, message);
      }

      if (text === "help" || text === "?") {
        return this.helpResponse(message);
      }

      return this.helpResponse(message);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Handler error: ${errMsg}`);
      return {
        channel_id: message.channel_id,
        thread_ts: message.thread_ts ?? message.ts,
        text: `Error: ${errMsg}`,
      };
    }
  }

  private helpResponse(message: RoutedMessage): AgentResponse {
    return {
      channel_id: message.channel_id,
      thread_ts: message.thread_ts ?? message.ts,
      text: [
        "*Google Ads Agent Commands:*",
        "",
        "*Research & Audit:*",
        "`audit` — Full account health audit with scoring",
        "`research account` — Discover existing campaigns and structure",
        "",
        "*Campaigns:*",
        "`create search/shopping/pmax/display/youtube campaign \"Name\"` — Create campaign",
        "",
        "*Keywords:*",
        "`keywords for [topic]` — Research keywords",
        "`keyword report` — Quality score + performance report",
        "`add negatives [terms]` — Add negative keywords",
        "`search terms [campaign]` — Search term analysis",
        "",
        "*Audiences:*",
        "`create audience [name]` — Create custom segment",
        "`audience report` — Audience performance",
        "",
        "*Optimization:*",
        "`optimize` — LLM-powered optimization recommendations",
        "`rebalance budget` — Budget reallocation suggestions",
        "`improve quality` — Quality score improvement plan",
        "",
        "*Reporting:*",
        "`report daily/weekly` — Performance summary",
        "`performance [campaign]` — Detailed metrics",
        "`quality score` — Quality score overview",
        "",
        "*Creatives:*",
        "`request creatives for [campaign]` — Request from ads agent",
        "",
        "`help` — Show this message",
      ].join("\n"),
    };
  }
}
