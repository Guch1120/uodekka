FROM node:22-bookworm
WORKDIR /opt/browser-tests
RUN npm init -y && npm install --save-exact playwright@1.58.2 && npx playwright install --with-deps chromium
WORKDIR /workspace
COPY . .
# tests/multiplayer_devices.mjs はマルチプレイ検証用にローカルの wrangler dev (Miniflare) を
# 完全オフラインで起動する。ログイン・Cloudflareアカウント・実デプロイは一切不要。
RUN npm install
CMD ["sh", "-c", "node tests/server.cjs & node tests/smoke.cjs"]
