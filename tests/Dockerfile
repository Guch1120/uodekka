FROM node:22-bookworm
WORKDIR /opt/browser-tests
RUN npm init -y && npm install --save-exact playwright@1.58.2 && npx playwright install --with-deps chromium
WORKDIR /workspace
COPY . .
CMD ["sh", "-c", "node tests/server.cjs & node tests/smoke.cjs"]
