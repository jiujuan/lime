import { Buffer } from "node:buffer";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { URL } from "node:url";

type DevHttpBridgeInvoke = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

type DevHttpBridgeOptions = {
  invoke: DevHttpBridgeInvoke;
  host?: string;
  port?: number;
};

type DevHttpBridgeClient = {
  id: number;
  events: Set<string>;
  response: ServerResponse;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3030;
const MAX_BODY_BYTES = 1024 * 1024;

export class ElectronDevHttpBridge {
  readonly #invoke: DevHttpBridgeInvoke;
  readonly #host: string;
  readonly #port: number;
  readonly #clients = new Map<number, DevHttpBridgeClient>();
  #server: ReturnType<typeof createServer> | null = null;
  #nextClientId = 1;

  constructor(options: DevHttpBridgeOptions) {
    this.#invoke = options.invoke;
    this.#host = options.host ?? DEFAULT_HOST;
    this.#port = options.port ?? DEFAULT_PORT;
  }

  get url(): string {
    return `http://${this.#host}:${this.#port}`;
  }

  start(): void {
    if (this.#server) {
      return;
    }

    const server = createServer((request, response) => {
      void this.#handleRequest(request, response);
    });
    server.on("error", (error: Error & { code?: string }) => {
      if (error.code === "EADDRINUSE") {
        console.warn(
          `[electron-dev-bridge] ${this.url} already in use; browser DevBridge not started`,
        );
        return;
      }
      console.warn(`[electron-dev-bridge] server error: ${error.message}`);
    });
    server.listen(this.#port, this.#host, () => {
      console.log(`[electron-dev-bridge] listening on ${this.url}`);
    });
    this.#server = server;
  }

  stop(): void {
    for (const client of this.#clients.values()) {
      client.response.end();
    }
    this.#clients.clear();
    this.#server?.close();
    this.#server = null;
  }

  broadcast(event: string, payload?: unknown): void {
    const message = JSON.stringify({ event, payload });
    for (const client of this.#clients.values()) {
      if (!client.events.has(event)) {
        continue;
      }
      client.response.write(`event: message\n`);
      client.response.write(`data: ${message}\n\n`);
    }
  }

  async #handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    writeCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", this.url);
    if (request.method === "GET" && url.pathname === "/health") {
      writeJson(response, 200, {
        status: "ok",
        transport: "electron-host",
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/events") {
      this.#handleEvents(request, response, url);
      return;
    }

    if (request.method === "POST" && url.pathname === "/invoke") {
      await this.#handleInvoke(request, response);
      return;
    }

    writeJson(response, 404, { error: "not found" });
  }

  async #handleInvoke(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      const body = await readJsonBody(request);
      const command = typeof body.cmd === "string" ? body.cmd.trim() : "";
      if (!command) {
        writeJson(response, 400, { error: "cmd is required" });
        return;
      }
      const args =
        body.args && typeof body.args === "object" && !Array.isArray(body.args)
          ? (body.args as Record<string, unknown>)
          : undefined;
      const result = await this.#invoke(command, args);
      writeJson(response, 200, { result });
    } catch (error) {
      writeJson(response, 200, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  #handleEvents(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): void {
    const events = parseEvents(url);
    if (events.length === 0) {
      writeJson(response, 400, { error: "event is required" });
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.write(`: connected\n\n`);

    const id = this.#nextClientId;
    this.#nextClientId += 1;
    const client: DevHttpBridgeClient = {
      id,
      events: new Set(events),
      response,
    };
    this.#clients.set(id, client);

    request.on("close", () => {
      this.#clients.delete(id);
    });
  }
}

function parseEvents(url: URL): string[] {
  const singleEvent = url.searchParams.get("event")?.trim();
  if (singleEvent) {
    return [singleEvent];
  }

  const eventsJson = url.searchParams.get("events");
  if (!eventsJson) {
    return [];
  }
  try {
    const parsed = JSON.parse(eventsJson) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .map((event) => (typeof event === "string" ? event.trim() : ""))
          .filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error("request body too large");
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return {};
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function writeCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}
