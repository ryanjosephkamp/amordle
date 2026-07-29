'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  acceptPrivateRequest,
  blockPrivateRequester,
  cancelPrivateRequest,
  createPrivateRequest,
  declinePrivateRequest,
  getPrivateRequestPreference,
  listPrivateRequests,
  setPrivateRequestPreference,
} from '@/adapters/supabase/combat';
import type { PrivateRequest } from '@/adapters/supabase/combat';
import { operationId } from '@/adapters/supabase/shared';
import { loadPublicWordBank } from '@/adapters/word-lists';
import { AccountGate } from '@/components/route-states';

export function RequestCenter() {
  return (
    <AccountGate>
      <RequestCenterInner />
    </AccountGate>
  );
}

function RequestCenterInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState<'og' | 'go'>('og');
  const [length, setLength] = useState(5);
  const [hardMode, setHardMode] = useState(false);
  const [message, setMessage] = useState('');
  const requests = useQuery({
    queryKey: ['combat', 'private-requests'],
    queryFn: listPrivateRequests,
    refetchInterval: 30_000,
  });
  const preference = useQuery({
    queryKey: ['combat', 'private-preference'],
    queryFn: getPrivateRequestPreference,
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['combat', 'private-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);

  const create = useMutation({
    mutationFn: () =>
      createPrivateRequest({
        targetPublicProfileId: target.trim(),
        mode,
        wordLength: length,
        hardMode,
        goPuzzleCount: mode === 'go' ? 5 : null,
        idempotencyKey: operationId('private-request'),
      }),
    onSuccess: () => {
      setTarget('');
      setMessage('Private request sent.');
      void refresh();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Request not sent.'),
  });

  const respond = useMutation({
    mutationFn: async ({
      request,
      action,
    }: {
      request: PrivateRequest;
      action: 'accept' | 'decline' | 'cancel' | 'block';
    }) => {
      if (action === 'accept') {
        const bank = await loadPublicWordBank(request.word_length);
        if (!bank.answers.length) throw new Error('The requested word list is unavailable.');
        return acceptPrivateRequest(request, bank.answers, operationId('private-accept'));
      }
      if (action === 'decline') return declinePrivateRequest(request.request_id);
      if (action === 'cancel') return cancelPrivateRequest(request.request_id);
      const profileId = request.requester_public_profile_id;
      if (!profileId) throw new Error('That player’s public profile is unavailable.');
      await blockPrivateRequester(profileId, true);
      return null;
    },
    onSuccess: (result, variables) => {
      void refresh();
      if (variables.action === 'accept' && result?.created_game_id) {
        router.push(`/combat/match/${result.created_game_id}`);
      } else {
        setMessage(`${variables.action[0]?.toUpperCase()}${variables.action.slice(1)} complete.`);
      }
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Action failed.'),
  });

  const updatePreference = useMutation({
    mutationFn: setPrivateRequestPreference,
    onSuccess: (result) => queryClient.setQueryData(['combat', 'private-preference'], result),
  });

  return (
    <div className="split-layout">
      <section className="form-panel" aria-labelledby="request-player-heading">
        <h2 id="request-player-heading">Request a player</h2>
        <form
          className="field-stack"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <label>
            Public profile ID
            <input
              required
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="Public player identifier"
            />
          </label>
          <label>
            Mode
            <select value={mode} onChange={(event) => setMode(event.target.value as 'og' | 'go')}>
              <option value="og">OG</option>
              <option value="go">GO · 5 puzzles</option>
            </select>
          </label>
          <label>
            Word length
            <input
              type="number"
              min={2}
              max={35}
              step={1}
              value={length}
              onChange={(event) => setLength(Number(event.target.value))}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hardMode}
              onChange={(event) => setHardMode(event.target.checked)}
            />
            Hard Mode
          </label>
          <button className="primary" disabled={create.isPending}>
            Send private request
          </button>
        </form>
        <div className="data-row setting-row">
          <div>
            <strong>Accept new private requests</strong>
            <p>Blocking a player also cancels active requests between you.</p>
          </div>
          <button
            type="button"
            disabled={!preference.data || updatePreference.isPending}
            onClick={() =>
              updatePreference.mutate(!(preference.data?.accept_private_practice_requests ?? true))
            }
          >
            {preference.data?.accept_private_practice_requests ? 'On' : 'Off'}
          </button>
        </div>
      </section>
      <section aria-labelledby="request-center-heading">
        <div className="section-heading">
          <h2 id="request-center-heading">Request center</h2>
          <button onClick={() => void requests.refetch()}>Refresh</button>
        </div>
        {requests.isPending ? (
          <p aria-live="polite">Loading requests…</p>
        ) : requests.data?.length ? (
          <div className="data-list">
            {requests.data.map((request) => (
              <div className="request-row" key={request.request_id}>
                <div>
                  <strong>
                    {request.viewer_role === 'requester'
                      ? request.opponent_display_name || 'Requested player'
                      : request.requester_display_name || 'Player'}
                  </strong>
                  <p>
                    {request.mode.toUpperCase()} · {request.word_length} letters
                    {request.hard_mode ? ' · Hard Mode' : ''} · {request.request_status}
                  </p>
                  {request.created_game_id && (
                    <Link href={`/combat/match/${request.created_game_id}`}>Open match</Link>
                  )}
                </div>
                <div className="action-row">
                  {request.viewer_can_accept && (
                    <button
                      className="primary"
                      disabled={respond.isPending}
                      onClick={() => respond.mutate({ request, action: 'accept' })}
                    >
                      Accept
                    </button>
                  )}
                  {request.viewer_can_decline && (
                    <button
                      disabled={respond.isPending}
                      onClick={() => respond.mutate({ request, action: 'decline' })}
                    >
                      Decline
                    </button>
                  )}
                  {request.viewer_can_cancel && (
                    <button
                      disabled={respond.isPending}
                      onClick={() => respond.mutate({ request, action: 'cancel' })}
                    >
                      Cancel
                    </button>
                  )}
                  {request.viewer_role === 'opponent' && request.requester_public_profile_id && (
                    <button
                      disabled={respond.isPending}
                      onClick={() => {
                        if (window.confirm('Block this player and cancel active requests?')) {
                          respond.mutate({ request, action: 'block' });
                        }
                      }}
                    >
                      Block
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="prose">No private requests.</p>
        )}
        <p aria-live="polite">{message}</p>
      </section>
    </div>
  );
}
