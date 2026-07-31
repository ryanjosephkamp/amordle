import { resolve } from 'node:path';
import { validateRuntimeAuthority } from './lib/word-assets.mjs';
import { fetchUpstreamManifest, resolveUpstreamCommit } from './lib/hugging-face-word-data.mjs';

const root = process.cwd();
const current = validateRuntimeAuthority(resolve(root, 'data/word-lists')).manifest;
const upstreamCommit = resolveUpstreamCommit();
const upstream = await fetchUpstreamManifest(upstreamCommit);
process.stdout.write(
  `${JSON.stringify(
    {
      status:
        current.source.upstreamManifestSha256 === upstream.sha256
          ? 'current'
          : 'upstream_release_available',
      deployedRevision: current.revision,
      deployedUpstreamCommit: current.source.upstreamCommit,
      observedUpstreamCommit: upstreamCommit,
      observedReleaseDate: upstream.manifest.release_date,
      nextAction:
        current.source.upstreamManifestSha256 === upstream.sha256
          ? 'none'
          : 'repository_refresh_required',
    },
    null,
    2,
  )}\n`,
);
