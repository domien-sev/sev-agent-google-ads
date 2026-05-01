async function main() {
  const res = await fetch("https://belvoir.be/nl-BE", { headers: { "User-Agent": "sev-ai/1.0", "Accept": "text/html" } });
  const html = await res.text();

  // Find all internal links
  const linkRegex = /href=["'](\/nl-BE\/[^"'#]+)["']/gi;
  const links = new Set<string>();
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    links.add(m[1]);
  }
  console.log(`Found ${links.size} nl-BE links:`);
  for (const l of Array.from(links).slice(0, 20)) {
    console.log(`  https://belvoir.be${l}`);
  }

  // Also try sitemap
  console.log("\nChecking sitemap...");
  try {
    const sitemapRes = await fetch("https://belvoir.be/sitemap.xml", { headers: { "User-Agent": "sev-ai/1.0" } });
    if (sitemapRes.ok) {
      const sitemapText = await sitemapRes.text();
      const urls = sitemapText.match(/<loc>([^<]+)<\/loc>/g)?.slice(0, 10) ?? [];
      for (const u of urls) console.log(`  ${u.replace(/<\/?loc>/g, "")}`);
    } else {
      console.log(`  Sitemap: ${sitemapRes.status}`);
    }
  } catch (e) { console.log("  Sitemap fetch failed"); }
}
main().catch(console.error);
