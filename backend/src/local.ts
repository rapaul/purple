import { createServer, IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { handler } from "./handler";

const PORT = Number(process.env.PORT ?? 3000);

function toEvent(req: IncomingMessage): APIGatewayProxyEventV2 {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const queryStringParameters: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (queryStringParameters[k] = v));

  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers: Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [
        k,
        Array.isArray(v) ? v.join(",") : v ?? "",
      ]),
    ),
    queryStringParameters,
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: "localhost",
      domainPrefix: "local",
      http: {
        method: req.method ?? "GET",
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: req.headers["user-agent"] ?? "",
      },
      requestId: Math.random().toString(36).slice(2),
      routeKey: "$default",
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    isBase64Encoded: false,
  };
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const result = await handler(toEvent(req));
    if (typeof result === "string") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(result);
      return;
    }
    const headers = (result.headers ?? {}) as Record<string, string>;
    res.writeHead(result.statusCode ?? 200, headers);
    res.end(result.body ?? "");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, () => {
  console.log(`Local Lambda proxy listening on http://localhost:${PORT}`);
  console.log(`Try: http://localhost:${PORT}/?from=2026-05-02&to=2026-05-30`);
});
