// Decimaly daily content automation
// Runs Prompt 1 (keyword research) -> Prompt 2/3 (article or tool spec) -> posts WP drafts.
// Requires env vars: ANTHROPIC_API_KEY, WP_URL, WP_USER, WP_APP_PASSWORD

import fs from "fs/promises";
import path from "path";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WP_URL = process.env.WP_URL;
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

const HISTORY_FILE = path.join(process.cwd(), "data", "keyword-history.json");
const MODEL = "claude-sonnet-4-6";

for (const [name, val] of Object.entries({ ANTHROPIC_API_KEY, WP_URL, WP_USER, WP_APP_PASSWORD })) {
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

async function callClaude(prompt, maxTokens = 4000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const textBlocks = data.content.filter((b) => b.type === "text").map((b) => b.text);
  return textBlocks.join("\n");
}

function extractJson(raw) {
  const cleaned = raw.replace(/```json\s*|```/g, "").trim();
  const start = cleaned.indexOf("[") !== -1 && cleaned.indexOf("[") < cleaned.indexOf("{")
    ? cleaned.indexOf("[")
    : cleaned.indexOf("{");
  const jsonSlice = cleaned.slice(start);
  return JSON.parse(jsonSlice);
}

async function loadHistory() {
  try {
    const raw = await fs.readFile(HISTORY_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveHistory(history) {
  const trimmed = history.slice(-300); // keep last ~300 keywords, roughly 60 days
  await fs.writeFile(HISTORY_FILE, JSON.stringify(trimmed, null, 2));
}

async function findKeywords(previousKeywords) {
  const prompt = `You are an SEO researcher for Decimaly, a free calculator website (decimaly.com)
covering finance, health, currency, and everyday-math tools. Existing tools:
VAT, SIP, compound interest, Zakat, currency converter, percentage, BMI,
ovulation, age, tip, temperature, scientific, length, water intake, GLP-1 cost,
time zone converter, profit margin.

Find 3 content opportunities for today, each meeting ALL of these:
1. Long-tail keyword (4+ words) with realistic monthly search volume 50-2,000
2. Low-to-medium competition (few strong, authoritative results on page 1;
   dominated by thin content, forums, or outdated pages)
3. Clear commercial or practical intent
4. Fits Decimaly's finance/health/everyday-calculation niche
5. NOT already covered by an existing Decimaly tool listed above

Do not repeat any of these previously used keywords: ${JSON.stringify(previousKeywords)}

Use web search to check current competing results before deciding low competition.

For each, return: keyword, search_intent, content_type ("article" or "tool"),
angle, competing_pages (array of {url, weakness}).

Respond with ONLY a JSON array, no preamble, no markdown fences.`;

  const raw = await callClaude(prompt, 4000);
  return extractJson(raw);
}

async function generateArticle(item) {
  const prompt = `You are a finance/health writer for Decimaly, a plain-spoken calculator
website. Write one blog article for the keyword: "${item.keyword}"

Search intent: ${item.search_intent}
Differentiating angle: ${item.angle}
Site voice: direct, practical, no fluff, explains the "why" behind numbers,
never salesy. Short paragraphs. Real-world examples with actual numbers.
Audience: everyday people checking a number before a decision, not professionals.

Requirements:
- 700-1000 words, unique phrasing throughout, no mirrored wording from any source
- Keyword naturally in H1, one H2, and first 100 words - no keyword stuffing
- Structure: H1, meta description (under 155 chars), intro, 2-4 H2 sections,
  a worked example with real numbers, closing line linking to a Decimaly
  calculator via placeholder [TOOL: tool-slug]
- Vary sentence length naturally
- No generic filler openers
- No invented statistics - only stable, well-known figures
- Add a one-line disclaimer if health/tax/legal-adjacent

Respond with ONLY this JSON, no preamble, no markdown fences:
{"title": "", "meta_description": "", "slug": "", "body_markdown": "", "target_tool_slug": ""}`;

  const raw = await callClaude(prompt, 4000);
  return extractJson(raw);
}

async function generateToolSpec(item) {
  const prompt = `You are a product designer for Decimaly. Spec a new calculator tool for
the keyword: "${item.keyword}"

Search intent: ${item.search_intent} / angle: ${item.angle}

Respond with ONLY this JSON, no preamble, no markdown fences:
{"tool_name": "", "slug": "", "one_line_pitch": "", "inputs": [], "formula": "", "output_fields": [], "companion_article_keyword": ""}`;

  const raw = await callClaude(prompt, 3000);
  return extractJson(raw);
}

function markdownToHtml(md) {
  // Minimal converter: WordPress accepts basic HTML in the content field.
  // For anything beyond headings/paragraphs/bold, swap this for a proper
  // markdown lib (e.g. `marked`) - left minimal here to avoid extra deps.
  return md
    .split("\n\n")
    .map((block) => {
      if (block.startsWith("# ")) return `<h1>${block.slice(2)}</h1>`;
      if (block.startsWith("## ")) return `<h2>${block.slice(3)}</h2>`;
      if (block.startsWith("### ")) return `<h3>${block.slice(4)}</h3>`;
      return `<p>${block.replace(/\n/g, " ")}</p>`;
    })
    .join("\n");
}

async function postWordPressDraft({ title, content, excerpt, slug, type = "posts" }) {
  const auth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString("base64");
  const res = await fetch(`${WP_URL}/wp-json/wp/v2/${type}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      title,
      content,
      excerpt,
      slug,
      status: "draft",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WordPress API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function main() {
  console.log("Loading keyword history...");
  const history = await loadHistory();
  const previousKeywords = history.map((h) => h.keyword);

  console.log("Finding today's keyword opportunities...");
  const opportunities = await findKeywords(previousKeywords);
  console.log(`Found ${opportunities.length} opportunities.`);

  const results = [];

  for (const item of opportunities) {
    try {
      if (item.content_type === "tool") {
        console.log(`Generating tool spec for: ${item.keyword}`);
        const spec = await generateToolSpec(item);
        // Tool specs are posted as a draft "note" post for you to review and
        // hand to a developer - WordPress can't auto-build the interactive
        // widget itself. Adjust `type` below if you add a custom post type
        // for tool specs.
        const html = `<pre>${JSON.stringify(spec, null, 2)}</pre>`;
        const wpResult = await postWordPressDraft({
          title: `[TOOL SPEC] ${spec.tool_name}`,
          content: html,
          excerpt: spec.one_line_pitch,
          slug: `tool-spec-${spec.slug}`,
        });
        console.log(`Draft tool spec created: ${wpResult.link}`);
      } else {
        console.log(`Generating article for: ${item.keyword}`);
        const article = await generateArticle(item);
        const html = markdownToHtml(article.body_markdown);
        const wpResult = await postWordPressDraft({
          title: article.title,
          content: html,
          excerpt: article.meta_description,
          slug: article.slug,
        });
        console.log(`Draft article created: ${wpResult.link}`);
      }
      results.push({ keyword: item.keyword, date: new Date().toISOString() });
    } catch (err) {
      console.error(`Failed on "${item.keyword}":`, err.message);
    }
  }

  await saveHistory([...history, ...results]);
  console.log("Done. Check WordPress > Posts > Drafts to review.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
