FROM node:24.12.0-alpine3.23

WORKDIR /fixture
COPY tests/fixtures/rss/server.mjs tests/fixtures/rss/feed.xml ./
COPY tests/fixtures/lemmy ./lemmy
COPY tests/fixtures/mastodon ./mastodon
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
