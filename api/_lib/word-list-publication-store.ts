import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  del,
  get,
  head,
  put,
  type PutBlobResult,
} from '@vercel/blob';

export type PublicationRecord<T = unknown> = {
  value: T;
  etag: string;
  url: string;
  uploadedAt: Date;
};

export type PublicationWrite = {
  etag: string;
  url: string;
};

export class PublicationPreconditionError extends Error {
  constructor(message = 'The publication precondition did not match.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'PublicationPreconditionError';
  }
}

export class ImmutablePublicationConflictError extends Error {
  constructor(path: string) {
    super(`Immutable publication object ${path} already exists with different content.`);
    this.name = 'ImmutablePublicationConflictError';
  }
}

export interface WordListPublicationStore {
  readJson<T = unknown>(path: string): Promise<PublicationRecord<T> | null>;
  createJson(path: string, value: unknown): Promise<PublicationWrite>;
  replaceJson(path: string, value: unknown, expectedEtag: string): Promise<PublicationWrite>;
  deleteIfMatch(path: string, expectedEtag: string): Promise<void>;
  putImmutable(path: string, body: string, contentType: string): Promise<PublicationWrite>;
}

function writeResult(result: PutBlobResult): PublicationWrite {
  return { etag: result.etag, url: result.url };
}

export class VercelWordListPublicationStore implements WordListPublicationStore {
  constructor(private readonly token: string) {}

  private async readCurrent(path: string): Promise<{
    readonly body: string;
    readonly etag: string;
    readonly url: string;
    readonly uploadedAt: Date;
  } | null> {
    // Public Blob GETs are CDN cached and `useCache: false` only bypasses cache
    // for private stores. Resolve metadata through the strongly consistent Blob
    // control API, then make the public read URL unique to that exact ETag. If
    // an overwrite races the two operations, retry until both views agree.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let metadata;
      try {
        metadata = await head(path, { token: this.token });
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
      }

      const cacheBustedUrl = new URL(metadata.url);
      cacheBustedUrl.searchParams.set('__amordle_etag', metadata.etag);
      const result = await get(cacheBustedUrl.toString(), {
        access: 'public',
        token: this.token,
      });
      if (!result) continue;
      if (result.statusCode !== 200 || !result.stream) continue;
      if (result.blob.etag !== metadata.etag) continue;
      return {
        body: await new Response(result.stream).text(),
        etag: metadata.etag,
        url: metadata.url,
        uploadedAt: metadata.uploadedAt,
      };
    }
    throw new PublicationPreconditionError(
      `Blob ${path} changed repeatedly while a current snapshot was being read.`,
    );
  }

  async readJson<T = unknown>(path: string): Promise<PublicationRecord<T> | null> {
    const result = await this.readCurrent(path);
    if (!result) return null;
    return { ...result, value: JSON.parse(result.body) as T };
  }

  async createJson(path: string, value: unknown): Promise<PublicationWrite> {
    try {
      return writeResult(
        await put(path, JSON.stringify(value), {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: path.endsWith('/manifest.json') ? 300 : 60,
          contentType: 'application/json; charset=utf-8',
          token: this.token,
        }),
      );
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) {
        throw new PublicationPreconditionError(undefined, { cause: error });
      }
      // A create-only conflict is not represented by a dedicated SDK error on
      // every Blob deployment. Resolve it without trusting the error message.
      const existing = await this.readJson(path).catch(() => null);
      if (existing) throw new PublicationPreconditionError(undefined, { cause: error });
      throw error;
    }
  }

  async replaceJson(path: string, value: unknown, expectedEtag: string): Promise<PublicationWrite> {
    try {
      return writeResult(
        await put(path, JSON.stringify(value), {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: path.endsWith('/manifest.json') ? 300 : 60,
          contentType: 'application/json; charset=utf-8',
          ifMatch: expectedEtag,
          token: this.token,
        }),
      );
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) {
        throw new PublicationPreconditionError(undefined, { cause: error });
      }
      throw error;
    }
  }

  async deleteIfMatch(path: string, expectedEtag: string): Promise<void> {
    try {
      await del(path, { ifMatch: expectedEtag, token: this.token });
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) {
        throw new PublicationPreconditionError(undefined, { cause: error });
      }
      throw error;
    }
  }

  async putImmutable(path: string, body: string, contentType: string): Promise<PublicationWrite> {
    try {
      return writeResult(
        await put(path, body, {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 31_536_000,
          contentType,
          token: this.token,
        }),
      );
    } catch (error) {
      const existing = await this.readCurrent(path).catch(() => null);
      if (!existing) throw error;
      if (existing.body !== body) throw new ImmutablePublicationConflictError(path);
      return { etag: existing.etag, url: existing.url };
    }
  }
}

export function createVercelWordListPublicationStore(): WordListPublicationStore {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('Word-list publication storage is unavailable.');
  return new VercelWordListPublicationStore(token);
}
