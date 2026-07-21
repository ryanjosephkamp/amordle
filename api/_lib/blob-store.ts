import { list, put } from '@vercel/blob';
import { RefreshError } from './safe-error';

export interface WordListStore {
  put(path: string, body: string, contentType: string): Promise<{ url: string }>;
  readJson(path: string): Promise<unknown | null>;
}

export class VercelBlobStore implements WordListStore {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async put(path: string, body: string, contentType: string): Promise<{ url: string }> {
    try {
      const blob = await put(path, body, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 300,
        contentType,
        token: this.token,
      });
      return { url: blob.url };
    } catch (error) {
      throw new RefreshError('persistence', 'The served word list was not changed.', {
        cause: error,
      });
    }
  }

  async readJson(path: string): Promise<unknown | null> {
    let match: { url: string } | undefined;
    try {
      const result = await list({ prefix: path, limit: 10, token: this.token });
      match = result.blobs.find((blob) => blob.pathname === path);
    } catch (error) {
      throw new RefreshError('persistence', 'Stored word-list metadata could not be read.', {
        cause: error,
      });
    }
    if (!match) return null;
    const objectResponse = await this.fetcher(match.url, {
      headers: { Accept: 'application/json' },
    });
    if (!objectResponse.ok) {
      throw new RefreshError('persistence', 'Stored word-list metadata could not be read.');
    }
    try {
      return await objectResponse.json();
    } catch (error) {
      throw new RefreshError('persistence', 'Stored word-list metadata was invalid.', {
        cause: error,
      });
    }
  }
}
