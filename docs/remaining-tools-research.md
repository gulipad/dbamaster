# DBA Master — Remaining Tools Research & Context

## Project Goal

Given a **DBA (trade name)**, **address**, and **website**, find the **legal entity** of any US company.

## Current State

### Tool 1: Website Legal Entity Scraper (DONE)

- File: `src/mastra/tools/website-legal-entity-tool.ts`
- Accuracy: **79% (15/19 valid cases)**
- Strategy: Fetch homepage via Jina Reader → check for legal entity via LLM → if not high-confidence, pick up to 4 legal pages (privacy, terms, about) → extract entities from each → deduplicate
- Uses Gemini 3.1 Flash Lite Preview for inner LLM calls, regex fallback for pages >200K chars
- Known failure modes:
  - Entity not mentioned anywhere on website (e.g. hotel managed by separate LLC)
  - Parent holding company used instead of operating entity
  - Different registered name than what appears on website
  - Some test data had mismatched ground truth

---

## Remaining Tools to Build

### Tool 2: Secretary of State (SoS) Business Search

**Purpose:** Search state business registries to find the legal entity associated with a DBA or business name.

#### How It Works (Manual Process)

1. Go to the state's SoS business search portal
2. Search by business name (the DBA or trade name)
3. Review results — look for exact or close matches
4. The filing record shows the legal entity name, status, filing date, registered agent, etc.

#### State Portal URLs (Searchable Online)

These states have SoS portals with online business search that could potentially be scraped or queried:

| State | Portal URL | Notes |
|-------|-----------|-------|
| AL | https://www.sos.alabama.gov/government-records/business-entity-records | |
| AK | https://www.commerce.alaska.gov/cbp/main/search/entities | |
| AZ | https://ecorp.azcc.gov/EntitySearch/Index | Arizona Corporation Commission |
| AR | https://www.sos.arkansas.gov/corps/search_all.php | |
| CA | https://bizfileonline.sos.ca.gov/search/business | Also county-level DBAs |
| CO | https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do | |
| CT | https://service.ct.gov/business/s/onlinebusinesssearch | |
| DE | https://icis.corp.delaware.gov/ecorp/entitysearch/namesearch.aspx | Very popular for LLCs |
| FL | https://search.sunbiz.org/Inquiry/CorporationSearch/ByName | Sunbiz — well-structured |
| GA | https://ecorp.sos.ga.gov/BusinessSearch | |
| HI | https://hbe.ehawaii.gov/documents/search.html | |
| ID | https://sosbiz.idaho.gov/search/business | |
| IL | https://www.ilsos.gov/corporatellc/CorporateLlcController | |
| IN | https://bsd.sos.in.gov/PublicBusinessSearch | |
| IA | https://sos.iowa.gov/search/business/(S(...))/search.aspx | |
| KS | https://www.sos.ks.gov/business/business-entities.html | |
| KY | https://web.sos.ky.gov/ftshow/(S(...))/default.aspx | |
| LA | https://coraweb.sos.la.gov/CommercialSearch/CommercialSearch.aspx | |
| ME | https://icrs.informe.org/nei-sos-icrs/ICRS | |
| MD | https://egov.maryland.gov/BusinessExpress/EntitySearch | |
| MA | https://corp.sec.state.ma.us/CorpWeb/CorpSearch/CorpSearch.aspx | |
| MI | https://cofs.lara.state.mi.us/CorpWeb/CorpSearch/CorpSearch.aspx | |
| MN | https://mblsportal.sos.state.mn.us/Business/Search | |
| MS | https://corp.sos.ms.gov/corp/portal/c/page/corpBusinessIdSearch/portal.aspx | |
| MO | https://bsd.sos.mo.gov/BusinessEntity/BESearch.aspx | |
| MT | https://biz.sosmt.gov/search | |
| NE | https://www.nebraska.gov/sos/corp/corpsearch.cgi | |
| NV | https://esos.nv.gov/EntitySearch/OnlineEntitySearch | |
| NH | https://quickstart.sos.nh.gov/online/BusinessInquire | |
| NJ | https://www.njportal.com/DOR/BusinessNameSearch | |
| NM | https://portal.sos.state.nm.us/BFS/online/CorporationBusinessSearch | |
| NY | https://appext20.dos.ny.gov/corp_public/CORPSEARCH.ENTITY_SEARCH_ENTRY | |
| NC | https://www.sosnc.gov/online_services/search/by_title/_Business_Registration | |
| ND | https://firststop.sos.nd.gov/search/business | |
| OH | https://businesssearch.ohiosos.gov/ | |
| OK | https://www.sos.ok.gov/corp/corpInquiryFind.aspx | |
| OR | https://sos.oregon.gov/business/pages/find.aspx | |
| PA | https://www.corporations.pa.gov/search/corpsearch | |
| RI | https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx | |
| SC | https://businessfilings.sc.gov/BusinessFiling/Entity/Search | |
| SD | https://sosenterprise.sd.gov/BusinessServices/Business/FilingSearch.aspx | |
| TN | https://tnbear.tn.gov/Ecommerce/FilingSearch.aspx | |
| TX | https://mycpa.cpa.state.tx.us/coa/coaSearchBtn | Comptroller, not SoS |
| UT | https://secure.utah.gov/bes/index.html | |
| VT | https://bizfilings.vermont.gov/online/BusinessInquire | |
| VA | https://cis.scc.virginia.gov/EntitySearch/Index | State Corporation Commission |
| WA | https://ccfs.sos.wa.gov/#/BusinessSearch | |
| WV | https://apps.wv.gov/SOS/BusinessEntitySearch/ | |
| WI | https://www.wdfi.org/apps/CorpSearch/Search.aspx | |
| WY | https://wyobiz.wyo.gov/Business/FilingSearch.aspx | |
| DC | https://corponline.dcra.dc.gov/BizEntity.aspx/Home | |

#### Implementation Approach

**Option A: Jina Reader + LLM (preferred first attempt)**
- Use Jina to fetch the search page, but most SoS portals are JS-heavy SPAs that Jina can't render
- Likely won't work for most states

**Option B: Direct HTTP requests**
- Many SoS portals accept form POST or GET parameters for search
- Would need to reverse-engineer each portal's search API
- Example: Florida Sunbiz accepts `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchByName?searchNameOrder=COMPANY_NAME&searchTerm=...`
- This is the most reliable approach but requires per-state implementation

**Option C: Start with a few high-value states**
- Focus on the most common incorporation states first: DE, CA, FL, NY, TX, NV, WY
- Build a generic scraper that works for the easier portals
- Add more states incrementally

#### Recommendation

Start with **Option C**. Build a tool that:
1. Takes business name + state as input
2. Has a registry of state portal search URL patterns
3. Attempts to search via HTTP (reverse-engineer form submissions)
4. Falls back to Jina Reader if the portal is simple enough
5. Uses LLM to parse search results and find matching entities

---

### Tool 3: DBA / Fictitious Name Search

**Purpose:** Search DBA/fictitious name registries to find who filed a particular trade name.

#### Critical Context: State vs County Filing

DBA filings happen at **different levels** depending on the state. This is the single most important thing to understand.

##### States that file DBAs at STATE level (Secretary of State)
These are easier — the SoS portal often includes DBA/fictitious name search:

AL, AK, AZ, AR, CO, CT, DE, FL, GA, HI, ID, IN, IA, KS, KY, LA, ME, MD, MA, MI, MN, MS, MO, MT, NE, NV, NH, NJ, NM, NC, ND, OH, OK, OR, RI, SC, SD, TN, UT, VT, VA, WA, WV, WI, WY, DC

For these, the **SoS Business Search tool (Tool 2)** may already cover DBA lookups — many portals include fictitious name filings in their search results.

##### States that file DBAs at COUNTY level
These are harder — you need to know the county and search that county's clerk portal:

**CA** — County Clerk (58 counties). Some counties have online search, many don't.
**TX** — County Clerk (254 counties). Very fragmented.
**NY** — County Clerk (62 counties). NYC has all 5 boroughs.
**IL** — County Clerk (102 counties). Cook County has online search.
**PA** — Department of State (actually state-level for fictitious names)
**GA** — Superior Court Clerk (county level for trade names)
**NC** — Register of Deeds (county level)

##### DBA Terminology by State
States use different terms for DBAs:
- **DBA / Doing Business As**: Most common
- **Fictitious Business Name (FBN)**: CA, FL
- **Assumed Name**: TX, IL, IN, OH, PA
- **Trade Name**: MD, VA, NC, GA, DC
- **Certificate of Assumed Name**: MN, WI

#### Implementation Approach

For state-level DBA states, this may be combined with Tool 2 (SoS search). For county-level states, we'd need:

1. A mapping of state → filing level (state vs county)
2. For county-level states, the address gives us the county
3. A registry of county clerk portal URLs (start with major metros)
4. Same scraping approach as Tool 2

#### Recommendation

- **Phase 1**: Rely on SoS portals for state-level DBA states (covered by Tool 2)
- **Phase 2**: Add county-level search for the top 5 most common states (CA, TX, NY, IL, GA) starting with major metro counties

---

### Tool 4: WHOIS / RDAP Domain Lookup (LOW PRIORITY)

**Purpose:** Look up domain registration info — the registrant organization field sometimes contains the legal entity name.

#### How It Works

- RDAP (Registration Data Access Protocol) is the modern replacement for WHOIS
- Query `https://rdap.verisign.com/com/v1/domain/{domain}` for .com domains
- The response JSON may contain `entities[].vcardArray` with organization name
- Since GDPR, most registrars redact this info ("REDACTED FOR PRIVACY")

#### Implementation

```
GET https://rdap.org/domain/{domain}
```

Response includes registrant info if not privacy-protected. Most domains now use privacy protection, so this tool has **low hit rate** but is free and fast.

#### Recommendation

Build as a simple, low-effort tool. It will rarely return useful data but costs nothing to try. Use it as a supplementary signal, never as the primary source.

---

## Agent Strategy (Waterfall)

The agent should use tools in this order:

1. **Website scrape** (Tool 1 — DONE) — Check the company's own website for legal entity mentions
2. **SoS business search** (Tool 2) — Search the state's business registry using the DBA name
3. **DBA/fictitious name search** (Tool 3) — Search DBA registries (state or county level based on address)
4. **WHOIS lookup** (Tool 4) — Check domain registration as supplementary signal

The agent (using Gemini 2.5 Flash) orchestrates these tools, decides when to stop, and synthesizes findings into a final answer with confidence level.

### Agent Instructions (already in `assistant.ts`)

The agent already has instructions encoding this waterfall. As new tools are added, they get registered and the agent will use them according to its instructions.

---

## Technical Notes

- **Jina Reader** is the web fetcher. Auth via `Authorization: Bearer <JINA_API_KEY>`. Supports `X-With-Links-Summary: all` for link extraction.
- **Gemini 3.1 Flash Lite Preview** (`gemini-3.1-flash-lite-preview`) is used for cheap inner LLM calls within tools.
- **Gemini 2.5 Flash** (`gemini-2.5-flash`) is the agent's main model.
- **`createCapTool`** wrapper in `src/mastra/utils/schema-helpers.ts` fixes Zod v4 compatibility with Mastra's `createTool`.
- **AI SDK `generateObject`** from the `ai` package is used for structured LLM outputs within tools.
- All tools should follow the same pattern as `website-legal-entity-tool.ts`: deterministic work (fetch, regex) in the tool, LLM calls only for reasoning tasks.
