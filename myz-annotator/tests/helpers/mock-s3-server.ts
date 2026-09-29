import http, { IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";

interface StoredObject {
  body: Buffer;
  etag: string;
  lastModified: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function listXml(objects: Map<string, StoredObject>, prefix: string): string {
  const contents = Array.from(objects.entries())
    .filter(([key]) => key.startsWith(prefix))
    .map(
      ([key, object]) =>
        `<Contents><Key>${escapeXml(key)}</Key>` +
        `<LastModified>${object.lastModified}</LastModified>` +
        `<ETag>${object.etag}</ETag>` +
        `<Size>${object.body.length}</Size></Contents>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>${contents}</ListBucketResult>`;
}

/**
 * Minimal S3-compatible HTTP server covering exactly what the sync client uses:
 * path-style GET/PUT/HEAD/DELETE, list-type=2, If-Match / If-None-Match, plus
 * permissive CORS. AWS signatures are ignored. Loopback HTTP is allowed by the
 * client's endpoint policy, so no certificate is needed.
 */
export function createMockS3Server() {
  const objects = new Map<string, StoredObject>();
  let counter = 0;

  const server = http.createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      const requestedHeaders = req.headers["access-control-request-headers"];
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,PUT,HEAD,DELETE,OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        typeof requestedHeaders === "string" ? requestedHeaders : "*",
      );
      res.setHeader("Access-Control-Expose-Headers", "etag,content-length");

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }

      const url = new URL(req.url || "/", "http://localhost");
      const segments = url.pathname.split("/").filter(Boolean);
      const bucket = segments.shift();
      const key = segments.map((part) => decodeURIComponent(part)).join("/");
      if (!bucket) {
        res.statusCode = 400;
        res.end();
        return;
      }

      if (!key) {
        if (req.method === "GET") {
          res.setHeader("Content-Type", "application/xml");
          res.statusCode = 200;
          res.end(listXml(objects, url.searchParams.get("prefix") || ""));
          return;
        }
        res.statusCode = 400;
        res.end();
        return;
      }

      if (req.method === "GET") {
        const object = objects.get(key);
        if (!object) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.statusCode = 200;
        res.setHeader("ETag", object.etag);
        res.end(object.body);
        return;
      }

      if (req.method === "HEAD") {
        const object = objects.get(key);
        if (!object) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.statusCode = 200;
        res.setHeader("ETag", object.etag);
        res.setHeader("Content-Length", String(object.body.length));
        res.end();
        return;
      }

      if (req.method === "PUT") {
        const ifMatch = req.headers["if-match"] as string | undefined;
        const ifNone = req.headers["if-none-match"] as string | undefined;
        const current = objects.get(key);
        if (ifNone === "*" && current) {
          res.statusCode = 412;
          res.end();
          return;
        }
        if (ifMatch !== undefined && current?.etag !== ifMatch) {
          res.statusCode = 412;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk as Buffer));
        req.on("end", () => {
          counter += 1;
          const etag = `"v${counter}"`;
          objects.set(key, {
            body: Buffer.concat(chunks),
            etag,
            lastModified: new Date().toISOString(),
          });
          res.statusCode = 200;
          res.setHeader("ETag", etag);
          res.end();
        });
        return;
      }

      if (req.method === "DELETE") {
        const ifMatch = req.headers["if-match"] as string | undefined;
        const current = objects.get(key);
        if (!current) {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (ifMatch !== undefined && current.etag !== ifMatch) {
          res.statusCode = 412;
          res.end();
          return;
        }
        objects.delete(key);
        res.statusCode = 204;
        res.end();
        return;
      }

      res.statusCode = 405;
      res.end();
    },
  );

  return {
    objects,
    listen(port = 0): Promise<{ server: http.Server; url: string }> {
      return new Promise((resolve) => {
        server.listen(port, "127.0.0.1", () => {
          const address = server.address() as AddressInfo;
          resolve({ server, url: `http://127.0.0.1:${address.port}` });
        });
      });
    },
  };
}
