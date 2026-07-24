import { z } from 'zod';

import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import { throwIfServiceError } from './service-error';

const participantIdentitySchema = z
  .object({
    seat: z.enum(['player-one', 'player-two']),
    is_viewer: z.boolean(),
    identity_available: z.boolean(),
    public_profile_id: z.string().uuid().nullable(),
    display_name: z.string().trim().min(1).max(50).nullable(),
    accent_color: z.string().nullable(),
    flair_key: z.string().nullable(),
    avatar_url: z.url().nullable(),
    updated_at: z.iso.datetime().nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    if (
      row.identity_available !==
      (row.public_profile_id !== null && row.display_name !== null && row.updated_at !== null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Participant identity availability is inconsistent.',
      });
    }
  });

export type CombatParticipantIdentity = Readonly<{
  seat: 'player-one' | 'player-two';
  isViewer: boolean;
  publicProfileId: string | null;
  displayName: string;
  avatarUrl: string | null;
}>;

export class CombatParticipantIdentityRepository {
  constructor(private readonly client: AmordleSupabaseClient) {}

  async forGame(gameId: string): Promise<CombatParticipantIdentity[]> {
    const safeGameId = z.string().trim().min(1).max(200).parse(gameId);
    const { data, error } = await this.client.rpc(
      'get_multiplayer_participant_identity_summaries',
      {
        p_game_id: safeGameId,
      },
    );
    throwIfServiceError(error, 'Load participant identities');
    return z
      .array(participantIdentitySchema)
      .parse(data ?? [])
      .map((row) => ({
        seat: row.seat,
        isViewer: row.is_viewer,
        publicProfileId: row.public_profile_id,
        displayName: row.display_name ?? (row.seat === 'player-one' ? 'Player One' : 'Player Two'),
        avatarUrl: row.avatar_url,
      }));
  }
}
