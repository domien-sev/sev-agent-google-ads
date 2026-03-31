import type { RoutedMessage, AgentResponse } from "@domien-sev/shared-types";
import type { GoogleAdsAgent } from "../agent.js";
import { YouTubeClient } from "@domien-sev/ads-sdk";
import { reply } from "../tools/reply.js";

/**
 * YouTube video management handler.
 * Handles video uploads and listing for YouTube campaign creation.
 *
 * Commands:
 *   "youtube list"                         — List recent videos on the channel
 *   "youtube upload <path> "Title""        — Upload a video from disk
 *   "youtube channel"                      — Show channel info
 */

let youtubeClient: YouTubeClient | null = null;

function getYouTubeClient(): YouTubeClient {
  if (youtubeClient) return youtubeClient;

  const keyPath = process.env.GOOGLE_SA_KEY_PATH;
  const impersonateEmail = process.env.GOOGLE_IMPERSONATE_EMAIL;

  if (!keyPath || !impersonateEmail) {
    throw new Error(
      "YouTube upload requires GOOGLE_SA_KEY_PATH and GOOGLE_IMPERSONATE_EMAIL env vars. " +
      "Set GOOGLE_SA_KEY_PATH to the service account JSON key file path, " +
      "and GOOGLE_IMPERSONATE_EMAIL to the workspace user (e.g. domien@shoppingeventvip.be).",
    );
  }

  youtubeClient = new YouTubeClient({
    serviceAccountKeyPath: keyPath,
    impersonateEmail,
  });
  return youtubeClient;
}

export async function handleYouTube(
  agent: GoogleAdsAgent,
  message: RoutedMessage,
): Promise<AgentResponse> {
  const text = message.text.trim();
  const lower = text.toLowerCase();

  // --- youtube channel ---
  if (lower === "youtube channel" || lower === "yt channel") {
    const client = getYouTubeClient();
    const channel = await client.getChannel();
    return reply(message, [
      "*YouTube Channel*",
      "",
      `*Title:* ${channel.title}`,
      `*Channel ID:* \`${channel.channelId}\``,
      `*URL:* https://www.youtube.com/channel/${channel.channelId}`,
    ].join("\n"));
  }

  // --- youtube list ---
  if (lower === "youtube list" || lower === "yt list" || lower === "youtube videos") {
    const client = getYouTubeClient();
    const videos = await client.listVideos(10);

    if (!videos.length) {
      return reply(message, "No videos found on the channel.");
    }

    const lines: string[] = [
      `*YouTube Videos* (${videos.length} most recent)`,
      "",
    ];

    for (const v of videos) {
      const date = new Date(v.publishedAt).toLocaleDateString("nl-BE");
      lines.push(
        `• *${v.title}*`,
        `  ID: \`${v.videoId}\` · ${date}`,
        `  ${v.url}`,
        "",
      );
    }

    lines.push("_Use the video ID in YouTube campaign creation._");
    return reply(message, lines.join("\n"));
  }

  // --- youtube upload <path> "Title" ---
  if (lower.startsWith("youtube upload") || lower.startsWith("yt upload")) {
    // Parse: youtube upload <path> "Title" [description]
    const uploadMatch = text.match(
      /(?:youtube|yt)\s+upload\s+(.+?)\s+["'](.+?)["'](?:\s+["'](.+?)["'])?\s*$/i,
    );

    if (!uploadMatch) {
      return reply(message, [
        "Usage: `youtube upload <file-path> \"Video Title\"` or",
        "       `youtube upload <file-path> \"Title\" \"Description\"`",
        "",
        "Examples:",
        '  `youtube upload /tmp/salon-vip-ad.mp4 "Le Salon VIP - Kortingen tot 70%"`',
        '  `youtube upload /tmp/ad.mp4 "Sale Video" "Ontdek exclusieve deals bij Le Salon VIP"`',
        "",
        "Supported formats: MP4, MOV, AVI, WebM, MKV",
        "Videos are uploaded as *unlisted* by default (visible only via link + usable in ads).",
      ].join("\n"));
    }

    const [, filePath, title, description] = uploadMatch;
    const client = getYouTubeClient();

    agent.log.info(`Uploading video: "${title}" from ${filePath.trim()}`);

    const result = await client.uploadVideo({
      filePath: filePath.trim(),
      title,
      description: description ?? "",
      privacyStatus: "unlisted", // Safe for ad use — not publicly listed
      tags: ["shopping", "sale", "outlet", "fashion"],
      defaultLanguage: "nl",
    });

    return reply(message, [
      "*Video Uploaded Successfully*",
      "",
      `*Title:* ${result.title}`,
      `*Video ID:* \`${result.videoId}\``,
      `*URL:* ${result.url}`,
      `*Status:* ${result.status}`,
      `*Privacy:* Unlisted`,
      "",
      "_This video ID can now be used to create YouTube campaigns:_",
      `\`create youtube campaign "Campaign Name"\` then provide video ID \`${result.videoId}\``,
    ].join("\n"));
  }

  // Default help
  return reply(message, [
    "*YouTube Commands*",
    "",
    "`youtube channel` — Show channel info",
    "`youtube list` — List recent videos with IDs",
    '`youtube upload <path> "Title"` — Upload a video',
    "",
    "_Video IDs from uploads or listings can be used in YouTube campaign creation._",
  ].join("\n"));
}
