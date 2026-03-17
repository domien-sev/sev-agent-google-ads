/**
 * Shopping feed / Merchant Center helpers.
 * Queries Shopping-specific data from Google Ads.
 */
import type { GoogleAdsClient } from "@domien-sev/ads-sdk";

export interface ShoppingProduct {
  itemId: string;
  title: string;
  brand: string;
  category: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  roas: number;
}

/**
 * Get top performing Shopping products.
 */
export async function getTopShoppingProducts(
  client: GoogleAdsClient,
  days: number = 30,
  limit: number = 50,
): Promise<ShoppingProduct[]> {
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];

  const query = `
    SELECT
      segments.product_item_id,
      segments.product_title,
      segments.product_brand,
      segments.product_category_level1,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY metrics.conversions_value DESC
    LIMIT ${limit}
  `;

  const results = await client.query(query) as Array<{ results?: Array<Record<string, Record<string, string | number>>> }>;
  const products: ShoppingProduct[] = [];

  for (const batch of results) {
    for (const row of batch.results ?? []) {
      const cost = Number(row.metrics?.costMicros ?? 0) / 1_000_000;
      const revenue = Number(row.metrics?.conversionsValue ?? 0);

      products.push({
        itemId: String(row.segments?.productItemId ?? ""),
        title: String(row.segments?.productTitle ?? ""),
        brand: String(row.segments?.productBrand ?? ""),
        category: String(row.segments?.productCategoryLevel1 ?? ""),
        impressions: Number(row.metrics?.impressions ?? 0),
        clicks: Number(row.metrics?.clicks ?? 0),
        cost,
        conversions: Number(row.metrics?.conversions ?? 0),
        revenue,
        roas: cost > 0 ? revenue / cost : 0,
      });
    }
  }

  return products;
}

/**
 * Find Shopping products with no impressions (potential feed issues).
 */
export async function findZeroImpressionProducts(
  client: GoogleAdsClient,
  days: number = 14,
): Promise<string[]> {
  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];

  const query = `
    SELECT
      segments.product_item_id,
      segments.product_title,
      metrics.impressions
    FROM shopping_performance_view
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND metrics.impressions = 0
    LIMIT 100
  `;

  const results = await client.query(query) as Array<{ results?: Array<Record<string, Record<string, string | number>>> }>;
  const items: string[] = [];

  for (const batch of results) {
    for (const row of batch.results ?? []) {
      items.push(`${row.segments?.productItemId}: ${row.segments?.productTitle}`);
    }
  }

  return items;
}
