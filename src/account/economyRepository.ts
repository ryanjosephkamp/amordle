import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConsumableType, EconomyCommand, EconomySnapshot } from '../progression'

export interface EconomyRpcResult extends Omit<EconomySnapshot, 'appliedOperationIds'> {
  readonly applied: boolean
  readonly operationId: string
}

const RESULT_KEYS = new Set(['applied', 'coins', 'operation_id', 'remove_incorrect_letters', 'reveal_one_letter', 'revision'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function parseEconomyRpcResult(value: unknown): EconomyRpcResult | undefined {
  const row = Array.isArray(value) ? value[0] : value
  if (!isRecord(row) || Object.keys(row).some((key) => !RESULT_KEYS.has(key))) return undefined
  if (typeof row.applied !== 'boolean' || typeof row.operation_id !== 'string') return undefined
  if (![row.coins, row.remove_incorrect_letters, row.reveal_one_letter, row.revision].every((entry) => typeof entry === 'number' && Number.isInteger(entry) && entry >= 0)) return undefined
  return {
    applied: row.applied,
    coins: row.coins as number,
    consumables: {
      removeIncorrectLetters: row.remove_incorrect_letters as number,
      revealOneLetter: row.reveal_one_letter as number,
    },
    operationId: row.operation_id,
    revision: row.revision as number,
  }
}

export interface EconomyRepository {
  readonly load: () => Promise<EconomyRpcResult | undefined>
  readonly execute: (command: EconomyCommand) => Promise<EconomyRpcResult>
}

function rpcName(command: EconomyCommand): string {
  if (command.type === 'purchase') return 'purchase_solo_practice_consumable'
  if (command.type === 'consume') return 'consume_solo_practice_consumable'
  return command.type === 'award' ? 'credit_player_economy_coins' : 'spend_player_economy_coins'
}

function commandArgs(command: EconomyCommand): Record<string, unknown> {
  if (command.type === 'purchase') return { p_consumable_type: command.consumable, p_operation_id: command.operationId }
  if (command.type === 'consume') return { p_consumable_type: command.consumable, p_operation_id: command.operationId, p_scope: command.scope }
  return { p_amount: command.amount, p_operation_id: command.operationId }
}

export function createSupabaseEconomyRepository(client: SupabaseClient): EconomyRepository {
  return {
    async load() {
      const { data, error } = await client.rpc('get_player_economy_state')
      if (error) throw new Error(error.message)
      return parseEconomyRpcResult(data)
    },
    async execute(command) {
      const { data, error } = await client.rpc(rpcName(command), commandArgs(command))
      if (error) throw new Error(error.message)
      const parsed = parseEconomyRpcResult(data)
      if (!parsed) throw new Error('Invalid economy response')
      return parsed
    },
  }
}

export function toEconomySnapshot(result: EconomyRpcResult, priorOperationIds: readonly string[] = []): EconomySnapshot {
  return {
    appliedOperationIds: Array.from(new Set([...priorOperationIds, result.operationId])).slice(-500),
    coins: result.coins,
    consumables: result.consumables,
    revision: result.revision,
  }
}

export function consumableRpcValue(type: ConsumableType): string {
  return type
}
