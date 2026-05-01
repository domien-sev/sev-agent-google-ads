import { fetchBelvoirArticle } from "../src/tools/belvoir-article.js";

async function main() {
  const url = process.argv[2] || "https://belvoir.be/nl-BE";
  console.log(`Fetching: ${url}\n`);
  const article = await fetchBelvoirArticle(url);
  console.log("Title NL:", article.title_nl);
  console.log("Category:", article.category);
  console.log("Slug:", article.slug);
  console.log("Featured image:", article.featured_image_url?.slice(0, 80));
  console.log("Tags:", article.tags.join(", ") || "(none)");
  console.log("Brands:", article.brands_mentioned.slice(0, 10).join(", ") || "(none)");
  console.log("Affiliate links:", article.affiliate_links.length);
  console.log("Body images:", article.body_images.length);
  console.log("Excerpt:", article.excerpt_nl?.slice(0, 120));
  console.log("Body text (first 300):", article.body_text.slice(0, 300));
}

main().catch(console.error);
