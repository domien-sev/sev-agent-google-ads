/**
 * Brand Knowledge — Onyx RAG layer.
 * Retrieves brand briefs, event playbooks, and creative guidelines
 * from the Onyx knowledge store for richer AI ad generation.
 *
 * Onyx runs on a separate server. From the ops server, we access it
 * via internal IP (http://5.75.176.204:3000/api/) to bypass Cloudflare.
 */

const ONYX_API_URL = process.env.ONYX_API_URL ?? "http://5.75.176.204:3000";
const ONYX_API_KEY = process.env.ONYX_API_KEY ?? "";

interface OnyxSearchResult {
  document_id: string;
  semantic_identifier: string;
  blurb: string;
  content: string;
  source_type: string;
  score: number;
  link?: string;
}

/**
 * Check if Onyx is configured and reachable.
 */
export function isOnyxConfigured(): boolean {
  return ONYX_API_KEY.length > 0;
}

/**
 * Search Onyx for relevant brand/event knowledge.
 */
async function searchOnyx(query: string, limit = 5): Promise<OnyxSearchResult[]> {
  if (!isOnyxConfigured()) return [];

  try {
    const response = await fetch(`${ONYX_API_URL}/api/search/send-search-message`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ONYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        search_query: query,
        filters: {},
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`[brand-knowledge] Onyx returned ${response.status}`);
      return [];
    }

    const raw = await response.text();

    // Onyx may return newline-delimited JSON (streaming) or a single JSON object
    const lines = raw.trim().split("\n");
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.search_docs) {
          return obj.search_docs
            .filter((d: any) => d.score > 0.5)
            .slice(0, limit)
            .map((d: any) => ({
              document_id: d.document_id ?? "",
              semantic_identifier: d.semantic_identifier ?? "",
              blurb: d.blurb ?? "",
              content: d.content ?? d.blurb ?? "",
              source_type: d.source_type ?? "",
              score: d.score ?? 0,
              link: d.link,
            }));
        }
      } catch { /* try next line */ }
    }

    // Try parsing as single JSON
    try {
      const data = JSON.parse(raw);
      const docs = data.search_docs ?? data.top_documents ?? [];
      return docs
        .filter((d: any) => d.score > 0.5)
        .slice(0, limit)
        .map((d: any) => ({
          document_id: d.document_id ?? "",
          semantic_identifier: d.semantic_identifier ?? "",
          blurb: d.blurb ?? "",
          content: d.content ?? d.blurb ?? "",
          source_type: d.source_type ?? "",
          score: d.score ?? 0,
          link: d.link,
        }));
    } catch {
      return [];
    }
  } catch (err) {
    console.warn("[brand-knowledge] Onyx search failed:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * Search for brand-specific knowledge (brief, tone, USPs, target audience).
 */
export async function searchBrandContext(
  brand: string,
  eventType?: string,
  campaignType?: string,
): Promise<string> {
  const queries = [
    `${brand} brand guidelines tone voice target audience`,
    `${brand} ${eventType ?? "event"} campaign advertising`,
  ];

  const allResults: OnyxSearchResult[] = [];
  const seenDocs = new Set<string>();

  for (const query of queries) {
    const results = await searchOnyx(query, 3);
    for (const result of results) {
      if (!seenDocs.has(result.document_id)) {
        seenDocs.add(result.document_id);
        allResults.push(result);
      }
    }
  }

  if (allResults.length === 0) return "";

  // Format for AI prompt
  const sections = allResults.slice(0, 5).map((r) => {
    const content = r.blurb.length > 500 ? r.blurb.slice(0, 500) + "..." : r.blurb;
    return `[${r.semantic_identifier}] (relevance: ${r.score.toFixed(2)})\n${content}`;
  });

  return [
    "BRAND KNOWLEDGE (from company knowledge base — use to inform tone, USPs, and targeting):",
    ...sections,
  ].join("\n\n");
}

/**
 * Search for event-specific knowledge (physical vs online playbooks, what works).
 */
export async function searchEventContext(
  eventType: string,
  brand?: string,
): Promise<string> {
  const query = brand
    ? `${brand} ${eventType} event sale campaign strategy`
    : `${eventType} event sale campaign strategy guidelines`;

  const results = await searchOnyx(query, 3);

  if (results.length === 0) return "";

  const sections = results.map((r) => {
    const content = r.blurb.length > 400 ? r.blurb.slice(0, 400) + "..." : r.blurb;
    return `[${r.semantic_identifier}]\n${content}`;
  });

  return [
    "EVENT PLAYBOOK (from company knowledge base — use to inform campaign strategy):",
    ...sections,
  ].join("\n\n");
}

/**
 * Ingest a brand document into Onyx for future retrieval.
 */
export async function ingestBrandDoc(
  title: string,
  content: string,
  sourceType = "brand_brief",
  metadata: Record<string, unknown> = {},
): Promise<{ documentId: string } | null> {
  if (!isOnyxConfigured()) {
    console.warn("[brand-knowledge] Onyx not configured — cannot ingest");
    return null;
  }

  try {
    const response = await fetch(`${ONYX_API_URL}/api/onyx-api/ingestion`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ONYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        document: {
          title,
          sections: [{ text: content }],
          source: sourceType,
          metadata: { ...metadata, ingested_by: "sev-agent-google-ads" },
          semantic_identifier: title,
        },
      }),
    });

    if (!response.ok) {
      console.error("[brand-knowledge] Ingestion failed:", await response.text());
      return null;
    }

    const data = await response.json() as { document_id?: string };
    console.log(`[brand-knowledge] Ingested "${title}" → ${data.document_id}`);
    return { documentId: data.document_id ?? "" };
  } catch (err) {
    console.error("[brand-knowledge] Ingestion error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
