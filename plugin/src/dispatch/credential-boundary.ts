import type { GraphStateLike } from '../types.js';

// ── Credential Registry ──────────────────────────────────────────────
export interface CredentialReference {
  name: string;
  provider: string;
  toolScope?: string[];
}

export function createCredentialRegistry(): {
  registerCredentialReference: (ref: CredentialReference) => void;
  resolveCredentialForTool: (toolName: string) => Record<string, string>;
  getRegisteredCredentials: () => CredentialReference[];
} {
  const registry = new Map<string, CredentialReference>();

  return {
    registerCredentialReference(ref: CredentialReference): void {
      registry.set(ref.name, ref);
    },
    resolveCredentialForTool(toolName: string): Record<string, string> {
      const resolved: Record<string, string> = {};
      for (const ref of registry.values()) {
        if (ref.toolScope && ref.toolScope.length > 0 && !ref.toolScope.includes(toolName)) {
          continue;
        }
        const value = process.env[ref.name];
        if (value !== undefined) {
          resolved[ref.name] = value;
        }
      }
      return resolved;
    },
    getRegisteredCredentials(): CredentialReference[] {
      return Array.from(registry.values());
    },
  };
}

const defaultRegistry = createCredentialRegistry();

export function registerCredentialReference(ref: CredentialReference): void {
  defaultRegistry.registerCredentialReference(ref);
}

export function resolveCredentialForTool(toolName: string): Record<string, string> {
  return defaultRegistry.resolveCredentialForTool(toolName);
}

export function getRegisteredCredentials(): CredentialReference[] {
  return defaultRegistry.getRegisteredCredentials();
}

// ── Redaction Patterns & Sensitive Keys ──────────────────────────────
const REDACT_SECRETS: RegExp[] = [
  /(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret|password|credential|private[_-]?key|bearer)[=:]\s*\S+/gi,
  /"?(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret|password|credential|private[_-]?key|bearer)"?\s*:\s*"[^"]+"/gi,
  /"[^"]*(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret|password|credential)"[^"]*"\s*:\s*"[A-Za-z0-9]{8,}"/gi,
  /(sk-[A-Za-z0-9]{20,})/g,
  /(ghp_[A-Za-z0-9]{36})/g,
  /(glpat-[A-Za-z0-9_-]{20,})/g,
  /(xox[bpsar]-[A-Za-z0-9-]+)/g,
];

const SENSITIVE_ENV_KEYS = new Set([
  'AWS_SECRET_ACCESS_KEY', 'AWS_ACCESS_KEY_ID',
  'OPENAI_API_KEY', 'OPENAI_API_SECRET',
  'GITHUB_TOKEN', 'GITHUB_SECRET', 'GH_TOKEN',
  'NPM_TOKEN', 'NPM_SECRET',
  'DATABASE_URL', 'MONGO_URI', 'REDIS_URL',
  'SLACK_TOKEN', 'SLACK_SECRET',
  'SENDGRID_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_API_KEY',
  'PRIVATE_KEY', 'SIGNING_SECRET', 'WEBHOOK_SECRET',
]);

export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of REDACT_SECRETS) {
    result = result.replace(pattern, (match) => {
      const colonIndex = match.search(/[=:]/);
      if (colonIndex >= 0) {
        return match.slice(0, colonIndex + 2) + '[REDACTED]';
      }
      return match.slice(0, 4) + '...' + match.slice(-4);
    });
  }
  return result;
}

export function sanitizeEnv(env: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (SENSITIVE_ENV_KEYS.has(key.toUpperCase())) {
      sanitized[key] = value ? `${value.slice(0, 4)}...[REDACTED]` : '';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function safeEnv(envKey: string, env: Record<string, string> = process.env as Record<string, string>): string | undefined {
  if (SENSITIVE_ENV_KEYS.has(envKey.toUpperCase())) {
    return undefined;
  }
  return env[envKey];
}

export function redactPayload(payload: unknown): unknown {
  if (typeof payload === 'string') return redactSecrets(payload);
  if (typeof payload !== 'object' || payload === null) return payload;
  if (Array.isArray(payload)) return payload.map(redactPayload);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (SENSITIVE_ENV_KEYS.has(key.toUpperCase()) && typeof value === 'string') {
      result[key] = value ? `${value.slice(0, 4)}...[REDACTED]` : '';
    } else {
      result[key] = redactPayload(value);
    }
  }
  return result;
}

export function redactState(state: GraphStateLike | null): string {
  if (!state) return 'null';
  const raw = JSON.stringify(state, null, 2);
  return redactSecrets(raw);
}
