import { describe, expect, it } from 'vitest'

const REPAIR_MIGRATIONS = import.meta.glob(
  '../../supabase/migrations/*_phase58_go_chain_selector_v2_bigint_overflow_repair.sql',
  {
    eager: true,
    import: 'default',
    query: '?raw',
  },
) as Record<string, string>

const UINT32_MODULUS = 4_294_967_296n

function mixWithMathImul(input: number): number {
  let value = input >>> 0
  value = (value ^ (value >>> 16)) >>> 0
  value = Math.imul(value, 2_246_822_507) >>> 0
  value = (value ^ (value >>> 13)) >>> 0
  value = Math.imul(value, 3_266_489_909) >>> 0
  return (value ^ (value >>> 16)) >>> 0
}

function mixWithExactModulo(input: number): number {
  let value = BigInt(input >>> 0)
  value = (value ^ (value >> 16n)) % UINT32_MODULUS
  value = (value * 2_246_822_507n) % UINT32_MODULUS
  value = (value ^ (value >> 13n)) % UINT32_MODULUS
  value = (value * 3_266_489_909n) % UINT32_MODULUS
  return Number((value ^ (value >> 16n)) % UINT32_MODULUS)
}

describe('Phase 58 GO chain selector bigint overflow repair migration', () => {
  it('contains exactly one generated additive function-only repair', () => {
    const entries = Object.entries(REPAIR_MIGRATIONS)
    expect(entries).toHaveLength(1)
    const [path, sql] = entries[0]

    expect(path.split('/').at(-1)).toMatch(/^\d{14}_phase58_go_chain_selector_v2_bigint_overflow_repair\.sql$/u)
    expect(sql.match(/create or replace function/giu)).toHaveLength(1)
    expect(sql).toMatch(/create or replace function brrrdle_private\.phase58_mix_u32\(p_value bigint\)/iu)
    expect(sql).toMatch(/language plpgsql[\s\S]*immutable[\s\S]*set search_path = ''/iu)
    expect(sql).toMatch(/mod\(v_value::numeric \* 2246822507::numeric, 4294967296::numeric\)::bigint/iu)
    expect(sql).toMatch(/mod\(v_value::numeric \* 3266489909::numeric, 4294967296::numeric\)::bigint/iu)
    expect(sql).toMatch(/revoke all on function brrrdle_private\.phase58_mix_u32\(bigint\)\s+from public, anon, authenticated/iu)
    expect(sql).not.toMatch(/\b(?:alter|create|drop|truncate)\s+table\b/iu)
    expect(sql).not.toMatch(/\b(?:insert|update|delete)\s+(?:into|from)?\s*(?:public|brrrdle_private)\./iu)
    expect(sql).not.toMatch(/phase58_ranked_daily_go_answers_v2|phase55_ranked_daily_answers|ranked_daily_game_authority|async_multiplayer_games/iu)
  })

  it('matches JavaScript unsigned imul semantics with exact modulo arithmetic', () => {
    const vectors = [
      0,
      1,
      65_535,
      65_536,
      2_147_483_647,
      2_147_483_648,
      3_735_928_559,
      4_294_967_295,
    ]

    for (const input of vectors) {
      expect(mixWithExactModulo(input)).toBe(mixWithMathImul(input))
    }
  })
})
