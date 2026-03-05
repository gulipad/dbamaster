import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { websiteLegalEntityTool } from '../src/mastra/tools/website-legal-entity-tool';

config({ path: '.env' });

interface TestCase {
  dba: string;
  legalName: string;
  website: string;
}

function parseCSV(path: string): TestCase[] {
  const raw = readFileSync(path, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim());
  // Skip header
  return lines.slice(1).map((line) => {
    // Simple CSV parse handling quoted fields
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    return {
      dba: fields[1] ?? '',
      legalName: fields[2] ?? '',
      website: fields[4] ?? '',
    };
  });
}

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMatch(found: string, expected: string): boolean {
  const a = normalize(found);
  const b = normalize(expected);
  return a === b || a.includes(b) || b.includes(a);
}

async function main() {
  const allCases = parseCSV(
    '/Users/gulipad/Downloads/legal_name_test_set.csv'
  );
  const testCases = pickRandom(allCases, 20);

  console.log(`\n=== Running eval: ${testCases.length} cases ===\n`);

  const results: {
    dba: string;
    expected: string;
    website: string;
    found: string | null;
    match: boolean;
    confidence: string;
    pagesScanned: number;
  }[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(
      `\n[${i + 1}/${testCases.length}] ${tc.dba} — ${tc.website}`
    );
    console.log(`  Expected: ${tc.legalName}`);

    try {
      const result = await websiteLegalEntityTool.execute!({
        websiteUrl: tc.website,
        dba: tc.dba,
      } as any, {} as any);

      const topFinding = (result as any).findings?.[0];
      const found = topFinding?.legalEntityName ?? null;
      const confidence = topFinding?.confidence ?? 'none';
      const pagesScanned = (result as any).pagesScanned?.length ?? 0;
      const match = found ? isMatch(found, tc.legalName) : false;

      console.log(`  Found:    ${found ?? '(nothing)'} [${confidence}]`);
      console.log(`  Match:    ${match ? 'YES' : 'NO'}`);
      console.log(`  Pages:    ${pagesScanned}`);

      results.push({
        dba: tc.dba,
        expected: tc.legalName,
        website: tc.website,
        found,
        match,
        confidence,
        pagesScanned,
      });
    } catch (err) {
      console.log(`  ERROR: ${err}`);
      results.push({
        dba: tc.dba,
        expected: tc.legalName,
        website: tc.website,
        found: null,
        match: false,
        confidence: 'error',
        pagesScanned: 0,
      });
    }
  }

  // Report
  const matches = results.filter((r) => r.match).length;
  const total = results.length;

  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`EVALUATION REPORT`);
  console.log(`${'='.repeat(60)}\n`);
  console.log(`Accuracy: ${matches}/${total} (${((matches / total) * 100).toFixed(1)}%)\n`);

  console.log(`${'—'.repeat(60)}`);
  for (const r of results) {
    const icon = r.match ? '✅' : '❌';
    console.log(`${icon} ${r.dba}`);
    console.log(`   Website:  ${r.website}`);
    console.log(`   Expected: ${r.expected}`);
    console.log(`   Found:    ${r.found ?? '(nothing)'} [${r.confidence}]`);
    console.log(`   Pages:    ${r.pagesScanned}`);
    console.log(`${'—'.repeat(60)}`);
  }
}

main().catch(console.error);
