/**
 * Belvoir article-to-ad-copy generator.
 * Creates bilingual (NL/FR) Google Ads copy from article content
 * with Belvoir brand voice.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { BelvoirArticle, ArticleAdCopy } from "../types.js";

const anthropic = new Anthropic();

/**
 * Generate Google Ads copy from a Belvoir article.
 * Creates bilingual (NL + FR) headlines, descriptions, callouts, and display paths.
 */
export async function generateArticleCopy(article: BelvoirArticle): Promise<ArticleAdCopy> {
  const categoryLabels: Record<string, { nl: string; fr: string }> = {
    mode: { nl: "Mode", fr: "Mode" },
    schoonheid: { nl: "Schoonheid", fr: "Beauté" },
    welzijn: { nl: "Welzijn", fr: "Bien-être" },
    verkopen: { nl: "Sale", fr: "Soldes" },
  };

  const catLabel = categoryLabels[article.category] ?? { nl: article.category, fr: article.category };

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are an ad copywriter for Belvoir.be, a Belgian fashion, beauty, and lifestyle editorial platform.
Belvoir's tone is: sophisticated, editorial, approachable, trend-aware. NOT salesy or aggressive.
Target audience: style-conscious Belgian women 25-55 who want curated shopping advice.

Write Google Ads copy for this article:

Title: ${article.title_nl}
Category: ${catLabel.nl} / ${catLabel.fr}
Excerpt: ${article.excerpt_nl}
Tags: ${article.tags.join(", ")}
Brands mentioned: ${article.brands_mentioned.join(", ")}
URL: ${article.url}
Content preview: ${article.body_text.slice(0, 1500)}

Generate bilingual ad copy (NL = Dutch Belgium, FR = French Belgium):

Requirements:
- 15 headlines per language (STRICT max 30 characters each — count carefully)
- 4 descriptions per language (STRICT max 90 characters each)
- 4-6 callouts per language (STRICT max 25 characters each)
- path1, path2: URL display paths (max 15 chars each, relevant to article topic)

Headline tips:
- Mix article-specific headlines with Belvoir brand headlines
- Include brand names if mentioned in article
- Include CTAs: "Lees Meer", "Ontdek Nu", "Découvrez"
- Include category: "${catLabel.nl}" / "${catLabel.fr}"
- Keep editorial tone, not pushy sales language

Description tips:
- Summarize the article's value proposition
- Mention Belvoir.be as the source
- Include a soft CTA (Lees het volledige artikel, Découvrez l'article)

Callout tips:
- "Gratis Content", "Expert Advies", "Dagelijks Nieuw", "Trends ${new Date().getFullYear()}"
- FR: "Contenu Gratuit", "Conseils Experts", "Tendances ${new Date().getFullYear()}"

Respond with ONLY valid JSON:
{
  "nl": {
    "headlines": ["max 30 chars each, 15 items"],
    "descriptions": ["max 90 chars each, 4 items"],
    "callouts": ["max 25 chars each, 4-6 items"],
    "path1": "max 15 chars",
    "path2": "max 15 chars"
  },
  "fr": {
    "headlines": ["max 30 chars each, 15 items"],
    "descriptions": ["max 90 chars each, 4 items"],
    "callouts": ["max 25 chars each, 4-6 items"],
    "path1": "max 15 chars",
    "path2": "max 15 chars"
  }
}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse article ad copy — no JSON in response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as ArticleAdCopy;

  // Validate and enforce length limits
  for (const lang of ["nl", "fr"] as const) {
    parsed[lang].headlines = parsed[lang].headlines
      .filter((h) => h.length <= 30)
      .slice(0, 15);
    parsed[lang].descriptions = parsed[lang].descriptions
      .filter((d) => d.length <= 90)
      .slice(0, 4);
    parsed[lang].callouts = parsed[lang].callouts
      .filter((c) => c.length <= 25)
      .slice(0, 6);
    parsed[lang].path1 = (parsed[lang].path1 || "artikel").slice(0, 15);
    parsed[lang].path2 = (parsed[lang].path2 || catLabel[lang].toLowerCase()).slice(0, 15);
  }

  // Ensure minimum headline/description count
  if (parsed.nl.headlines.length < 3 || parsed.fr.headlines.length < 3) {
    throw new Error(`Too few valid headlines after filtering: NL=${parsed.nl.headlines.length}, FR=${parsed.fr.headlines.length}`);
  }
  if (parsed.nl.descriptions.length < 2 || parsed.fr.descriptions.length < 2) {
    throw new Error(`Too few valid descriptions after filtering: NL=${parsed.nl.descriptions.length}, FR=${parsed.fr.descriptions.length}`);
  }

  return parsed;
}
