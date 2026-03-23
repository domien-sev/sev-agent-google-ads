/**
 * Google Ads Editor CSV export.
 * Generates CSV files compatible with Google Ads Editor bulk import.
 */
import type { WizardRecommendations } from "./ai-recommendations.js";

/**
 * Generate Google Ads Editor compatible CSV rows.
 * Returns separate CSVs for campaigns, ad groups, keywords, and ads.
 */
export function generateEditorCsv(
  rec: WizardRecommendations,
  opts: {
    campaignType?: string;
    customerId?: string;
    targetCpa?: number;
    targetRoas?: number;
  } = {},
): string {
  const rows: string[][] = [];

  // Header row — Google Ads Editor format
  rows.push([
    "Row Type",
    "Action",
    "Campaign",
    "Campaign Type",
    "Campaign Status",
    "Budget",
    "Budget Type",
    "Bid Strategy Type",
    "Target CPA",
    "Target ROAS",
    "Ad Group",
    "Ad Group Status",
    "Max CPC",
    "Keyword",
    "Match Type",
    "Keyword Status",
    "Ad Type",
    "Headline 1",
    "Headline 2",
    "Headline 3",
    "Headline 4",
    "Headline 5",
    "Headline 6",
    "Headline 7",
    "Headline 8",
    "Headline 9",
    "Headline 10",
    "Headline 11",
    "Headline 12",
    "Headline 13",
    "Headline 14",
    "Headline 15",
    "Description 1",
    "Description 2",
    "Description 3",
    "Description 4",
    "Final URL",
    "Path 1",
    "Path 2",
    "Location",
    "Language",
  ]);

  const campaignTypeMap: Record<string, string> = {
    search: "Search",
    shopping: "Shopping",
    pmax: "Performance Max",
    display: "Display",
    youtube: "Video",
  };
  const campType = campaignTypeMap[opts.campaignType ?? "search"] ?? "Search";

  const bidStrategy = opts.targetRoas
    ? "Target ROAS"
    : opts.targetCpa
      ? "Target CPA"
      : "Maximize conversions";

  // Campaign row
  rows.push([
    "Campaign",
    "Add",
    rec.campaignName,
    campType,
    "Paused",
    String(rec.budget.dailyEuros),
    "Daily",
    bidStrategy,
    opts.targetCpa ? String(opts.targetCpa) : "",
    opts.targetRoas ? String(opts.targetRoas) : "",
    "", "", "", "", "", "", "", // ad group + keyword fields
    "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", // headlines
    "", "", "", "", // descriptions
    "", "", "", // URL + paths
    rec.targeting.locations.join(";"),
    "nl;fr",
  ]);

  // NL Ad Group + keywords + RSA
  const nlAdGroup = `${rec.campaignName} - NL`;
  rows.push([
    "Ad Group",
    "Add",
    rec.campaignName,
    "", "",
    "", "", "", "", "",
    nlAdGroup,
    "Enabled",
    "", "", "", "", "",
    "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", // headlines
    "", "", "", "", // descriptions
    "", "", "", "", "", // URL + paths + location + language
  ]);

  // NL Keywords
  for (const kw of rec.keywords) {
    const matchTypeMap: Record<string, string> = {
      EXACT: "Exact",
      PHRASE: "Phrase",
      BROAD: "Broad",
    };
    rows.push([
      "Keyword",
      "Add",
      rec.campaignName,
      "", "", "", "", "", "", "",
      nlAdGroup,
      "",
      "",
      kw.text,
      matchTypeMap[kw.matchType] ?? "Broad",
      "Enabled",
      "",
      "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", // headlines
      "", "", "", "", // descriptions
      "", "", "", "", "", // URL + paths + location + language
    ]);
  }

  // NL RSA
  const nlHeads = rec.adCopy.nl.headlines.slice(0, 15);
  const nlDescs = rec.adCopy.nl.descriptions.slice(0, 4);
  rows.push([
    "Ad",
    "Add",
    rec.campaignName,
    "", "", "", "", "", "", "",
    nlAdGroup,
    "", "", "", "", "",
    "Responsive search ad",
    ...padArray(nlHeads, 15),
    ...padArray(nlDescs, 4),
    rec.finalUrl,
    rec.path1 ?? "",
    rec.path2 ?? "",
    "", "",
  ]);

  // FR Ad Group + RSA
  const frAdGroup = `${rec.campaignName} - FR`;
  rows.push([
    "Ad Group",
    "Add",
    rec.campaignName,
    "", "", "", "", "", "", "",
    frAdGroup,
    "Enabled",
    "", "", "", "", "",
    "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", // headlines
    "", "", "", "", // descriptions
    "", "", "", "", "", // URL + paths + location + language
  ]);

  // FR Keywords (same keywords, different ad group)
  for (const kw of rec.keywords.filter((k) => k.group.startsWith("french"))) {
    rows.push([
      "Keyword",
      "Add",
      rec.campaignName,
      "", "", "", "", "", "", "",
      frAdGroup,
      "",
      "",
      kw.text,
      kw.matchType === "EXACT" ? "Exact" : kw.matchType === "PHRASE" ? "Phrase" : "Broad",
      "Enabled",
      "",
      "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", // headlines
      "", "", "", "", // descriptions
      "", "", "", "", "", // URL + paths + location + language
    ]);
  }

  // FR RSA
  const frHeads = rec.adCopy.fr.headlines.slice(0, 15);
  const frDescs = rec.adCopy.fr.descriptions.slice(0, 4);
  rows.push([
    "Ad",
    "Add",
    rec.campaignName,
    "", "", "", "", "", "", "",
    frAdGroup,
    "", "", "", "", "",
    "Responsive search ad",
    ...padArray(frHeads, 15),
    ...padArray(frDescs, 4),
    rec.finalUrl,
    rec.path1 ?? "",
    rec.path2 ?? "",
    "", "",
  ]);

  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\n");
}

/** Format CSV for Slack — truncated preview + full content in code block */
export function formatCsvForSlack(csv: string, campaignName: string): string {
  const lineCount = csv.split("\n").length - 1; // exclude header

  return [
    `*Google Ads Editor CSV ready — ${lineCount} rows*`,
    "",
    "Copy the CSV below and save as `.csv`, then import in Google Ads Editor:",
    "  1. Open Google Ads Editor",
    "  2. Account → Import → Paste text",
    "  3. Paste the CSV content",
    "  4. Review and post changes",
    "",
    "```",
    csv,
    "```",
  ].join("\n");
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function padArray(arr: string[], length: number): string[] {
  const result = [...arr];
  while (result.length < length) result.push("");
  return result;
}
