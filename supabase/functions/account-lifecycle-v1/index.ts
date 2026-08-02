import { createClient } from 'npm:@supabase/supabase-js@2.110.9';

const allowedActions = new Set([
  'delete-solo-history',
  'restart-competitive-profile',
  'delete-account',
]);
const avatarBucket = 'amordle-public-avatars-v1';
const maximumBodyBytes = 4096;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function ownedAvatarPath(urlValue: unknown, projectUrl: string): string | null {
  if (typeof urlValue !== 'string' || urlValue.length > 2048) return null;
  try {
    const url = new URL(urlValue);
    const project = new URL(projectUrl);
    const prefix = `/storage/v1/object/public/${avatarBucket}/`;
    if (url.origin !== project.origin || !url.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    return /^avatars\/[0-9a-f-]{36}\.(?:png|jpe?g|webp|gif)$/u.test(path) ? path : null;
  } catch {
    return null;
  }
}

function publicMessage(error: { message?: string; code?: string } | null): string {
  const message = error?.message?.toLowerCase() ?? '';
  if (message.includes('active combat')) return 'Finish or forfeit active COMBAT games first.';
  if (message.includes('expired')) return 'This confirmation has expired. Start again.';
  if (message.includes('not valid')) return 'This confirmation is no longer valid. Start again.';
  if (message.includes('too many')) return 'Too many attempts. Wait a few minutes and try again.';
  return 'The account action could not be completed.';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed.' });

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) {
    return response(413, { error: 'Request is too large.' });
  }

  try {
    const projectUrl = requiredEnvironment('SUPABASE_URL');
    const anonKey = requiredEnvironment('SUPABASE_ANON_KEY');
    const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('authorization');
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/iu)?.[1];
    if (!accessToken) return response(401, { error: 'Sign in again to continue.' });

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > maximumBodyBytes) {
      return response(413, { error: 'Request is too large.' });
    }
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      return response(400, { error: 'Invalid request.' });
    }

    const action = body.action;
    if (typeof action !== 'string' || !allowedActions.has(action)) {
      return response(400, { error: 'Unsupported account action.' });
    }

    const verifier = createClient(projectUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData, error: userError } = await verifier.auth.getUser(accessToken);
    const user = userData.user;
    if (userError || !user) return response(401, { error: 'Sign in again to continue.' });

    const service = createClient(projectUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (body.operation === 'prepare') {
      const password = body.password;
      if (typeof password !== 'string' || password.length < 1 || password.length > 1024) {
        return response(400, { error: 'Enter your current password.' });
      }
      if (!user.email) return response(409, { error: 'This account has no password email.' });

      const passwordVerifier = createClient(projectUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: verified, error: passwordError } =
        await passwordVerifier.auth.signInWithPassword({ email: user.email, password });
      if (passwordError || verified.user?.id !== user.id) {
        return response(401, { error: 'The current password is incorrect.' });
      }

      const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
      const confirmationToken = base64Url(tokenBytes);
      const tokenHash = await sha256(confirmationToken);
      const { data, error } = await service.rpc('service_prepare_account_lifecycle_v1', {
        p_user_id: user.id,
        p_action: action,
        p_token_hash: tokenHash,
      });
      if (error) return response(409, { error: publicMessage(error) });
      const prepared = Array.isArray(data) ? data[0] : null;
      if (!prepared || typeof prepared.expires_at !== 'string') {
        return response(502, { error: 'The confirmation could not be prepared.' });
      }
      return response(200, {
        action,
        confirmationToken,
        expiresAt: prepared.expires_at,
      });
    }

    if (body.operation === 'confirm') {
      const confirmationToken = body.confirmationToken;
      if (
        typeof confirmationToken !== 'string' ||
        confirmationToken.length < 32 ||
        confirmationToken.length > 512
      ) {
        return response(400, { error: 'Invalid confirmation.' });
      }

      const tokenHash = await sha256(confirmationToken);
      const { data, error } = await service.rpc('service_confirm_account_lifecycle_v1', {
        p_user_id: user.id,
        p_action: action,
        p_token_hash: tokenHash,
      });
      if (error) return response(409, { error: publicMessage(error) });
      if (!data || typeof data !== 'object') {
        return response(502, { error: 'The account action returned no receipt.' });
      }

      if (action === 'delete-account') {
        // Consume the account-bound one-time challenge before touching Storage
        // or Auth. Wrong, expired, or replayed tokens therefore cannot delete
        // an avatar or user.
        const serviceReceipt = (data as Record<string, unknown>).service;
        const avatarUrl =
          serviceReceipt && typeof serviceReceipt === 'object'
            ? (serviceReceipt as Record<string, unknown>).avatarUrl
            : null;
        const path = ownedAvatarPath(avatarUrl, projectUrl);
        if (path) {
          let removed = false;
          for (let attempt = 1; attempt <= 3; attempt += 1) {
            const { error: storageError } = await service.storage.from(avatarBucket).remove([path]);
            if (!storageError) {
              removed = true;
              break;
            }
          }
          if (!removed) {
            return response(502, { error: 'Profile image cleanup could not finish.' });
          }
        }
        const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
        if (deleteError) return response(502, { error: 'Account removal could not finish.' });
      }

      const receipt = data as Record<string, unknown>;
      return response(200, {
        action,
        operationId: receipt.operationId,
        completedAt: receipt.completedAt,
        signedOut: action === 'delete-account',
      });
    }

    return response(400, { error: 'Unsupported operation.' });
  } catch {
    return response(500, { error: 'Account services are temporarily unavailable.' });
  }
});
