/**
 * Generate visual creatives for a Belvoir article using Flux 2 Pro.
 * Produces display banners in 3 formats: landscape (1.91:1), square (1:1), portrait (4:5).
 *
 * Usage: npx tsx --require dotenv/config scripts/generate-belvoir-visuals.ts
 * Requires FLUX_API_KEY in .env (or sourced from sev-ai-core/.env)
 */

import { fetchBelvoirArticle } from "../src/tools/belvoir-article.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Load Flux API key from sev-ai-core/.env if not in local .env
const FLUX_API_KEY = process.env.FLUX_API_KEY
  || (() => {
    try {
      const coreEnv = readFileSync("C:/Dev/sev-ai-collaborative-setup/sev-ai-core/.env", "utf8");
      const match = coreEnv.match(/FLUX_API_KEY=(.+)/);
      return match?.[1]?.trim();
    } catch { return undefined; }
  })();

if (!FLUX_API_KEY) {
  console.error("FLUX_API_KEY not found. Set it in .env or sev-ai-core/.env");
  process.exit(1);
}

// Belvoir brand styling for prompts
const BELVOIR_STYLE = `
Brand: Belvoir.be — Belgian fashion, beauty, and lifestyle editorial platform.
Color palette: deep brown (#191307) as primary, warm beige (#EBE5DF) surface, off-white (#F5F3EF) background.
Typography: Lora serif for headings, Instrument Sans for body.
Aesthetic: sophisticated, editorial, warm, magazine-quality. Clean and modern with European fashion sensibility.
`.trim();

interface VisualSpec {
  label: string;
  aspectRatio: string;
  width: number;
  height: number;
  promptSuffix: string;
}

const FORMATS: VisualSpec[] = [
  {
    label: "landscape_1.91x1",
    aspectRatio: "16:9",
    width: 1200,
    height: 628,
    promptSuffix: "Horizontal landscape banner format. Text overlay area on the left or right third.",
  },
  {
    label: "square_1x1",
    aspectRatio: "1:1",
    width: 1080,
    height: 1080,
    promptSuffix: "Square format. Balanced composition with room for text overlay at top or bottom.",
  },
  {
    label: "portrait_4x5",
    aspectRatio: "4:5",
    width: 1080,
    height: 1350,
    promptSuffix: "Vertical portrait format. Main visual in upper two-thirds, text area at bottom.",
  },
];

async function generateImage(prompt: string, aspectRatio: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLUX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "black-forest-labs/flux.2-pro",
      messages: [{ role: "user", content: prompt }],
      image_config: {
        aspect_ratio: aspectRatio,
        image_size: "1K",
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Flux API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as any;
  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageUrl) {
    throw new Error(`No image in response: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return imageUrl;
}

async function downloadImage(url: string, path: string): Promise<void> {
  // Handle base64 data URLs
  if (url.startsWith("data:image/")) {
    const base64 = url.split(",")[1];
    writeFileSync(path, Buffer.from(base64, "base64"));
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, buffer);
}

async function main() {
  const url = process.argv[2] || "https://belvoir.be/nl-BE/blog/lentejassen-trends-2026";
  console.log(`Fetching article: ${url}\n`);
  const article = await fetchBelvoirArticle(url);

  console.log(`Title: ${article.title_nl}`);
  console.log(`Category: ${article.category}`);
  console.log(`Featured image: ${article.featured_image_url?.slice(0, 60) || "(none)"}`);
  console.log(`Brands: ${article.brands_mentioned.slice(0, 5).join(", ")}\n`);

  // Create output directory
  const outDir = resolve(process.cwd(), ".tmp/belvoir-creatives");
  mkdirSync(outDir, { recursive: true });

  // Build prompts based on article content
  const basePrompt = `Create a high-end fashion editorial advertisement banner for an article titled "${article.title_nl}".
The article is about spring 2026 jacket trends including trench coats, suede jackets, and denim jackets.
Featured brands: ${article.brands_mentioned.slice(0, 5).join(", ")}.

${BELVOIR_STYLE}

Style: Magazine-quality fashion photography of stylish women wearing spring jackets in an urban European setting.
The image should feel editorial and aspirational, not like a product catalog.
NO text overlays — clean photographic image only (text will be added as Google Ads overlay).
Warm spring lighting, muted earth tones matching the brand palette.`;

  for (const format of FORMATS) {
    console.log(`\nGenerating ${format.label} (${format.aspectRatio})...`);
    const prompt = `${basePrompt}\n\n${format.promptSuffix}`;

    try {
      const imageUrl = await generateImage(prompt, format.aspectRatio);
      const filePath = resolve(outDir, `belvoir_lentejassen_${format.label}.png`);
      await downloadImage(imageUrl, filePath);
      console.log(`  Saved: ${filePath}`);
    } catch (err) {
      console.error(`  Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nAll visuals saved to: ${outDir}`);
}

main().catch(console.error);
