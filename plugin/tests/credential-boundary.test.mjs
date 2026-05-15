import test from 'node:test';
import assert from 'node:assert/strict';

import {
  redactSecrets,
  sanitizeEnv,
  safeEnv,
  redactPayload,
  redactState,
  registerCredentialReference,
  resolveCredentialForTool,
} from '../dist/index.js';

// ── redactSecrets ─────────────────────────────────────────────────────

test('redactSecrets redacts API key patterns from text', async () => {
  // "api_key=" triggers the key=value redaction which uses [REDACTED]
  const input = 'api_key=sk-abcdefghij1234567890abcdefghij';
  const result = redactSecrets(input);
  assert.ok(result.includes('[REDACTED]'));
  assert.ok(!result.includes('sk-abcdefghij1234567890abcdefghij'));
});

test('redactSecrets redacts token patterns from text', async () => {
  // Standalone token without key=value format uses "..." redaction
  const input = 'ghp_1234567890abcdef1234567890abcdef1234';
  const result = redactSecrets(input);
  assert.ok(!result.includes('ghp_1234567890abcdef1234567890abcdef1234'));
  assert.ok(result.includes('...'));
  assert.notEqual(result, input);
});

test('redactSecrets handles text with no secrets (returns unchanged)', async () => {
  const input = 'This is safe text with no secrets at all.';
  const result = redactSecrets(input);
  assert.equal(result, input);
});

test('redactSecrets redacts Slack tokens', async () => {
  // Standalone token uses "..." redaction
  const input = 'xoxb-1234567890-abcdefghij';
  const result = redactSecrets(input);
  assert.ok(!result.includes('xoxb-1234567890-abcdefghij'));
  assert.ok(result.includes('...'));
  assert.notEqual(result, input);
});

// ── sanitizeEnv ────────────────────────────────────────────────────────

test('sanitizeEnv masks sensitive env keys', async () => {
  const env = {
    AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    OPENAI_API_KEY: 'sk-proj-abc123',
    GITHUB_TOKEN: 'ghp_secret123',
    PATH: '/usr/bin:/bin',
    HOME: '/home/user',
    LANG: 'en_US.UTF-8',
  };
  const result = sanitizeEnv(env);

  assert.ok(result.AWS_SECRET_ACCESS_KEY.includes('[REDACTED]'));
  assert.ok(result.OPENAI_API_KEY.includes('[REDACTED]'));
  assert.ok(result.GITHUB_TOKEN.includes('[REDACTED]'));
  assert.equal(result.PATH, '/usr/bin:/bin');
  assert.equal(result.HOME, '/home/user');
  assert.equal(result.LANG, 'en_US.UTF-8');
});

test('sanitizeEnv passes through safe env keys unchanged', async () => {
  const env = {
    PATH: '/usr/local/bin:/usr/bin',
    HOME: '/home/testuser',
    LANG: 'C.UTF-8',
    EDITOR: 'vim',
    SHELL: '/bin/zsh',
  };
  const result = sanitizeEnv(env);

  assert.deepEqual(result, env);
});

// ── safeEnv ────────────────────────────────────────────────────────────

test('safeEnv returns undefined for sensitive keys', async () => {
  const env = { AWS_SECRET_ACCESS_KEY: 'topsecret', OPENAI_API_KEY: 'sk-key', GITHUB_TOKEN: 'ghp_tok' };
  assert.equal(safeEnv('AWS_SECRET_ACCESS_KEY', env), undefined);
  assert.equal(safeEnv('OPENAI_API_KEY', env), undefined);
  assert.equal(safeEnv('GITHUB_TOKEN', env), undefined);
});

test('safeEnv returns value for safe keys', async () => {
  const env = { PATH: '/bin', HOME: '/root', LANG: 'en' };
  assert.equal(safeEnv('PATH', env), '/bin');
  assert.equal(safeEnv('HOME', env), '/root');
  assert.equal(safeEnv('LANG', env), 'en');
});

test('safeEnv is case-insensitive for sensitive key detection', async () => {
  const env = { aws_secret_access_key: 'secret' };
  assert.equal(safeEnv('aws_secret_access_key', env), undefined);
});

// ── redactPayload ──────────────────────────────────────────────────────

test('redactPayload redacts secrets in nested objects', async () => {
  // OPENAI_API_KEY is in SENSITIVE_ENV_KEYS — triggers direct masking
  const payload = {
    config: {
      OPENAI_API_KEY: 'sk-012345678901234567890123456789',
      safe_field: 'hello',
      nested: {
        GITHUB_TOKEN: 'ghp_1234567890abcdef1234567890abcdef1234',
      },
    },
  };
  const result = redactPayload(payload);

  assert.ok(result.config.OPENAI_API_KEY.includes('[REDACTED]'));
  assert.equal(result.config.safe_field, 'hello');
  assert.ok(result.config.nested.GITHUB_TOKEN.includes('[REDACTED]'));
});

test('redactPayload redacts secrets in arrays', async () => {
  const payload = {
    items: [
      { AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE' },
      { GITHUB_TOKEN: 'ghp_abcdef1234567890abcdef1234567890abcd' },
    ],
  };
  const result = redactPayload(payload);

  assert.ok(result.items[0].AWS_ACCESS_KEY_ID.includes('[REDACTED]'));
  assert.ok(result.items[1].GITHUB_TOKEN.includes('[REDACTED]'));
});

test('redactPayload handles string input', async () => {
  const result = redactPayload('api_key=sk-abc123def456');
  assert.ok(result.includes('[REDACTED]'));
});

test('redactPayload handles primitive input', async () => {
  assert.equal(redactPayload(42), 42);
  assert.equal(redactPayload(true), true);
  assert.equal(redactPayload(null), null);
});

// ── redactState ────────────────────────────────────────────────────────

test('redactState redacts secrets from state-like object', async () => {
  const state = {
    routeId: 'F-M1-test',
    credentials: {
      OPENAI_API_KEY: 'sk-state-secret-key-12345',
    },
    safeData: 'hello world',
  };
  const result = redactState(state);

  assert.ok(!result.includes('sk-state-secret-key-12345'));
  assert.ok(result.includes('[REDACTED]'));
  assert.ok(result.includes('F-M1-test'));
  assert.ok(result.includes('hello world'));
});

test('redactState returns "null" for null input', async () => {
  assert.equal(redactState(null), 'null');
});

// ── registerCredentialReference / resolveCredentialForTool ─────────────

test('registerCredentialReference adds to registry', async () => {
  registerCredentialReference({
    name: 'TEST_UNIQUE_CRED_1',
    provider: 'openai',
    toolScope: ['test-tool'],
  });
  // Registration doesn't throw — verified by resolve below
  assert.ok(true);
});

test('resolveCredentialForTool returns registered credentials from env', async () => {
  // Set env var for this test
  process.env.TEST_CRED_TOOL_2 = 'sk-test-tool-value-123456789';

  registerCredentialReference({
    name: 'TEST_CRED_TOOL_2',
    provider: 'openai',
    toolScope: ['my-test-tool'],
  });

  const result = resolveCredentialForTool('my-test-tool');
  assert.ok(result.TEST_CRED_TOOL_2);
  assert.equal(result.TEST_CRED_TOOL_2, 'sk-test-tool-value-123456789');

  delete process.env.TEST_CRED_TOOL_2;
});

test('resolveCredentialForTool filters by tool scope', async () => {
  process.env.TEST_CRED_SCOPED = 'scoped-value';
  process.env.TEST_CRED_UNSCOPED = 'unscoped-value';

  registerCredentialReference({
    name: 'TEST_CRED_SCOPED',
    provider: 'github',
    toolScope: ['scoped-tool'],
  });
  registerCredentialReference({
    name: 'TEST_CRED_UNSCOPED',
    provider: 'github',
    toolScope: undefined,
  });

  // Scoped tool — only TEST_CRED_SCOPED and unscoped creds should return
  const scopedResult = resolveCredentialForTool('scoped-tool');
  assert.equal(scopedResult.TEST_CRED_SCOPED, 'scoped-value');
  assert.equal(scopedResult.TEST_CRED_UNSCOPED, 'unscoped-value');

  // Different tool — only unscoped creds should return
  const otherResult = resolveCredentialForTool('other-tool');
  assert.equal(otherResult.TEST_CRED_SCOPED, undefined);
  assert.equal(otherResult.TEST_CRED_UNSCOPED, 'unscoped-value');

  delete process.env.TEST_CRED_SCOPED;
  delete process.env.TEST_CRED_UNSCOPED;
});

test('resolveCredentialForTool returns empty object when no matching creds', async () => {
  registerCredentialReference({
    name: 'TEST_CRED_NO_MATCH',
    provider: 'openai',
    toolScope: ['exclusive-tool'],
  });

  const result = resolveCredentialForTool('different-tool');
  assert.deepEqual(result, {});
});
