import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { URL } from "node:url";

const feed = await readFile(new URL("./feed.xml", import.meta.url));
let controlledFeedFails = false;

createServer((request, response) => {
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
