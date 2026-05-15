import { startStdioTransport } from './transport.js';
import { TOOL_DEFINITIONS, handleToolCall } from './tools.js';

import type { JsonRpcRequest, JsonRpcResponse } from './transport.js';

const SERVER_INFO = {
  name: 'omo-harness-mcp',
  version: '0.1.0',
};

function okResponse(id: string | number | undefined, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function errorResponse(
  id: string | number | undefined,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, data } };
}

async function dispatch(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      return okResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case 'notifications/initialized':
      // Notifications have no response
      return null;

    case 'tools/list':
      return okResponse(id, { tools: TOOL_DEFINITIONS });

    case 'tools/call': {
      const toolName = (params as Record<string, unknown>)?.name as string | undefined;
      const toolArgs = ((params as Record<string, unknown>)?.arguments ?? {}) as Record<string, unknown>;

      if (!toolName) {
        return errorResponse(id, -32602, 'Missing required parameter: name');
      }

      if (!TOOL_DEFINITIONS.some((t) => t.name === toolName)) {
        return errorResponse(id, -32601, `Unknown tool: ${toolName}`);
      }

      try {
        const result = await handleToolCall(toolName, toolArgs);
        return okResponse(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return okResponse(id, {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        });
      }
    }

    default:
      return errorResponse(id, -32601, `Method not found: ${method}`);
  }
}

// Self-executing: start the stdio transport when this module is run directly.
// When imported (e.g. in tests), the caller can also invoke start() manually.
export function start(): void {
  startStdioTransport(dispatch);
}

// Only auto-start when run as the main module (not imported).
// In ES modules, we check via process.argv.
const runningDirectly =
  process.argv[1] &&
  (process.argv[1].endsWith('/dist/mcp/server.js') ||
   process.argv[1].endsWith('\\dist\\mcp\\server.js') ||
   process.argv[1].endsWith('/mcp/server.js') ||
   process.argv[1].endsWith('\\mcp\\server.js'));

if (runningDirectly) {
  start();
}
