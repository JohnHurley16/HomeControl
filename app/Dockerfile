# One small image: Node runs the bundled rules service, which also serves the built front end.
# Nothing is compiled on the Pi; `npm run package` puts cc.mjs and web/ next to this file.
FROM node:22-alpine

WORKDIR /app
COPY cc.mjs ./cc.mjs
COPY web ./web

ENV NODE_ENV=production \
    CC_WEB_DIR=/app/web \
    CC_PORT=8099
EXPOSE 8099

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8099/healthz || exit 1

CMD ["node", "/app/cc.mjs"]
