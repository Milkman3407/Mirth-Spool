import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { URL } from "node:url";

const feed = await readFile(new URL("./feed.xml", import.meta.url));
const lemmyCommunity = await readFile(
  new URL("./lemmy/community.json", import.meta.url),
);
const lemmyPosts = await readFile(
  new URL("./lemmy/posts-page-1.json", import.meta.url),
);
const mastodonInstance = await readFile(
  new URL("./mastodon/instance.json", import.meta.url),
);
const mastodonTag = await readFile(
  new URL("./mastodon/tag.json", import.meta.url),
);
const mastodonAccount = await readFile(
  new URL("./mastodon/account.json", import.meta.url),
);
const mastodonHashtag = await readFile(
  new URL("./mastodon/hashtag-page-1.json", import.meta.url),
);
const mastodonAccountPage = await readFile(
  new URL("./mastodon/account-page.json", import.meta.url),
);
let controlledFeedFails = false;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const gif = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64",
);

createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://fixture.local");
  const mastodonResponse = (body, extraHeaders = {}) => {
    response.writeHead(200, {
      "content-length": String(body.byteLength),
      "content-type": "application/json",
      "x-ratelimit-remaining": "99",
      ...extraHeaders,
    });
    response.end(body);
  };
  if (requestUrl.pathname === "/api/v2/instance") {
    mastodonResponse(mastodonInstance);
    return;
  }
  if (requestUrl.pathname === "/api/v1/tags/Memes") {
    mastodonResponse(mastodonTag);
    return;
  }
  if (requestUrl.pathname === "/api/v1/accounts/lookup") {
    if (!requestUrl.searchParams.get("acct")) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end('{"error":"Record not found"}');
      return;
    }
    mastodonResponse(mastodonAccount);
    return;
  }
  if (requestUrl.pathname === "/api/v1/timelines/tag/Memes") {
    mastodonResponse(
      requestUrl.searchParams.has("since_id")
        ? Buffer.from("[]")
        : mastodonHashtag,
    );
    return;
  }
  if (requestUrl.pathname === "/api/v1/accounts/acct-41/statuses") {
    mastodonResponse(
      requestUrl.searchParams.has("since_id")
        ? Buffer.from("[]")
        : mastodonAccountPage,
    );
    return;
  }
  if (requestUrl.pathname === "/api/v3/community") {
    if (
      requestUrl.searchParams.get("name") !== "memes" &&
      requestUrl.searchParams.get("id") !== "41"
    ) {
      const body = Buffer.from(
        JSON.stringify({ error: "couldnt_find_community" }),
      );
      response.writeHead(400, {
        "content-length": String(body.byteLength),
        "content-type": "application/json",
      });
      response.end(body);
      return;
    }
    response.writeHead(200, {
      "content-length": String(lemmyCommunity.byteLength),
      "content-type": "application/json",
    });
    response.end(lemmyCommunity);
    return;
  }
  if (requestUrl.pathname === "/api/v3/post/list") {
    const body =
      requestUrl.searchParams.get("page") === "1"
        ? lemmyPosts
        : Buffer.from('{"posts":[]}');
    response.writeHead(200, {
      "content-length": String(body.byteLength),
      "content-type": "application/json",
      "x-ratelimit-remaining": "99",
    });
    response.end(body);
    return;
  }
  if (request.url === "/media/image.png") {
    response.writeHead(200, {
      "cache-control": "public, max-age=60",
      "content-length": String(png.byteLength),
      "content-type": "image/png",
    });
    response.end(png);
    return;
  }
  if (request.url === "/media/animated.gif") {
    response.writeHead(200, {
      "cache-control": "public, max-age=60",
      "content-length": String(gif.byteLength),
      "content-type": "image/gif",
    });
    response.end(gif);
    return;
  }
  if (request.url === "/media/video.mp4") {
    response.writeHead(200, { "content-type": "video/mp4" });
    response.end(Buffer.from("synthetic-invalid-video"));
    return;
  }
  if (requestUrl.pathname === "/control/fail" && request.method === "POST") {
    controlledFeedFails = true;
    response.writeHead(204).end();
    return;
  }

  if (requestUrl.pathname === "/controlled.xml") {
    if (controlledFeedFails) {
      response.writeHead(404).end();
      return;
    }
  } else if (requestUrl.pathname !== "/feed.xml") {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "content-length": String(feed.byteLength),
    "content-type": "application/rss+xml; charset=utf-8",
    etag: '"e2e-fixture-v1"',
  });
  response.end(feed);
}).listen(8080, "0.0.0.0");
