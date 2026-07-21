import { z } from 'zod';
import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import type { EconomyMutation, EconomySnapshot } from '../types/services';
import { ServiceError, throwIfServiceError } from './service-error';

const economyResponseSchema = z.object({
  applied: z.boolean(),
  coins: z.number().int().nonnegative(),
  operation_id: z.string(),
  remove_incorrect_letters: z.number().int().nonnegative(),
  reveal_one_letter: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
});

function toMutation(value: unknown): EconomyMutation {
  const parsed = economyResponseSchema.safeParse(value);
  if (!parsed.success)
    throw new ServiceError('validation', 'Economy authority returned an invalid response.');
  return {
    applied: parsed.data.applied,
    coins: parsed.data.coins,
    operationId: parsed.data.operation_id,
    removeIncorrectLetters: parsed.data.remove_incorrect_letters,
    revealOneLetter: parsed.data.reveal_one_letter,
    revision: parsed.data.revision,
  };
}

export class EconomyRepository {
  constructor(private readonly client: AmordleSupabaseClient) {}

  async get(): Promise<EconomySnapshot> {
    const { data, error } = await this.client.rpc('get_player_economy_state');
    throwIfServiceError(error, 'Load economy');
    const mutation = toMutation(data?.[0]);
    return mutation;
  }

  async credit(amount: number, operationId: string): Promise<EconomyMutation> {
    const { data, error } = await this.client.rpc('credit_player_economy_coins', {
      p_amount: amount,
      p_operation_id: operationId,
    });
    throwIfServiceError(error, 'Update economy');
    return toMutation(data?.[0]);
  }

  async spend(amount: number, operationId: string): Promise<EconomyMutation> {
    const { data, error } = await this.client.rpc('spend_player_economy_coins', {
      p_amount: amount,
      p_operation_id: operationId,
    });
    throwIfServiceError(error, 'Update economy');
    return toMutation(data?.[0]);
  }

  async purchase(
    consumableType: 'revealOneLetter' | 'removeIncorrectLetters',
    operationId: string,
  ): Promise<EconomyMutation> {
    const { data, error } = await this.client.rpc('purchase_solo_practice_consumable', {
      p_consumable_type: consumableType,
      p_operation_id: operationId,
    });
    throwIfServiceError(error, 'Update economy');
    return toMutation(data?.[0]);
  }

  async consume(
    consumableType: 'revealOneLetter' | 'removeIncorrectLetters',
    operationId: string,
  ): Promise<EconomyMutation> {
    const { data, error } = await this.client.rpc('consume_solo_practice_consumable', {
      p_consumable_type: consumableType,
      p_operation_id: operationId,
      p_scope: 'practice',
    });
    throwIfServiceError(error, 'Update economy');
    return toMutation(data?.[0]);
  }
}
