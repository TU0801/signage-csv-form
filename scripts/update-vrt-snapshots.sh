#!/usr/bin/env bash
# VRT(ビジュアルリグレッション)のLinux基準画像を再生成する。
#
# CIはUbuntu(Linux)で動くため、基準画像は -chromium-linux.png が必要。
# Mac上でローカルに撮ると -chromium-darwin.png になりCIと一致しない。
# このスクリプトは公式PlaywrightのDockerコンテナ(Linux)で
# --update-snapshots を実行し、Linux版の基準画像を生成・更新する。
#
# 使い方: CSSやプレビュー描画を意図的に変更したあとに実行する。
#   npm run test:vrt:update
# 生成された tests/**/-chromium-linux.png をコミットすること。
set -euo pipefail

cd "$(dirname "$0")/.."

# インストール済みPlaywrightと同じバージョンのイメージを使う(ブラウザ齟齬防止)
PW_VERSION="$(node -e "console.log(require('@playwright/test/package.json').version)" 2>/dev/null || echo "1.57.0")"
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"

echo "▶ Playwright ${PW_VERSION} のLinuxコンテナでVRT基準画像を再生成します..."
echo "  image: ${IMAGE}"

docker run --rm \
  -u "$(id -u):$(id -g)" \
  -e HOME=/tmp -e CI=1 \
  -v "$PWD":/work -w /work \
  "$IMAGE" \
  bash -c "npm ci --no-audit --no-fund && npx playwright test visual-regression --update-snapshots --reporter=list"

# コンテナがworktree内に作ったLinux版node_modulesを除去(ローカルMac実行を壊さない)
rm -rf node_modules

echo "✅ Linux基準画像を更新しました。git diff で確認し、 *-chromium-linux.png をコミットしてください。"
