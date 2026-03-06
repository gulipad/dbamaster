```
██████╗ ██████╗  █████╗ ███╗   ███╗ █████╗ ███████╗████████╗███████╗██████╗
██╔══██╗██╔══██╗██╔══██╗████╗ ████║██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗
██║  ██║██████╔╝███████║██╔████╔██║███████║███████╗   ██║   █████╗  ██████╔╝
██║  ██║██╔══██╗██╔══██║██║╚██╔╝██║██╔══██║╚════██║   ██║   ██╔══╝  ██╔══██╗
██████╔╝██████╔╝██║  ██║██║ ╚═╝ ██║██║  ██║███████║   ██║   ███████╗██║  ██║
╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
```

**legal entity finder // v1.0**

Given a website URL, DBA Master finds the legal entity (LLC, Inc, Corp, etc.) that owns or operates the site. It scrapes the homepage and legal pages — privacy policies, terms of service, copyright footers — and uses AI to extract the registered company name.

## How it works

1. **Homepage fetch** — Fetches the homepage via [Jina Reader](https://jina.ai/reader/) and extracts all links.
2. **Legal page discovery** — An LLM picks the most promising links (privacy policy, terms, about, imprint) and fetches them.
3. **Entity extraction** — Each page is analyzed by Gemini Flash to find legal entity names with confidence levels, falling back to regex for very large pages.
4. **Deduplication** — Results are deduplicated and ranked by confidence, then the agent reasons over the candidates to pick the best match.

## Stack

- **[Mastra](https://mastra.ai)** — AI agent framework (agents, tools, memory)
- **[Gemini 2.5 Flash](https://ai.google.dev/)** — LLM for agent reasoning
- **[Gemini 3.1 Flash Lite](https://ai.google.dev/)** — LLM for entity extraction within the tool
- **[Jina Reader](https://jina.ai/reader/)** — Web page fetching as clean text
- **[LibSQL](https://turso.tech/libsql)** — Local file-based storage for conversation memory
- **React + Vite** — Retro amber terminal frontend

## Project structure

```
packages/
  backend/
    src/mastra/
      agents/assistant.ts    — DBA Master agent
      tools/
        website-legal-entity-tool.ts  — Website scraping + AI extraction
      utils/
        jina.ts              — Shared Jina Reader client
        schema-helpers.ts    — Zod v4 compatibility wrapper
      config/
        storage.ts           — LibSQL storage
        memory.ts            — Conversation memory
        progress.ts          — SSE progress emitter
      index.ts               — Mastra instance + API routes
    scripts/
      eval.ts                — Accuracy evaluation against test set
      eval-retry.ts          — Retry failed eval cases
      eval-utils.ts          — Shared eval helpers
  frontend/
    src/
      App.tsx                — Terminal-style UI
      index.css              — Amber terminal styles
```

## Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp packages/backend/.env.example packages/backend/.env
# Add your API keys:
#   GOOGLE_GENERATIVE_AI_API_KEY  — Gemini API key
#   JINA_API_KEY                  — Jina Reader API key (optional, increases rate limits)
#   PASSWORD                      — Frontend access password

# Run both backend and frontend
pnpm dev
```

The backend runs on `:4111` (Mastra dev server) and the frontend on `:3000` (Vite), proxied to the backend.

## Usage

Open the frontend, enter a password, then type a website URL (optionally with a DBA name):

```
> joespizza.com, DBA Joe's Pizza
```

The agent will scrape the site, find legal pages, extract entity names, and return the result with confidence levels and sources.

## Eval

Run the evaluation script against a CSV test set:

```bash
cd packages/backend
npx tsx scripts/eval.ts path/to/legal_name_test_set.csv
```

The CSV should have columns where index 1 is DBA, index 2 is legal name, and index 4 is website.

## License

MIT
