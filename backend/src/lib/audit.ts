import { query, type DbClient } from '../db/pool.js';

export async function logAudit(
  actorUserId: number | null | undefined,
  action: string,
  entityType: string,
  entityId: string | number | null,
  details: Record<string, unknown> = {},
  client?: DbClient,
) {
  await query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorUserId ?? null, action, entityType, entityId === null ? null : String(entityId), JSON.stringify(details)],
    client,
  );
}
