import { z } from 'zod';

export const accountDangerActionSchema = z.enum([
  'delete-solo-history',
  'restart-competitive-profile',
  'delete-account',
]);

export type AccountDangerAction = z.infer<typeof accountDangerActionSchema>;

export const dangerChallengeSchema = z
  .object({
    action: accountDangerActionSchema,
    confirmationToken: z.string().min(32).max(512),
    expiresAt: z.string().datetime(),
  })
  .strict();

export type DangerChallenge = z.infer<typeof dangerChallengeSchema>;

export const accountLifecycleReceiptSchema = z
  .object({
    action: accountDangerActionSchema,
    completedAt: z.string().datetime(),
    operationId: z.string().uuid(),
    signedOut: z.boolean(),
  })
  .strict();

export type AccountLifecycleReceipt = z.infer<typeof accountLifecycleReceiptSchema>;

export interface CompetitiveGeneration {
  generation: number;
  startedAt: string;
}

export const accountDangerCopy: Record<
  AccountDangerAction,
  {
    title: string;
    summary: string;
    deletes: readonly string[];
    retains: readonly string[];
    finalLabel: string;
  }
> = {
  'delete-solo-history': {
    title: 'Delete Solo history and progress',
    summary: 'Remove your Solo sessions, Solo results, and Solo statistical progress.',
    deletes: [
      'Active Solo Practice and Daily sessions',
      'Solo History and Solo-only statistical source records',
      'Solo streak and pending Solo completion records',
    ],
    retains: [
      'XP, level, coins, consumables, and purchased Daily access',
      'COMBAT matches, ratings, History, and settings',
    ],
    finalLabel: 'Delete Solo data permanently',
  },
  'restart-competitive-profile': {
    title: 'Restart competitive profile',
    summary: 'Begin a new personal ranked generation at 1200 and provisional status.',
    deletes: [
      'Your visible pre-reset COMBAT History and Stats',
      'Your waiting queues and pending private or rematch requests',
      'Your current personal rating bucket totals',
    ],
    retains: [
      'Settled shared matches and opponent-side rating evidence',
      'Solo data, economy, settings, and public profile',
    ],
    finalLabel: 'Restart competitive profile',
  },
  'delete-account': {
    title: 'Delete account permanently',
    summary: 'Remove your account and personal data. This cannot be undone.',
    deletes: [
      'Your account, public profile, avatar, settings, presets, economy, History, and progress',
      'Your waiting queues and pending private or rematch requests',
      'Account-scoped local caches and pending operations after authoritative success',
    ],
    retains: [
      'An anonymized participant marker in settled shared COMBAT evidence',
      'Opponent History and rating integrity',
    ],
    finalLabel: 'Delete account permanently',
  },
};
