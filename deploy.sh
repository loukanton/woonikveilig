#!/bin/sh
# Deploy script: copies ONLY the public site files into .deploy/ and deploys
# that directory. This is an allowlist by construction; nothing outside it can
# ever leak (wrangler's Pages deploy ignores .assetsignore/.gitignore, which
# is how the repo root, including a secret file, ended up public once).
# Usage: ./deploy.sh
set -e
cd "$(dirname "$0")"

rm -rf .deploy
mkdir -p .deploy/fonts

cp index.html app.js style.css robots.txt _routes.json _headers .deploy/
cp methode.html bronnen.html over.html pers.html privacy.html .deploy/
cp favicon.svg favicon.png og-image.png .deploy/
cp fonts/*.woff2 fonts/*.ttf .deploy/fonts/

# Static data snapshot (the /data API v0). Built offline by tools/build-data.mjs.
if [ -d data ]; then cp -R data .deploy/; fi

# functions/ is picked up from the project root by wrangler, independent of
# the output directory, so the Functions keep working.
npx wrangler pages deploy .deploy --commit-dirty=true
