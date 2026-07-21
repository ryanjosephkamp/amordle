import type { VercelRequest, VercelResponse } from '@vercel/node';

export type SafeHttpResponse = {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
};

export function authorizationHeader(request: Pick<VercelRequest, 'headers'>): string | null {
  const value = request.headers.authorization;
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function bearerToken(request: Pick<VercelRequest, 'headers'>): string | null {
  const authorization = authorizationHeader(request);
  if (!authorization) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

export function sendJson(response: VercelResponse, result: SafeHttpResponse): void {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  for (const [name, value] of Object.entries(result.headers ?? {})) response.setHeader(name, value);
  response.status(result.status).json(result.body);
}

export function methodNotAllowed(allowed: 'GET' | 'POST'): SafeHttpResponse {
  return {
    status: 405,
    headers: { Allow: allowed, 'Cache-Control': 'no-store' },
    body: { error: 'Method not allowed.' },
  };
}
