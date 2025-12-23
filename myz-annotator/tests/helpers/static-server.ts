import fs from "node:fs";
import http from "node:http";
import { AddressInfo } from "node:net";
import path from "node:path";

function createStaticServer(rootDir: string) {
  const server = http.createServer(
    (req: http.IncomingMessage, res: http.ServerResponse) => {
      try {
        let reqPath = decodeURIComponent(req.url?.split("?")[0] || "");
        if (reqPath === "/" || reqPath === "") {
          reqPath = "/myz-test.html";
        }
        const filePath = path.join(rootDir, reqPath);
        if (!filePath.startsWith(rootDir)) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.statusCode = 404;
            res.end("Not found");
            return;
          }
          const ext = path.extname(filePath).toLowerCase();
          const mime =
            {
              ".html": "text/html; charset=utf-8",
              ".js": "application/javascript; charset=utf-8",
              ".css": "text/css; charset=utf-8",
              ".json": "application/json; charset=utf-8",
            }[ext] || "application/octet-stream";
          res.setHeader("Content-Type", mime);
          res.end(data);
        });
      } catch (e) {
        res.statusCode = 500;
        res.end("Server error" + e);
      }
    },
  );

  return {
    listen(port = 0): Promise<{ server: http.Server; url: string }> {
      return new Promise((resolve) => {
        server.listen(port, "127.0.0.1", () => {
          const addr = server.address() as AddressInfo;
          const url = `http://${addr?.address}:${addr?.port}`;
          resolve({ server, url });
        });
      });
    },
  };
}

export { createStaticServer };
