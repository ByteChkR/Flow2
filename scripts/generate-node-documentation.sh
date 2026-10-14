#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_bin="${FLOW_NODE:-$(command -v node || true)}"
if [[ -z "$node_bin" && -d "$HOME/.nvm/versions/node" ]]; then
  node_bin="$(find "$HOME/.nvm/versions/node" -type f -path '*/bin/node' -executable -print 2>/dev/null | sort -V | tail -n 1)"
fi
if [[ -z "$node_bin" ]]; then
  echo "Node.js wurde nicht gefunden. Setze FLOW_NODE oder füge node zum PATH hinzu." >&2
  exit 127
fi
cd "$repository_root/local"
"$node_bin" scripts/generate-node-docs.mjs
