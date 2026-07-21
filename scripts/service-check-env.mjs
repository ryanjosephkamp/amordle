const expectedHost = 'squqdstdvbsvhagfuzgj.supabase.co';
const names = ['E2E_SUPABASE_URL', 'E2E_SUPABASE_ANON_KEY', 'E2E_SUPABASE_SERVICE_ROLE_KEY'];

const status = Object.fromEntries(names.map((name) => [name, Boolean(process.env[name])]));
let identity = 'not-checked';

if (process.env.E2E_SUPABASE_URL) {
  try {
    identity =
      new URL(process.env.E2E_SUPABASE_URL).hostname === expectedHost ? 'exact-match' : 'mismatch';
  } catch {
    identity = 'invalid-url';
  }
}

console.log(JSON.stringify({ variables: status, projectIdentity: identity }));
if (identity === 'mismatch' || identity === 'invalid-url') process.exitCode = 1;
