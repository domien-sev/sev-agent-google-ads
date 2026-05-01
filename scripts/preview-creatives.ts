import { fetchBelvoirArticle } from "../src/tools/belvoir-article.js";
import { generateArticleCopy } from "../src/tools/article-copy.js";
import { extractArticleKeywords } from "../src/tools/article-keywords.js";

async function main() {
  const url = "https://belvoir.be/nl-BE/blog/lentejassen-trends-2026";
  console.log(`Fetching article: ${url}\n`);
  const article = await fetchBelvoirArticle(url);
  console.log(`Title: ${article.title_nl}`);
  console.log(`Category: ${article.category}`);
  console.log(`Brands: ${article.brands_mentioned.slice(0, 10).join(", ")}`);
  console.log(`Affiliate links: ${article.affiliate_links.length}\n`);

  console.log("Generating ad copy...\n");
  const copy = await generateArticleCopy(article);

  for (const lang of ["nl", "fr"] as const) {
    const label = lang === "nl" ? "DUTCH (NL)" : "FRENCH (FR)";
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  ${label}`);
    console.log(`${"=".repeat(60)}\n`);

    console.log("HEADLINES (max 30 chars each):");
    for (const [i, h] of copy[lang].headlines.entries()) {
      const len = h.length;
      const warn = len > 30 ? " ⚠️ TOO LONG" : "";
      console.log(`  ${String(i + 1).padStart(2)}. "${h}" (${len} chars)${warn}`);
    }

    console.log("\nDESCRIPTIONS (max 90 chars each):");
    for (const [i, d] of copy[lang].descriptions.entries()) {
      const len = d.length;
      const warn = len > 90 ? " ⚠️ TOO LONG" : "";
      console.log(`  ${i + 1}. "${d}" (${len} chars)${warn}`);
    }

    console.log("\nCALLOUTS (max 25 chars each):");
    for (const c of copy[lang].callouts) {
      console.log(`  • "${c}" (${c.length} chars)`);
    }

    console.log(`\nDISPLAY PATH: belvoir.be/${copy[lang].path1}/${copy[lang].path2}`);
  }

  console.log("\n\nExtracting keywords (NL)...\n");
  const kwNl = await extractArticleKeywords(article, "nl");
  console.log("NL KEYWORDS:");
  for (const k of kwNl.enriched) {
    console.log(`  [${k.group}] "${k.text}" (${k.matchType})`);
  }

  console.log("\n\nExtracting keywords (FR)...\n");
  const kwFr = await extractArticleKeywords(article, "fr");
  console.log("FR KEYWORDS:");
  for (const k of kwFr.enriched) {
    console.log(`  [${k.group}] "${k.text}" (${k.matchType})`);
  }
}

main().catch(console.error);
