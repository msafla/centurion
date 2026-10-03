import type { ZodType } from 'zod';

/**
 * Removes C0/C1/DEL, Unicode category Cf, variation selectors and tags, and
 * replaces LF/CR/TAB with spaces in text excerpts. This is a projection for the
 * host only; canonical data stays untouched in SQLite, UI and exports.
 */
export function sanitizeText(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: deliberate control-character stripping
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/\p{Cf}/gu, '')
    .replace(/[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu, '');
}

function walk(value: unknown, path: string, changed: string[]): unknown {
  if (typeof value === 'string') {
    const sanitized = sanitizeText(value);
    if (sanitized !== value) changed.push(path);
    return sanitized;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => walk(item, `${path}[${index}]`, changed));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = walk(item, path ? `${path}.${key}` : key, changed);
    }
    return result;
  }
  return value;
}

export function projectMcpOutput(
  input: unknown,
  schema: ZodType,
): { data: unknown; sanitized_fields: string[] } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error('mcp_output_schema_mismatch');
  }
  const changed: string[] = [];
  const data = walk(parsed.data, '', changed);
  return { data, sanitized_fields: changed };
}
