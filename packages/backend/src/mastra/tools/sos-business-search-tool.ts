import { createCapTool } from '../utils/schema-helpers';
import { fetchViaJina } from '../utils/jina';
import { emitProgress } from '../config/progress';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SosResult {
  entityName: string;
  entityType: string;
  status: string;
  standing: string;
  filingDate: string;
  recordNumber: string;
  sourceUrl: string;
}

interface SearchResult {
  results: SosResult[];
  sourceUrl: string;
}

type SearchFn = (businessName: string) => Promise<SearchResult>;

// ---------------------------------------------------------------------------
// Direct API search (ND, ID — same vendor platform)
// ---------------------------------------------------------------------------

interface DirectApiRow {
  TITLE: [string, string]; // [entity name, entity type]
  STATUS: string;
  STANDING: string;
  FILING_DATE: string;
  RECORD_NUM: string;
}

function createDirectApiSearch(searchUrl: string, portalUrl: string): SearchFn {
  return async (businessName) => {
    try {
      const response = await fetch(searchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          SEARCH_VALUE: businessName.toUpperCase(),
          STARTS_WITH_YN: 'true',
          ACTIVE_ONLY_YN: true,
        }),
      });

      if (!response.ok) {
        emitProgress(
          `[sos-api] FAILED ${searchUrl} — status ${response.status}`
        );
        return { results: [], sourceUrl: portalUrl };
      }

      const data = await response.json();
      const rows: Record<string, DirectApiRow> = data.rows ?? {};

      return {
        results: Object.values(rows).map((row) => ({
          entityName: row.TITLE[0],
          entityType: row.TITLE[1],
          status: row.STATUS,
          standing: row.STANDING,
          filingDate: row.FILING_DATE,
          recordNumber: row.RECORD_NUM,
          sourceUrl: portalUrl,
        })),
        sourceUrl: portalUrl,
      };
    } catch (err) {
      emitProgress(`[sos-api] ERROR ${searchUrl} — ${err}`);
      return { results: [], sourceUrl: portalUrl };
    }
  };
}

// ---------------------------------------------------------------------------
// Florida Sunbiz search (via Jina)
// ---------------------------------------------------------------------------

// Parses markdown table rows: | [Name](url) | DocNum | Status |
const SUNBIZ_ROW_RE =
  /^\|\s*\[([^\]]+)\]\([^)]+\)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|$/;

function searchFlorida(): SearchFn {
  return async (businessName) => {
    const name = businessName.toUpperCase().replace(/\s+/g, '%20');
    const url = `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults/EntityName/${name}/Page1`;

    const content = await fetchViaJina(url);
    if (!content) return { results: [], sourceUrl: url };

    const results: SosResult[] = [];
    for (const line of content.split('\n')) {
      const match = SUNBIZ_ROW_RE.exec(line.trim());
      if (!match) continue;

      results.push({
        entityName: match[1],
        entityType: '',
        status: match[3],
        standing: '',
        filingDate: '',
        recordNumber: match[2],
        sourceUrl: url,
      });
    }

    return { results, sourceUrl: url };
  };
}

// ---------------------------------------------------------------------------
// State registry
// ---------------------------------------------------------------------------

const STATE_SEARCH: Record<string, SearchFn> = {
  ND: createDirectApiSearch(
    'https://firststop.sos.nd.gov/api/Records/businesssearch',
    'https://firststop.sos.nd.gov/search/business'
  ),
  ID: createDirectApiSearch(
    'https://sosbiz.idaho.gov/api/Records/businesssearch',
    'https://sosbiz.idaho.gov/search/business'
  ),
  FL: searchFlorida(),
};

// ---------------------------------------------------------------------------
// State name → code mapping
// ---------------------------------------------------------------------------

const STATE_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR',
  california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
  'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};

function normalizeStateCode(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return STATE_CODES[trimmed.toLowerCase()] ?? trimmed.toUpperCase();
}

// ---------------------------------------------------------------------------
// The tool
// ---------------------------------------------------------------------------

export const sosBusinessSearchTool = createCapTool({
  id: 'sos-business-search',
  description: `Searches a state's Secretary of State business registry for entities matching a business name.
Returns registered entities with their legal name, entity type, status, and filing info.
Currently supported states: FL, ND, ID. Returns empty results for unsupported states.
The agent should derive the state from the address provided by the user.`,
  inputSchema: z.object({
    businessName: z
      .string()
      .describe(
        'The business name to search for (DBA or trade name). Will be searched as a "starts with" match.'
      ),
    state: z
      .string()
      .describe(
        'The US state to search in. Can be a 2-letter code (e.g. "FL") or full name (e.g. "Florida").'
      ),
  }),
  outputSchema: z.object({
    results: z
      .array(
        z.object({
          entityName: z.string().describe('The registered entity name'),
          entityType: z.string().describe('Entity type (Corporation, LLC, etc.)'),
          status: z.string().describe('Filing status'),
          standing: z.string().describe('Standing (e.g. Good Standing)'),
          filingDate: z.string().describe('Filing date'),
          recordNumber: z.string().describe('Filing/document number'),
          sourceUrl: z.string().describe('URL where this result can be verified'),
        })
      )
      .describe('Matching business entities from the state registry'),
    sourceUrl: z.string().describe('The search page URL for manual verification'),
    searchMethod: z
      .enum(['direct-api', 'jina', 'unsupported'])
      .describe('How the search was performed'),
    state: z.string().describe('The state code that was searched'),
  }),
  execute: async ({ businessName, state }) => {
    const stateCode = normalizeStateCode(state);
    const search = STATE_SEARCH[stateCode];

    if (!search) {
      emitProgress(`[sos] Unsupported state: ${stateCode}`);
      return {
        results: [],
        sourceUrl: '',
        searchMethod: 'unsupported' as const,
        state: stateCode,
      };
    }

    emitProgress(`[sos] Searching ${stateCode} for "${businessName}"`);
    const { results, sourceUrl } = await search(businessName);
    emitProgress(`[sos] ${stateCode}: found ${results.length} result(s)`);

    const method = stateCode === 'FL' ? 'jina' : 'direct-api';

    return {
      results,
      sourceUrl,
      searchMethod: method as 'direct-api' | 'jina',
      state: stateCode,
    };
  },
});
