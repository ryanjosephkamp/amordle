#!/bin/sh
set -eu

local_node=".tooling/node-v24.18.0-darwin-arm64/bin/node"
if [ -x "$local_node" ]; then
  exec "$local_node" "$@"
fi

if [ "$(node --version)" != "v24.18.0" ]; then
  echo "Amordle requires Node v24.18.0; found $(node --version)." >&2
  exit 1
fi
exec node "$@"
