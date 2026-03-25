/**
 * Ad Copy Memory — pgvector layer.
 * Stores confirmed ad copy as embeddings for semantic retrieval.
 * Syncs structured data to Directus ad_copy_library collection.
 */
import { createDirectusClient } from "@domien-sev/directus-sdk";

const DIRECTUS_URL = process.env.DIRECTUS_URL ?? "https://ops.shoppingeventvip.be";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN ?? "";
const PGVECTOR_URL = process.env.PGVECTOR_CONNECTION_STRING ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";

interface AdCopyEntry {
  brand: string;
  eventType: string;
  campaignType: string;
  language: string;
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  path1: string;
  path2: string;
  keywords?: Array<{ text: string; matchType: string }>;
  campaignName: string;
  eventDates?: string;
  feedbackApplied?: string[];
}

interface SimilarAd {
  brand: string;
  headlines: string[];
  descriptions: string[];
  finalUrl: string;
  campaignName: string;
  eventDates?: string;
  performanceScore?: number;
  similarity: number;
}

/**
 * Generate an embedding via OpenAI text-embedding-3-small.
 */
async function generateEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    console.warn("[ad-memory] No OPENAI_API_KEY — skipping embedding generation");
    return [];
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI embedding error: ${err}`);
  }

  const data = await response.json() as { data: Array<{ embedding: number[] }> };
  return data.data[0].embedding;
}

/**
 * Compose the text used for embedding from an ad copy entry.
 */
function composeEmbeddingText(entry: AdCopyEntry): string {
  const parts = [
    `Brand: ${entry.brand}`,
    `Type: ${entry.eventType}`,
    `Campaign: ${entry.campaignType}`,
    `Headlines: ${entry.headlines.join(", ")}`,
    `Descriptions: ${entry.descriptions.join(", ")}`,
  ];
  if (entry.eventDates) parts.push(`Event dates: ${entry.eventDates}`);
  if (entry.keywords?.length) {
    parts.push(`Keywords: ${entry.keywords.map(k => k.text).join(", ")}`);
  }
  return parts.join(" | ");
}

/**
 * Store confirmed ad copy to Directus + pgvector.
 * Non-fatal — returns true on success, false on failure.
 */
export async function storeAdCopy(entry: AdCopyEntry): Promise<boolean> {
  try {
    // 1. Save to Directus ad_copy_library
    const directusResponse = await fetch(`${DIRECTUS_URL}/items/ad_copy_library`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DIRECTUS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        brand: entry.brand,
        event_type: entry.eventType,
        campaign_type: entry.campaignType,
        language: entry.language,
        headlines: entry.headlines,
        descriptions: entry.descriptions,
        final_url: entry.finalUrl,
        path1: entry.path1,
        path2: entry.path2,
        keywords: entry.keywords,
        campaign_name: entry.campaignName,
        event_dates: entry.eventDates,
        feedback_applied: entry.feedbackApplied,
        status: "active",
      }),
    });

    if (!directusResponse.ok) {
      console.error("[ad-memory] Directus save failed:", await directusResponse.text());
      return false;
    }

    const directusData = await directusResponse.json() as { data: { id: string } };
    const recordId = directusData.data.id;

    // 2. Generate embedding and store in pgvector
    if (PGVECTOR_URL) {
      const text = composeEmbeddingText(entry);
      const embedding = await generateEmbedding(text);

      if (embedding.length > 0) {
        // Use the pgvector find_similar function's table directly
        // Insert into embeddings table
        const pg = await import("pg");
        const client = new pg.default.Client({ connectionString: PGVECTOR_URL });
        await client.connect();

        try {
          await client.query(
            `INSERT INTO embeddings (source_collection, source_id, content, embedding, metadata)
             VALUES ($1, $2, $3, $4::vector, $5)
             ON CONFLICT (source_collection, source_id) DO UPDATE
             SET content = $3, embedding = $4::vector, metadata = $5`,
            [
              "ad_copy_library",
              recordId,
              text,
              `[${embedding.join(",")}]`,
              JSON.stringify({
                brand: entry.brand,
                event_type: entry.eventType,
                campaign_type: entry.campaignType,
                language: entry.language,
              }),
            ],
          );
          console.log(`[ad-memory] Stored ad copy for "${entry.brand}" (${recordId})`);
        } finally {
          await client.end();
        }
      }
    } else {
      console.warn("[ad-memory] No PGVECTOR_CONNECTION_STRING — saved to Directus only");
    }

    return true;
  } catch (err) {
    console.error("[ad-memory] Store failed:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * Retrieve similar past ads via pgvector semantic search.
 * Falls back to Directus text search if pgvector is unavailable.
 */
export async function retrieveSimilarAds(
  brand: string,
  eventType: string,
  campaignType: string,
  limit = 3,
): Promise<SimilarAd[]> {
  // Try pgvector first
  if (PGVECTOR_URL && OPENAI_API_KEY) {
    try {
      const queryText = `Brand: ${brand} | Type: ${eventType} | Campaign: ${campaignType}`;
      const embedding = await generateEmbedding(queryText);

      if (embedding.length > 0) {
        const pg = await import("pg");
        const client = new pg.default.Client({ connectionString: PGVECTOR_URL });
        await client.connect();

        try {
          const result = await client.query(
            `SELECT source_id, content, 1 - (embedding <=> $1::vector) as similarity, metadata
             FROM embeddings
             WHERE source_collection = 'ad_copy_library'
               AND 1 - (embedding <=> $1::vector) > 0.5
             ORDER BY embedding <=> $1::vector
             LIMIT $2`,
            [`[${embedding.join(",")}]`, limit],
          );

          if (result.rows.length > 0) {
            // Fetch full records from Directus
            const ids = result.rows.map((r: any) => r.source_id);
            const similarityMap = new Map(result.rows.map((r: any) => [r.source_id, r.similarity]));

            const directusResponse = await fetch(
              `${DIRECTUS_URL}/items/ad_copy_library?filter[id][_in]=${ids.join(",")}&sort=-performance_score`,
              { headers: { "Authorization": `Bearer ${DIRECTUS_TOKEN}` } },
            );

            if (directusResponse.ok) {
              const data = await directusResponse.json() as { data: Array<Record<string, any>> };
              return data.data.map((d) => ({
                brand: d.brand,
                headlines: d.headlines ?? [],
                descriptions: d.descriptions ?? [],
                finalUrl: d.final_url ?? "",
                campaignName: d.campaign_name ?? "",
                eventDates: d.event_dates,
                performanceScore: d.performance_score,
                similarity: Number(similarityMap.get(d.id) ?? 0),
              }));
            }
          }
        } finally {
          await client.end();
        }
      }
    } catch (err) {
      console.warn("[ad-memory] pgvector retrieval failed, falling back to Directus:", err instanceof Error ? err.message : String(err));
    }
  }

  // Fallback: Directus text search
  try {
    const filters = [`filter[status][_eq]=active`];
    if (brand) filters.push(`filter[brand][_contains]=${encodeURIComponent(brand)}`);
    if (campaignType) filters.push(`filter[campaign_type][_eq]=${campaignType}`);

    const directusResponse = await fetch(
      `${DIRECTUS_URL}/items/ad_copy_library?${filters.join("&")}&sort=-performance_score,-date_created&limit=${limit}`,
      { headers: { "Authorization": `Bearer ${DIRECTUS_TOKEN}` } },
    );

    if (directusResponse.ok) {
      const data = await directusResponse.json() as { data: Array<Record<string, any>> };
      return data.data.map((d) => ({
        brand: d.brand,
        headlines: d.headlines ?? [],
        descriptions: d.descriptions ?? [],
        finalUrl: d.final_url ?? "",
        campaignName: d.campaign_name ?? "",
        eventDates: d.event_dates,
        performanceScore: d.performance_score,
        similarity: 1.0,
      }));
    }
  } catch (err) {
    console.warn("[ad-memory] Directus fallback failed:", err instanceof Error ? err.message : String(err));
  }

  return [];
}

/**
 * Format similar ads as context for the AI prompt.
 */
export function formatAdsForPrompt(ads: SimilarAd[]): string {
  if (ads.length === 0) return "";

  const sections = ads.map((ad, i) => {
    const lines = [
      `--- Past Ad ${i + 1}: ${ad.campaignName} ---`,
      `Brand: ${ad.brand}`,
      ad.eventDates ? `Event: ${ad.eventDates}` : null,
      ad.performanceScore ? `Performance score: ${ad.performanceScore.toFixed(2)}` : null,
      `Headlines: ${ad.headlines.map(h => `"${h}"`).join(", ")}`,
      `Descriptions: ${ad.descriptions.map(d => `"${d}"`).join(", ")}`,
      `URL: ${ad.finalUrl}`,
    ];
    return lines.filter(Boolean).join("\n");
  });

  return [
    "PROVEN AD COPY (from past campaigns — learn from these, adapt the best patterns):",
    ...sections,
  ].join("\n\n");
}

/**
 * Extract brand name from a campaign name.
 * e.g. "260325_MarieMero_BE" → "Marie Mero"
 */
export function extractBrand(campaignName: string): string {
  // Remove date prefix (YYMMDD_) and location suffix (_BE, _NL)
  const cleaned = campaignName
    .replace(/^\d{6}_/, "")
    .replace(/_(?:BE|NL|FR|EU)$/i, "")
    .replace(/_/g, " ");

  // Add spaces before capitals (CamelCase → separate words)
  return cleaned.replace(/([a-z])([A-Z])/g, "$1 $2");
}
