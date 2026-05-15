/**
 * Stdio transport for JSON-RPC 2.0.
 *
 * Reads JSON-RPC requests from stdin line by line,
 * dispatches to a handler, and writes JSON-RPC responses to stdout.
 *
 * Node.js built-ins only.
 */

import { createInterface } from 'node:readline';

export type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type RequestHandler = (request: JsonRpcRequest) => Promise<JsonRpcResponse | null>;

/**
 * Start the stdio transport loop.
 *
 * @param handler — async function that receives a JSON-RPC request
 *   and returns a JSON-RPC response (or null for notifications).
 */
export function startStdioTransport(handler: RequestHandler): void {
  const rl = createInterface({ input: process.stdin });

  // Avoid the process exiting because stdin is paused
  rl.on('close', () => {
    // stdin closed — allow graceful shutdown
  });

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      const parseError: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
      process.stdout.write(`${JSON.stringify(parseError)}\n`);
      return;
    }

    try {
      const response = await handler(request);
      if (response) {
        process.stdout.write(`${JSON.stringify(response)}\n`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: { code: -32603, message: `Internal error: ${message}` },
      };
      process.stdout.write(`${JSON.stringify(errorResponse)}\n`);
    }
  });
}
