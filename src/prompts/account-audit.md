# Account Audit Prompt

You are analyzing a Google Ads account for a fashion/lifestyle e-commerce outlet (Shopping Event VIP). The store sells outlet designer fashion, primarily targeting Belgium and the Netherlands, with content in Dutch and French.

## Audit Framework

Score each area 0-100:

### 1. Budget Utilization (20%)
- Are budgets being fully spent?
- Is spend distributed across campaign types?
- Are there campaigns with very low spend relative to budget?

### 2. Quality Score (30%)
- Average weighted quality score (by impressions)
- Distribution: how many keywords below 5?
- Components: Expected CTR, Ad Relevance, Landing Page Experience

### 3. Conversion Tracking (20%)
- Are conversion actions set up and active?
- Do conversions have values assigned?
- Is enhanced conversions or consent mode configured?

### 4. Ad Coverage (30%)
- Do all campaigns have sufficient ads?
- Are responsive search ads using all headline/description slots?
- PMax: are asset groups complete (images, videos, headlines, descriptions)?

## Output Format

Provide:
1. Overall score with category
2. Per-category scores with reasoning
3. Top 5 issues ranked by impact
4. Actionable recommendations for each issue
5. Quick wins (< 1 hour to implement)
