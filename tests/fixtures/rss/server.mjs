import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { URL } from "node:url";

const feed = await readFile(new URL("./feed.xml", import.meta.url));
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
  if (request.url === "/control/fail" && request.method === "POST") {
    controlledFeedFails = true;
    response.writeHead(204).end();
    return;
  }

  if (request.url === "/controlled.xml") {
    if (controlledFeedFails) {
      response.writeHead(404).end();
      return;
    }
  } else if (request.url !== "/feed.xml") {
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
