/**
 * Schema Guard Hook
 *
 * Validates critical state files against their JSON Schema definitions on write.
 * Catches structural corruption before it poisons the harness runtime.
 *
 * Covered files:
 *   - routing-table.json (in control/config/ or plugin/config/)
 *   - features.json (in .agent-memory/)
 *   - state-index.json / managed-agent-state-index.json (in .agent-memory/)
 *   - harness-plugin-state.json (in .agent-memory/)
 *
 * Triggered on PostToolUse for Edit/Write targeting these files.
 *
 * Dependencies: schemas are in hooks/schemas/*.schema.json
 *   The script resolves schema paths relative to this hook file's directory.
 */
export default {
  name: "schema-guard",
  description: "Validate critical harness state files against their JSON schemas on write",
  match: ["Edit", "Write"],
  handler: async ({ input, toolName }) => {
    try {
      const targetPath = (input.file_path || input.path || '');

      // Determine which schema applies
      const schemaFile = resolveSchema(targetPath);
      if (!schemaFile) {
        return { continue: true, suppressOutput: true };
      }

      // Extract the new content
      const newContent = toolName === 'Write'
        ? (input.content || '')
        : (input.new_string || '');

      if (!newContent || newContent.trim().length === 0) {
        return { continue: true, suppressOutput: true };
      }

      // Parse the content (handle both full replacement and partial edits)
      let data;
      try {
        data = JSON.parse(newContent);
      } catch (parseError) {
        // JSON parse errors are handled by json-error-recovery hook
        // Let it pass here so we don't double-block
        console.error(JSON.stringify({
          event: "schema_guard_parse_error",
          file: targetPath,
          error: parseError.message
        }));
        return { continue: true, suppressOutput: true };
      }

      // Resolve schema path relative to this hook file
      const thisFileDir = new URL('.', import.meta.url).pathname;
      const schemaPath = `${thisFileDir}schemas/${schemaFile}`;

      let schema;
      try {
        schema = JSON.parse(await Deno.readTextFile(schemaPath));
      } catch {
        console.error(JSON.stringify({
          event: "schema_guard_schema_load_failed",
          schema: schemaPath
        }));
        // Can't validate without schema — warn but allow
        console.error(`schema-guard WARNING: Cannot load schema ${schemaFile} — validation skipped for ${targetPath}`);
        return { continue: true, suppressOutput: true };
      }

      // Validate
      const errors = validateSchema(data, schema, 'root');

      if (errors.length === 0) {
        return { continue: true, suppressOutput: true };
      }

      // Block write with detailed error report
      const errorReport = [
        `Schema validation FAILED for ${targetPath}`,
        `Schema: ${schemaFile}`,
        `Errors found: ${errors.length}`,
        '',
        ...errors.slice(0, 15).map((e, i) => `  ${i + 1}. ${e}`),
        errors.length > 15 ? `  ... and ${errors.length - 15} more errors` : '',
        '',
        'Recovery options:',
        '1. Fix the structural errors listed above and retry.',
        `2. Check the schema at hooks/schemas/${schemaFile} for expected structure.`,
        '3. If the schema itself is wrong, update it and re-run setup.sh.',
        '4. For emergency bypass: add SCHEMA_GUARD_BYPASS marker to your content.'
      ].join('\n');

      // Allow bypass with marker
      if (newContent.includes('SCHEMA_GUARD_BYPASS')) {
        console.error(JSON.stringify({
          event: "schema_guard_bypassed",
          file: targetPath,
          schema: schemaFile,
          error_count: errors.length
        }));
        return { continue: true, suppressOutput: true };
      }

      console.error(JSON.stringify({
        event: "schema_guard_blocked",
        file: targetPath,
        schema: schemaFile,
        error_count: errors.length,
        errors: errors.slice(0, 10)
      }));

      return { continue: false, output: errorReport };

    } catch (error) {
      console.error('schema-guard error:', error.message);
      return { continue: true, suppressOutput: true };
    }
  }
};

// ─── Schema Resolution ───────────────────────────────────────────

function resolveSchema(targetPath) {
  if (!targetPath) return null;

  // .agent-memory/features.json
  if (targetPath.endsWith('/.agent-memory/features.json') || targetPath.endsWith('/features.json')) {
    // Only validate features.json if it's inside .agent-memory/
    if (targetPath.includes('.agent-memory')) {
      return 'features.schema.json';
    }
  }

  // control/config/routing-table.json or plugin/config/routing-table.json
  if (targetPath.endsWith('routing-table.json')) {
    return 'routing-table.schema.json';
  }

  // .agent-memory/managed-agent-state-index.json or .agent-memory/state-index.json
  if (targetPath.endsWith('managed-agent-state-index.json') || targetPath.endsWith('state-index.json')) {
    return 'state-index.schema.json';
  }

  // .agent-memory/harness-plugin-state.json
  if (targetPath.endsWith('harness-plugin-state.json')) {
    return 'state-index.schema.json';
  }

  return null;
}

// ─── Lightweight JSON Schema Validator ────────────────────────────
//
// Covers the critical subset of JSON Schema needed for harness state files:
//   - type checks (object, array, string, number, boolean, null)
//   - required fields
//   - enum validation
//   - minLength/maxLength for strings
//   - minItems/maxItems for arrays
//   - property type checks (nested objects)
//   - oneOf/anyOf basic support
//   - patternProperties

function validateSchema(data, schema, path) {
  const errors = [];

  if (!schema || typeof schema !== 'object') {
    return errors;
  }

  // Type check
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = Array.isArray(data) ? 'array' : data === null ? 'null' : typeof data;
    if (!types.includes(actualType)) {
      errors.push(`${path}: expected type ${types.join('|')}, got ${actualType} (value: ${truncate(JSON.stringify(data))})`);
      return errors; // Stop: type mismatch makes further checks meaningless
    }
  }

  // Null check
  if (schema.type === 'null' || (Array.isArray(schema.type) && schema.type.includes('null'))) {
    if (data === null) return errors;
  }

  // Object validation
  if (schema.type === 'object' && typeof data === 'object' && data !== null && !Array.isArray(data)) {

    // Required fields
    if (Array.isArray(schema.required)) {
      for (const requiredField of schema.required) {
        if (!(requiredField in data)) {
          errors.push(`${path}: missing required field "${requiredField}"`);
        }
      }
    }

    // Pattern properties
    if (schema.patternProperties) {
      for (const [pattern, subSchema] of Object.entries(schema.patternProperties)) {
        const regex = new RegExp(pattern);
        for (const key of Object.keys(data)) {
          if (regex.test(key)) {
            errors.push(...validateSchema(data[key], subSchema, `${path}.${key}`));
          }
        }
      }
    }

    // Property validation
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName in data) {
          errors.push(...validateSchema(data[propName], propSchema, `${path}.${propName}`));
        }
      }
    }

    // Additional properties (for strict validation)
    if (schema.additionalProperties === false && schema.properties && schema.patternProperties === undefined) {
      const allowedKeys = Object.keys(schema.properties);
      for (const key of Object.keys(data)) {
        if (!allowedKeys.includes(key)) {
          errors.push(`${path}: unexpected property "${key}" (not allowed by schema)`);
        }
      }
    }

    // Min/Max properties
    if (typeof schema.minProperties === 'number') {
      const count = Object.keys(data).length;
      if (count < schema.minProperties) {
        errors.push(`${path}: expected at least ${schema.minProperties} properties, got ${count}`);
      }
    }
  }

  // Array validation
  if (schema.type === 'array' && Array.isArray(data)) {

    if (typeof schema.minItems === 'number' && data.length < schema.minItems) {
      errors.push(`${path}: expected at least ${schema.minItems} items, got ${data.length}`);
    }

    if (typeof schema.maxItems === 'number' && data.length > schema.maxItems) {
      errors.push(`${path}: expected at most ${schema.maxItems} items, got ${data.length}`);
    }

    // Items validation
    if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
      for (let i = 0; i < data.length; i++) {
        errors.push(...validateSchema(data[i], schema.items, `${path}[${i}]`));
      }
    }
  }

  // String validation
  if (schema.type === 'string' && typeof data === 'string') {
    if (typeof schema.minLength === 'number' && data.length < schema.minLength) {
      errors.push(`${path}: string too short (min ${schema.minLength}, got ${data.length})`);
    }
    if (typeof schema.maxLength === 'number' && data.length > schema.maxLength) {
      errors.push(`${path}: string too long (max ${schema.maxLength}, got ${data.length})`);
    }
    if (schema.pattern && typeof schema.pattern === 'string') {
      try {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(data)) {
          errors.push(`${path}: "${truncate(data)}" does not match pattern ${schema.pattern}`);
        }
      } catch {
        // Invalid regex in schema, skip
      }
    }
  }

  // Number validation
  if ((schema.type === 'number' || schema.type === 'integer') && typeof data === 'number') {
    if (typeof schema.minimum === 'number' && data < schema.minimum) {
      errors.push(`${path}: value ${data} is below minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && data > schema.maximum) {
      errors.push(`${path}: value ${data} is above maximum ${schema.maximum}`);
    }
  }

  // Enum
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.includes(data)) {
      errors.push(`${path}: "${truncate(String(data))}" is not a valid enum value (allowed: ${schema.enum.join(', ')})`);
    }
  }

  // oneOf (basic support)
  if (Array.isArray(schema.oneOf)) {
    const passingSchemas = [];
    for (let i = 0; i < schema.oneOf.length; i++) {
      const subErrors = validateSchema(data, schema.oneOf[i], `${path}[oneOf#${i}]`);
      if (subErrors.length === 0) {
        passingSchemas.push(i);
      }
    }
    if (passingSchemas.length === 0) {
      errors.push(`${path}: value does not match any of the oneOf alternatives`);
    } else if (passingSchemas.length > 1) {
      errors.push(`${path}: value matches multiple oneOf alternatives (${passingSchemas.join(', ')}) — ambiguous`);
    }
  }

  return errors;
}

// ─── Helpers ──────────────────────────────────────────────────────

function truncate(str, maxLen = 80) {
  if (typeof str !== 'string') return String(str);
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}
