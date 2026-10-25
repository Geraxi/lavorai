#!/usr/bin/env bash
# Fail-closed EU write-target guard. Prints hostnames only.
# Never prints URLs or passwords. Non-zero exit aborts the caller under set -e.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
exec node --import tsx "$ROOT/scripts/ops/assert-eu-target.ts"
