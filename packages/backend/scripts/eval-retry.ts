import { config } from 'dotenv';
config({ path: '.env' });

import { websiteLegalEntityTool } from '../src/mastra/tools/website-legal-entity-tool';
import { isMatch } from './eval-utils';
import type { ToolExecutionContext } from '@mastra/core/tools';

const cases = [
  { dba: 'Bench Accounting', legalName: 'Bench Accounting, Inc.', website: 'bench.co' },
  { dba: 'Innate AEC', legalName: 'INNATE AEC LLC', website: 'https://innate-aec.com/' },
  { dba: "Curti's Landscaping, Inc.", legalName: "Curti's Landscaping, Inc.", website: 'https://www.curtilandscaping.com/' },
  { dba: 'Boca Raton Psychiatry', legalName: 'BOCA RATON PSYCHIATRIC SOLUTIONS, LLC', website: 'bocaratonpsychiatry.com/' },
  { dba: 'Okta', legalName: 'Okta Inc.', website: 'https://www.okta.com/' },
  { dba: 'Parke Bank', legalName: 'CRE Mortgage Brokerage LLC', website: 'www.parkebank.com' },
  { dba: 'Hello Tractor', legalName: 'Hello Tractor, Inc.', website: 'https://hellotractor.com/' },
  { dba: 'Milstein Law Group', legalName: 'A MILSTEIN LAW GROUP PLLC', website: 'https://milsteinlg.com/' },
  { dba: 'Swiftlane', legalName: 'Swiftlane, Inc.', website: 'swiftlane.com' },
  { dba: 'Palazzo Lakeside Hotel', legalName: 'MM Lake Hotel LLC', website: 'wwww.palazzolakesidehotel.com' },
];

const stubContext = {} as ToolExecutionContext;

async function main() {
  console.log(`\n=== Retrying ${cases.length} rate-limited cases ===\n`);

  let matches = 0;

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    console.log(`\n[${i + 1}/${cases.length}] ${tc.dba} — ${tc.website}`);
    console.log(`  Expected: ${tc.legalName}`);

    try {
      const result = await websiteLegalEntityTool.execute!(
        { websiteUrl: tc.website },
        stubContext
      );

      const topFinding = result.findings?.[0];
      const found = topFinding?.legalEntityName ?? null;
      const confidence = topFinding?.confidence ?? 'none';
      const pagesScanned = result.pagesScanned?.length ?? 0;
      const match = found ? isMatch(found, tc.legalName) : false;
      if (match) matches++;

      const icon = match ? '✅' : '❌';
      console.log(`  Found:    ${found ?? '(nothing)'} [${confidence}]`);
      console.log(`  ${icon} ${match ? 'MATCH' : 'NO MATCH'} — ${pagesScanned} pages scanned`);
    } catch (err) {
      console.log(`  ERROR: ${err}`);
    }
  }

  console.log(`\n=== Result: ${matches}/${cases.length} (${((matches / cases.length) * 100).toFixed(1)}%) ===\n`);
}

main().catch(console.error);
