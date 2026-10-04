import type BetterSqlite3 from 'better-sqlite3';
import {
  EXPORT_TOOLS,
  READ_ONLY_TOOLS,
  WRITE_TOOLS,
  type McpToolName,
} from './policy';

export type McpPolicy = {
  read_enabled: boolean;
  exports_enabled: boolean;
  write_create_enabled: boolean;
  write_update_enabled: boolean;
  write_set_occurrence_enabled: boolean;
};

export type McpPolicyDto = McpPolicy & { updated_at: string };

type PolicyRow = {
  read_enabled: number;
  exports_enabled: number;
  write_create_enabled: number;
  write_update_enabled: number;
  write_set_occurrence_enabled: number;
  updated_at: string;
};

export function defaultMcpPolicy(): McpPolicy {
  return {
    read_enabled: true,
    exports_enabled: true,
    write_create_enabled: false,
    write_update_enabled: false,
    write_set_occurrence_enabled: false,
  };
}

function toDto(row: PolicyRow): McpPolicyDto {
  return {
    read_enabled: row.read_enabled === 1,
    exports_enabled: row.exports_enabled === 1,
    write_create_enabled: row.write_create_enabled === 1,
    write_update_enabled: row.write_update_enabled === 1,
    write_set_occurrence_enabled: row.write_set_occurrence_enabled === 1,
    updated_at: row.updated_at,
  };
}

export function getMcpPolicy(db: BetterSqlite3.Database): McpPolicyDto {
  const row = db.prepare('SELECT * FROM mcp_policy WHERE id = 1').get() as PolicyRow | undefined;
  if (!row) {
    return { ...defaultMcpPolicy(), updated_at: '1970-01-01T00:00:00.000Z' };
  }
  return toDto(row);
}

export function updateMcpPolicy(
  db: BetterSqlite3.Database,
  patch: Partial<McpPolicy>,
  nowUtc: string,
): McpPolicyDto {
  const next = { ...getMcpPolicy(db), ...patch };
  db.prepare(
    `UPDATE mcp_policy
        SET read_enabled = ?, exports_enabled = ?, write_create_enabled = ?,
            write_update_enabled = ?, write_set_occurrence_enabled = ?, updated_at = ?
      WHERE id = 1`,
  ).run(
    next.read_enabled ? 1 : 0,
    next.exports_enabled ? 1 : 0,
    next.write_create_enabled ? 1 : 0,
    next.write_update_enabled ? 1 : 0,
    next.write_set_occurrence_enabled ? 1 : 0,
    nowUtc,
  );
  return getMcpPolicy(db);
}

/** True when the tool is permitted by the persisted policy. */
export function isToolEnabled(policy: McpPolicy, tool: McpToolName | string): boolean {
  if ((READ_ONLY_TOOLS as readonly string[]).includes(tool)) return policy.read_enabled;
  if ((EXPORT_TOOLS as readonly string[]).includes(tool)) return policy.exports_enabled;
  if (tool === 'create_control') return policy.write_create_enabled;
  if (tool === 'update_control_metadata') return policy.write_update_enabled;
  if (tool === 'set_occurrence') return policy.write_set_occurrence_enabled;
  if ((WRITE_TOOLS as readonly string[]).includes(tool)) return false;
  return false;
}
