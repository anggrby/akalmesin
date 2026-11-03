#!/usr/bin/env bash
# Idempotent Cloud Agent install. Node 20+ is already on the default image.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
npm ci
npx playwright-core install chromium
npx playwright-core install-deps chromium
