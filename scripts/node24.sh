#!/bin/sh
set -eu

case "$(uname -s)" in
  Darwin) node_platform="darwin" ;;
  Linux) node_platform="linux" ;;
  *) node_platform="unsupported" ;;
esac
case "$(uname -m)" in
  arm64|aarch64) node_arch="arm64" ;;
  x86_64|amd64) node_arch="x64" ;;
  *) node_arch="unsupported" ;;
esac
local_node=".tooling/node-v24.18.0-${node_platform}-${node_arch}/bin/node"
if [ -x "$local_node" ]; then
  exec "$local_node" "$@"
fi

if [ "$(node --version)" != "v24.18.0" ]; then
  echo "Amordle requires Node v24.18.0; found $(node --version)." >&2
  exit 1
fi
exec node "$@"
