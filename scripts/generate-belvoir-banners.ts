/**
 * Generate Belvoir ad banners using GPT-5 Image.
 * Creates proper display ads with headlines, CTAs, branding, and visual hooks.
 */

import { fetchBelvoirArticle } from "../src/tools/belvoir-article.js";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const OPENAI_IMAGE_API_KEY = process.env.OPENAI_IMAGE_API_KEY
  || (() => {
    try {
      const env = readFileSync("C:/Dev/sev-ai-collaborative-setup/sev-ai-core/.env", "utf8");
      return env.match(/OPENAI_IMAGE_API_KEY=(.+)/)?.[1]?.trim();
    } catch { return undefined; }
  })();

if (!OPENAI_IMAGE_API_KEY) {
  console.error("OPENAI_IMAGE_API_KEY not found");
  process.exit(1);
}

async function generateImage(prompt: string, aspectRatio: string): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_IMAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5-image",
      messages: [{ role: "user", content: prompt }],
      image_config: {
        aspect_ratio: aspectRatio,
        image_size: "2K",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GPT-5 Image error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json() as any;
  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageUrl) {
    throw new Error(`No image in response: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return imageUrl;
}

async function saveImage(url: string, path: string): Promise<void> {
  if (url.startsWith("data:image/")) {
    const base64 = url.split(",")[1];
    writeFileSync(path, Buffer.from(base64, "base64"));
    return;
  }
  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(path, buffer);
}

const BRAND_BRIEF = `
BRAND: Belvoir.be
IDENTITY: Premium Belgian fashion & lifestyle editorial platform
COLORS: Deep brown #191307 (primary text/accents), warm beige #EBE5DF (surface), off-white #F5F3EF (background)
FONTS: Lora serif (headings — elegant, editorial), Instrument Sans (body — clean, modern)
LOGO: "Belvoir" in elegant serif lowercase, can use "belvoir.be" as URL
TONE: Sophisticated, editorial, curated — like a high-end fashion magazine
`;

interface BannerSpec {
  filename: string;
  aspectRatio: string;
  concept: string;
}

async function main() {
  const url = process.argv[2] || "https://belvoir.be/nl-BE/blog/lentejassen-trends-2026";
  console.log(`Fetching: ${url}\n`);
  const article = await fetchBelvoirArticle(url);
  console.log(`"${article.title_nl}" — ${article.category}\n`);

  const outDir = resolve(process.cwd(), ".tmp/belvoir-banners");
  mkdirSync(outDir, { recursive: true });

  const banners: BannerSpec[] = [
    // --- NL variants ---
    {
      filename: "nl_landscape_editorial",
      aspectRatio: "16:9",
      concept: `Design a Google Display Ad banner (landscape 1200x628).

HEADLINE (large, bold serif): "Jassentrends Lente 2026"
SUBLINE (smaller): "De 5 silhouetten die iedereen draagt"
CTA BUTTON: "Ontdek Meer →" (dark brown button with white text)
BRANDING: "belvoir.be" bottom-right corner, small and elegant

LAYOUT: Left 60% = fashion photography of a woman in a modern trench coat on a European street, warm spring light. Right 40% = clean beige/off-white area with the headline text, subline, and CTA stacked vertically.

${BRAND_BRIEF}

This must look like a DESIGNED AD BANNER, not a photo. Professional graphic design with intentional typography, clear visual hierarchy, and a clickable CTA button.`,
    },
    {
      filename: "nl_square_bold",
      aspectRatio: "1:1",
      concept: `Design a Google Display Ad banner (square 1080x1080).

HEADLINE (large, bold serif, centered): "De Populairste Jassentrends"
SUBLINE: "Voorjaar 2026"
CTA: "Lees Nu op Belvoir.be"

LAYOUT: Top 55% = striking fashion image of spring jackets (trench, suede, denim) in editorial style. Bottom 45% = warm beige (#EBE5DF) panel with headline in dark brown (#191307), subline below, CTA at bottom.

${BRAND_BRIEF}

This must look like a professional DISPLAY AD — clean graphic design, magazine-quality, not just a photo. Bold typography that demands attention.`,
    },
    {
      filename: "nl_portrait_cta",
      aspectRatio: "4:5",
      concept: `Design a Google Display Ad banner (portrait 1080x1350).

HEADLINE (large serif): "5 Jassen Die Je Nu Nodig Hebt"
SUBLINE: "Trends Voorjaar 2026"
CTA BUTTON: "Ontdek Alles →"
BRANDING: "belvoir.be" at bottom

LAYOUT: Full-bleed fashion editorial photo top 65% (women in stylish spring jackets, urban European setting). Bottom 35% = solid dark brown (#191307) panel with white headline text, beige subline, and a warm beige CTA button.

${BRAND_BRIEF}

Professional ad design. Bold contrast between the photo and the dark text panel. Typography must be crisp and readable.`,
    },
    // --- FR variant ---
    {
      filename: "fr_landscape_editorial",
      aspectRatio: "16:9",
      concept: `Design a Google Display Ad banner (landscape 1200x628).

HEADLINE (large, bold serif): "Tendances Vestes Printemps 2026"
SUBLINE (smaller): "Les 5 silhouettes que tout le monde porte"
CTA BUTTON: "Découvrez →" (dark brown button with white text)
BRANDING: "belvoir.be" bottom-right corner

LAYOUT: Left 60% = fashion photography of a stylish woman in a suede spring jacket, warm Parisian street. Right 40% = off-white (#F5F3EF) area with headline, subline, and CTA stacked.

${BRAND_BRIEF}

Professional DISPLAY AD design with intentional typography and clear visual hierarchy. Not just a photo — a designed banner.`,
    },
  ];

  for (const banner of banners) {
    console.log(`Generating: ${banner.filename} (${banner.aspectRatio})...`);
    try {
      const imageUrl = await generateImage(banner.concept, banner.aspectRatio);
      const filePath = resolve(outDir, `${banner.filename}.png`);
      await saveImage(imageUrl, filePath);
      console.log(`  ✓ Saved: ${filePath}\n`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}\n`);
    }
  }

  console.log(`\nAll banners saved to: ${outDir}`);
}

main().catch(console.error);
