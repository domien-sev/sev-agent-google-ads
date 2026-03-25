import { BaseAgent } from "@domien-sev/agent-sdk";
import type { AgentConfig } from "@domien-sev/agent-sdk";
import type { RoutedMessage, AgentResponse } from "@domien-sev/shared-types";
import { reply } from "./tools/reply.js";
import { GoogleAdsClient } from "@domien-sev/ads-sdk";

import { handleResearch } from "./handlers/research.js";
import { handleCampaign } from "./handlers/campaign.js";
import { handleKeywords } from "./handlers/keywords.js";
import { handleAudiences } from "./handlers/audiences.js";
import { handleOptimize } from "./handlers/optimize.js";
import { handleReport } from "./handlers/report.js";
import { handleCreativeRequest } from "./handlers/creative-request.js";
import { handleWizard, isWizardMessage } from "./handlers/wizard.js";

export class GoogleAdsAgent extends BaseAgent {
  public googleAds!: GoogleAdsClient;

  constructor(config: AgentConfig) {
    super(config);
  }

  async onStart(): Promise<void> {
    this.logger.info("Initializing Google Ads agent...");

    // Validate required environment variables
    const requiredEnvVars = [
      "DIRECTUS_URL",
      "DIRECTUS_TOKEN",
      "ANTHROPIC_API_KEY",
    ] as const;

    const googleAdsEnvVars = [
      "GOOGLE_ADS_DEVELOPER_TOKEN",
      "GOOGLE_ADS_CLIENT_ID",
      "GOOGLE_ADS_CLIENT_SECRET",
      "GOOGLE_ADS_REFRESH_TOKEN",
      "GOOGLE_ADS_CUSTOMER_ID",
    ] as const;

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required env var: ${envVar}`);
      }
    }

    // Initialize Google Ads client
    const missingGoogleEnvVars = googleAdsEnvVars.filter((v) => !process.env[v]);
    if (missingGoogleEnvVars.length === 0) {
      this.googleAds = new GoogleAdsClient({
        developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
        clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
        refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
        customerId: process.env.GOOGLE_ADS_CUSTOMER_ID!,
        managerCustomerId: process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID,
      });
      this.logger.info("Google Ads client initialized");
    } else {
      this.logger.warn(`Google Ads API disabled — missing: ${missingGoogleEnvVars.join(", ")}`);
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
      // Wizard — must check first as it captures follow-up messages
      if (isWizardMessage(text, message.channel_id, message.user_id)) {
        return handleWizard(this, message);
      }

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
      return reply(message, `Error: ${errMsg}`);
    }
  }

  private helpResponse(message: RoutedMessage): AgentResponse {
    return reply(message, [
        "*Google Ads Agent — Full Command Reference*",
        "",
        "---",
        "",
        "*Campaign Wizard (recommended)*",
        "The wizard guides you through campaign creation step by step.",
        "",
        "`wizard` — Start the wizard (shows buttons for all options)",
        "`events` — Browse active sales events from shoppingeventvip.be",
        "`event [name]` — Create campaign from a specific event",
        "`clone [campaign name]` — Clone an existing campaign with AI improvements",
        "",
        "_Wizard flow:_",
        "1. Pick a method: clone, event, or new (search/shopping/pmax/display/youtube)",
        "2. AI generates campaign recommendations (name, budget, bilingual ad copy, keywords)",
        "3. Review and modify before creating:",
        "   `adjust budget to €X` · `end date YYYY-MM-DD` · `no end date`",
        "   `url https://...` · `path outlet/sale` · `target BE, NL`",
        "   `rename to [name]` · `add keyword [text]` · `remove keyword [text]`",
        "   `regenerate copy` · `show` (view current state)",
        "4. `confirm` — Creates campaign in Google Ads (PAUSED)",
        "5. After creation, you can still modify the live campaign:",
        "   `enable` — Start serving ads",
        "   `pause` — Pause the campaign",
        "   `adjust budget to €X` — Change daily budget",
        "   `end date YYYY-MM-DD` · `no end date` — Set/clear end date",
        "   `rename to [name]` — Rename the campaign",
        "   `add ad https://url.com` — Create a responsive search ad",
        "   `done` — Close the session",
        "`export csv` — Export as Google Ads Editor CSV (instead of API)",
        "`cancel` — Abort the wizard at any step",
        "",
        "*Manage Existing Campaign:*",
        "`manage [campaign name]` — Open a session to modify an existing campaign",
        "  → `enable` / `pause` / `adjust budget` / `end date` / `rename` / `add ad`",
        "",
        "---",
        "",
        "*Quick Create (one-shot, no wizard):*",
        "`create search/shopping/pmax/display/youtube campaign \"Name\"` — Creates with defaults",
        "",
        "*Research & Audit:*",
        "`audit` — Full account health audit with scoring",
        "`research account` — Discover existing campaigns and structure",
        "",
        "*Keywords:*",
        "`keywords for [topic]` — Keyword performance overview",
        "`keyword report` — Quality score + performance breakdown",
        "`add negatives [terms]` — Add negative keywords",
        "`search terms [campaign]` — Search term analysis",
        "",
        "*Audiences:*",
        "`create audience \"[name]\"` — Create custom audience segment",
        "`audience report` — Audience performance",
        "",
        "*Optimization:*",
        "`optimize` — AI-powered optimization recommendations",
        "`rebalance budget` — Budget reallocation suggestions",
        "`improve quality` — Quality score improvement plan",
        "",
        "*Reporting:*",
        "`report daily` / `report weekly` — Performance summary",
        "`performance [campaign]` — Detailed campaign metrics",
        "`quality score` — Quality score distribution",
        "",
        "*Creatives:*",
        "`request creatives for [campaign]` — Delegate to ads agent",
        "",
        "---",
        "`help` — Show this message",
      ].join("\n"));
  }
}
