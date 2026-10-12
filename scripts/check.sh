#!/bin/sh
# Local checks, no CI: type-check, strict validation, tests.
set -e
cd "$(dirname "$0")/.."
echo '== tsc'
npx --yes -p typescript@5.6.3 tsc -p .
echo '== claude plugin validate --strict'
claude plugin validate . --strict
echo '== claude plugin test'
claude plugin test .
