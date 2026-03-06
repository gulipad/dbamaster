import { createCapTool } from '../utils/schema-helpers';
import { fetchViaJina, normalizeUrl } from '../utils/jina';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { emitProgress } from '../config/progress';

const llm = google('gemini-3.1-flash-lite-preview');

// Pages above this size use regex extraction instead of an LLM call
const REGEX_FALLBACK_CHARS = 200_000;

// ---------------------------------------------------------------------------
// Regex fallback for huge pages
// ---------------------------------------------------------------------------

const ENTITY_SUFFIX =
  '(?:LLC|Inc\\.?|Corp\\.?|Corporation|L\\.?P\\.?|LLP|Ltd\\.?|Co\\.?|Company|Group|Holdings|Enterprises|Partners|Associates|International|Services|Solutions|Technologies)';
const ENTITY_NAME = `[A-Z][A-Za-z0-9&',\\.\\- ]{2,}${ENTITY_SUFFIX}`;

const REGEX_PATTERNS = [
  new RegExp(`operated\\s+by\\s+(?<entity>${ENTITY_NAME})`, 'g'),
  new RegExp(
    `(?:a\\s+)?subsidiary\\s+of\\s+(?<entity>${ENTITY_NAME})`,
    'gi'
  ),
  new RegExp(
    `(?:©|copyright)\\s*(?:\\d{4}[–\\-]?)?\\s*(?:\\d{4})?\\s*(?<entity>${ENTITY_NAME})`,
    'gi'
  ),
  new RegExp(
    `(?:privacy\\s+(?:policy|notice)|terms\\s+(?:of\\s+(?:service|use))?)\\s+(?:for|of|by)\\s+(?<entity>${ENTITY_NAME})`,
    'gi'
  ),
  new RegExp(
    `(?<entity>${ENTITY_NAME})\\s*\\(?\\s*(?:d\\.?b\\.?a\\.?|doing\\s+business\\s+as)`,
    'gi'
  ),
  new RegExp(`[""\u201c](?<entity>${ENTITY_NAME})[""\u201d,]`, 'g'),
];

interface Finding {
  legalEntityName: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
  source: string;
}

function extractEntitiesViaRegex(text: string, source: string): Finding[] {
  const results: Finding[] = [];
  const seen = new Set<string>();

  for (const pattern of REGEX_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const entity = match.groups?.entity?.trim();
      if (!entity || entity.length <= 3) continue;
      const key = entity.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const start = Math.max(0, match.index - 100);
      const end = Math.min(text.length, match.index + match[0].length + 100);
      const evidence = text.slice(start, end).replace(/\s+/g, ' ').trim();

      results.push({
        legalEntityName: entity,
        confidence: 'medium',
        evidence,
        source,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// LLM: extract legal entity from a page
// ---------------------------------------------------------------------------

const entityExtractionSchema = z.object({
  entities: z
    .array(
      z.object({
        legalEntityName: z
          .string()
          .describe('The legal entity name (e.g. "Acme Holdings LLC")'),
        confidence: z
          .enum(['high', 'medium', 'low'])
          .describe('How confident you are this is the correct legal entity'),
        evidence: z
          .string()
          .describe(
            'The exact sentence or phrase where you found the entity name'
          ),
      })
    )
    .describe(
      'All legal entity names found on the page. Empty array if none found.'
    ),
});

async function extractEntitiesFromPage(
  pageContent: string,
  dba: string,
  sourceUrl: string
): Promise<Finding[]> {
  // Huge pages: fall back to regex instead of sending to LLM
  if (pageContent.length > REGEX_FALLBACK_CHARS) {
    emitProgress(`[extract] ${sourceUrl} — too large (${pageContent.length.toLocaleString()} chars), using regex`);
    const results = extractEntitiesViaRegex(pageContent, sourceUrl);
    emitProgress(`[extract] ${sourceUrl} — regex found ${results.length} candidate(s)`);
    return results;
  }

  try {
    const { object } = await generateObject({
      model: llm,
      schema: entityExtractionSchema,
      prompt: `You are analyzing a web page to find the legal entity that OWNS or OPERATES this website.
${dba ? `\nThe business operates under the name (DBA): "${dba}"` : ''}
The page URL is: ${sourceUrl}

You are looking for the registered company name (e.g. "Acme Holdings LLC") that owns this website.
It typically appears in contexts like:
- "operated by [Entity]" or "provided by [Entity]"
- "© 2024 [Entity]" in the footer
- "This privacy policy for [Entity]"
- "[Entity] (doing business as ...)"
- "[Entity], a Delaware limited liability company"

CRITICAL RULES:
- Only return entities that the page identifies as the OWNER or OPERATOR of this website/service
- The surrounding context must make it clear this entity runs the business — not just that it's mentioned
- IGNORE: customer names, partner logos, testimonials, case studies, integrations, news mentions, investor names
- IGNORE: brand names without a legal suffix (LLC, Inc, Corp, Ltd, LP, LLP, etc.)
- If you're not sure whether an entity owns the site, do NOT include it
- Confidence "high" = the page explicitly says this entity owns/operates the site
- Confidence "medium" = strong signal (copyright line, legal page header) but not explicitly stated
- Confidence "low" = plausible but ambiguous

Return an empty array if nothing clearly qualifies.

Page content:
${pageContent}`,
    });

    emitProgress(`[extract] ${sourceUrl} — LLM found ${object.entities.length} candidate(s)`);
    return object.entities.map((e) => ({
      ...e,
      source: sourceUrl,
    }));
  } catch (err) {
    emitProgress(`[extract] ${sourceUrl} — LLM failed, falling back to regex: ${err}`);
    return extractEntitiesViaRegex(pageContent, sourceUrl);
  }
}

// ---------------------------------------------------------------------------
// LLM: pick which links are worth exploring
// ---------------------------------------------------------------------------

const linkSelectionSchema = z.object({
  urls: z
    .array(z.string())
    .describe(
      'URLs most likely to contain the legal entity name, ordered by likelihood. Max 4.'
    ),
});

async function pickLinksToExplore(
  allLinks: string[],
  dba: string
): Promise<string[]> {
  if (allLinks.length === 0) return [];

  try {
    const { object } = await generateObject({
      model: llm,
      schema: linkSelectionSchema,
      prompt: `You are helping find the legal entity behind a business${dba ? ` called "${dba}"` : ''}.

Below is a list of links found on their website. Pick up to 4 URLs that are most likely to contain the company's legal entity name. Prioritize:
1. Privacy policy pages (almost always name the legal entity)
2. Terms of service / terms of use pages
3. Legal / imprint pages
4. About pages

Only return URLs from the list below. If none look relevant, return an empty array.

Links:
${allLinks.map((url) => `- ${url}`).join('\n')}`,
    });
    return object.urls;
  } catch {
    return allLinks.slice(0, 4);
  }
}

// ---------------------------------------------------------------------------
// The tool
// ---------------------------------------------------------------------------

export const websiteLegalEntityTool = createCapTool({
  id: 'website-legal-entity-scrape',
  description: `Scrapes a company website to find its legal entity name.
Fetches the homepage and checks for a legal entity. If not found with high confidence,
discovers links to legal pages (privacy policy, terms, about, etc.), fetches them,
and uses AI to extract the legal entity name from each page.
Returns all findings with confidence levels and evidence.`,
  inputSchema: z.object({
    websiteUrl: z.string().describe('The company website URL'),
    dba: z
      .string()
      .optional()
      .describe(
        'The DBA / trade name the company operates under. Helps disambiguate when multiple entities appear on a page.'
      ),
  }),
  outputSchema: z.object({
    findings: z
      .array(
        z.object({
          legalEntityName: z.string().describe('The legal entity name found'),
          confidence: z.enum(['high', 'medium', 'low']),
          evidence: z
            .string()
            .describe('The text where the entity was found'),
          source: z.string().describe('The URL where this was found'),
        })
      )
      .describe('All legal entity findings, ordered by confidence'),
    pagesScanned: z
      .array(z.string())
      .describe('URLs that were successfully scanned'),
  }),
  execute: async ({ websiteUrl, dba = '' }) => {
    const baseUrl = normalizeUrl(websiteUrl);
    const findings: Finding[] = [];
    const pagesScanned: string[] = [];

    // Step 1: Fetch homepage with links
    const homepage = await fetchViaJina(baseUrl, { withLinks: true });
    if (!homepage) {
      return { findings: [], pagesScanned: [] };
    }
    pagesScanned.push(baseUrl);

    // Step 2: Check homepage for legal entity
    const homepageFindings = await extractEntitiesFromPage(
      homepage,
      dba,
      baseUrl
    );
    findings.push(...homepageFindings);

    // If we already have a high-confidence match, skip the rest
    if (findings.some((f) => f.confidence === 'high')) {
      return { findings, pagesScanned };
    }

    // Step 3: Extract all links, filter out non-page URLs, let LLM pick
    const linkRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
    const junkExtensions = /\.(png|jpe?g|gif|webp|svg|ico|pdf|mp4|mp3|woff2?|ttf|eot|css|js)(\?|$)/i;
    const allLinks: string[] = [];
    let match;
    while ((match = linkRegex.exec(homepage)) !== null) {
      const url = match[2];
      if (!junkExtensions.test(url)) {
        allLinks.push(url);
      }
    }

    const linksToExplore = await pickLinksToExplore(allLinks, dba);
    emitProgress(`[links] ${allLinks.length} total links found, ${linksToExplore.length} selected to explore`);
    linksToExplore.forEach((url) => emitProgress(`[links]   → ${url}`));

    // Step 4: Fetch and analyze each selected page in parallel
    const fetches = linksToExplore.map(async (url) => {
      const content = await fetchViaJina(url);
      if (!content) return;

      pagesScanned.push(url);
      const pageFindings = await extractEntitiesFromPage(content, dba, url);
      findings.push(...pageFindings);
    });

    await Promise.all(fetches);

    // Deduplicate by name, keeping highest confidence
    const order = { high: 0, medium: 1, low: 2 };
    findings.sort((a, b) => order[a.confidence] - order[b.confidence]);

    const seen = new Set<string>();
    const deduped = findings.filter((f) => {
      const key = f.legalEntityName.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { findings: deduped, pagesScanned };
  },
});
