FROM node:22-bookworm-slim AS node
FROM python:3.12-slim-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /studio-source
COPY snapshot/ ./
RUN npm ci --no-audit --no-fund
COPY runner/check-server.mjs /runner/sites/studio/executor/check-server.mjs
COPY runner/studio-copy.mjs /runner/workers/studio-copy.mjs
ARG STUDIO_CHECK_BASE
ENV STUDIO_CHECK_BASE=${STUDIO_CHECK_BASE}
RUN groupadd --gid 65532 studio-validator \
    && useradd --uid 65532 --gid 65532 --create-home studio-validator
USER 65532:65532
CMD ["node", "/runner/sites/studio/executor/check-server.mjs"]
