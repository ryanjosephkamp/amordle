import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

/*
 * Regenerates src/types/database.ts from the linked Supabase project.
 *
 * The script this replaces was `supabase gen types … ` with no redirect, so it
 * printed 120kB of TypeScript to the terminal and wrote nothing. Anybody
 * following the documented "push the migration, then regenerate types" workflow
 * got a wall of output and an unchanged file, and the mismatch would only
 * surface later as a type error against a column that had moved.
 *
 * Two things it deliberately does NOT do:
 *
 *   - It does not redirect straight into the target. `> src/types/database.ts`
 *     truncates the file before the CLI runs, so a network blip or an expired
 *     login leaves an empty file and a catastrophic-looking diff. The output is
 *     captured in full and the file is written only once everything succeeded.
 *
 *   - It does not leave a temporary file anywhere under src/. A stray .ts there
 *     is picked up by tsc and by the formatter, so a failed run would break the
 *     next command rather than simply having done nothing.
 *
 * The CLI's own output is not Prettier-clean — it wraps unions across lines and
 * omits semicolons — so formatting is part of generating rather than a step to
 * remember afterwards. Formatting here reproduces the committed file byte for
 * byte, which is the property that makes an unexpected diff meaningful.
 */

const root = process.cwd();
const target = resolve(root, 'src/types/database.ts');

const generated = execFileSync(
  'node_modules/.bin/supabase',
  ['gen', 'types', 'typescript', '--linked', '--schema', 'public,brrrdle_private'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
);

// The CLI exits 0 on some failures and prints a diagnostic where the types
// should be. Anything that does not declare the Database type is not types.
if (!generated.includes('export type Database')) {
  throw new Error(
    'Supabase returned no type definitions. The project may not be linked, or the login may have expired.',
  );
}

const options = await resolveConfig(target);
const formatted = await format(generated, { ...options, filepath: target });

const previous = readFileSync(target, 'utf8');
if (previous === formatted) {
  process.stdout.write('PASS database types already match the linked project\n');
} else {
  writeFileSync(target, formatted);
  process.stdout.write('WROTE src/types/database.ts — review the diff before committing\n');
}
