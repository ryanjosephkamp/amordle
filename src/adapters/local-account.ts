'use client';

import { z } from 'zod';
import { mutateEnvelope, readEnvelope } from './indexeddb';

export const localEconomySchema = z
  .object({
    schemaVersion: z.literal(1),
    coins: z.number().int().nonnegative(),
    reveal_one_letter: z.number().int().nonnegative(),
    remove_incorrect_letters: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    appliedOperations: z.record(z.string(), z.boolean()),
  })
  .strict();

export type LocalEconomy = z.infer<typeof localEconomySchema>;
export type LocalProduct = 'reveal_one_letter' | 'remove_incorrect_letters';

const economyDomain = 'account:economy';
const prices: Record<LocalProduct, number> = {
  reveal_one_letter: 25,
  remove_incorrect_letters: 40,
};

function initialEconomy(): LocalEconomy {
  return {
    schemaVersion: 1,
    coins: 0,
    reveal_one_letter: 0,
    remove_incorrect_letters: 0,
    revision: 0,
    appliedOperations: {},
  };
}

function result(state: LocalEconomy, operationId: string, applied: boolean) {
  return {
    applied,
    coins: state.coins,
    operation_id: operationId,
    remove_incorrect_letters: state.remove_incorrect_letters,
    reveal_one_letter: state.reveal_one_letter,
    revision: state.revision,
  };
}

export async function getLocalEconomy(ownerNamespace: string) {
  const envelope = await readEnvelope(ownerNamespace, economyDomain, localEconomySchema);
  return result(envelope?.state ?? initialEconomy(), 'local-read', false);
}

async function applyLocalOperation(
  ownerNamespace: string,
  operationId: string,
  operation: (state: LocalEconomy) => Omit<LocalEconomy, 'revision'>,
) {
  let newlyApplied = false;
  const envelope = await mutateEnvelope(
    ownerNamespace,
    economyDomain,
    localEconomySchema,
    initialEconomy(),
    (state) => {
      if (state.appliedOperations[operationId]) return state;
      newlyApplied = true;
      const next = operation(state);
      return {
        ...next,
        revision: state.revision + 1,
        appliedOperations: { ...next.appliedOperations, [operationId]: true },
      };
    },
  );
  return result(envelope.state, operationId, newlyApplied);
}

export async function purchaseLocalConsumable(
  ownerNamespace: string,
  product: LocalProduct,
  operationId: string,
) {
  return applyLocalOperation(ownerNamespace, operationId, (state) => {
    const price = prices[product];
    if (state.coins < price) throw new Error(`${price} coins are required.`);
    return {
      ...state,
      coins: state.coins - price,
      [product]: state[product] + 1,
    };
  });
}

export async function consumeLocalConsumable(
  ownerNamespace: string,
  product: LocalProduct,
  operationId: string,
) {
  return applyLocalOperation(ownerNamespace, operationId, (state) => {
    if (state[product] < 1) throw new Error('Obtain this item before using it.');
    return { ...state, [product]: state[product] - 1 };
  });
}

export async function spendLocalCoins(ownerNamespace: string, amount: number, operationId: string) {
  if (!Number.isInteger(amount) || amount < 1) throw new Error('Coin amount is invalid.');
  return applyLocalOperation(ownerNamespace, operationId, (state) => {
    if (state.coins < amount) throw new Error(`${amount} coins are required.`);
    return { ...state, coins: state.coins - amount };
  });
}

export async function creditLocalCoins(
  ownerNamespace: string,
  amount: number,
  operationId: string,
) {
  if (!Number.isInteger(amount) || amount < 0) throw new Error('Coin amount is invalid.');
  return applyLocalOperation(ownerNamespace, operationId, (state) => ({
    ...state,
    coins: state.coins + amount,
  }));
}

export const localPreferencesSchema = z
  .object({
    schemaVersion: z.literal(1),
    sound: z.boolean(),
  })
  .strict();

const preferencesDomain = 'account:preferences';

export async function loadLocalPreferences(ownerNamespace: string) {
  return (
    (await readEnvelope(ownerNamespace, preferencesDomain, localPreferencesSchema))?.state ?? {
      schemaVersion: 1 as const,
      sound: true,
    }
  );
}

export async function saveLocalSound(ownerNamespace: string, sound: boolean) {
  return mutateEnvelope(
    ownerNamespace,
    preferencesDomain,
    localPreferencesSchema,
    { schemaVersion: 1 as const, sound: true },
    (state) => ({ ...state, sound }),
  );
}
