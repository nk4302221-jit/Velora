import { executeQuery } from '../config/db.js';
import { normalizeRole } from './roleHelper.js';

// =====================================================
// AUDIT LOGGING
//
// Every privileged mutation records who did what, from where. Writes are
// best-effort: an audit failure must never roll back or break the business
// operation the user actually requested.
// =====================================================

/** Truncate free-text values so a hostile payload cannot bloat the table. */
function clamp(value, max) {
  if (value === undefined || value === null) return null;
  return String(value).slice(0, max);
}

function serializeDetails(details) {
  if (details === undefined || details === null) return null;

  if (typeof details === 'string') {
    return clamp(details, 2000);
  }

  try {
    return clamp(JSON.stringify(details), 2000);
  } catch {
    return null;
  }
}

/**
 * Appends an audit entry.
 *
 * @param {object} entry
 * @param {import('express').Request} [entry.req]     request to derive actor/IP from
 * @param {string} entry.action                      e.g. 'admin.created'
 * @param {string} [entry.entityType]                e.g. 'user'
 * @param {string|number} [entry.entityId]
 * @param {object|string} [entry.details]
 * @param {object} [entry.actor]                     explicit actor override
 */
export async function recordAudit({
  req,
  action,
  entityType = null,
  entityId = null,
  details = null,
  actor = null,
}) {
  try {
    const resolvedActorId = actor?.id ?? req?.user?.id ?? null;
    const resolvedEmail = actor?.email ?? req?.user?.email ?? null;
    const resolvedRole = normalizeRole(actor?.role ?? req?.user?.role ?? '') || null;

    await executeQuery(
      `INSERT INTO audit_logs
        (actor_id, actor_email, actor_role, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resolvedActorId,
        clamp(resolvedEmail, 191),
        clamp(resolvedRole, 20),
        clamp(action, 100),
        clamp(entityType, 50),
        clamp(entityId, 64),
        serializeDetails(details),
        clamp(req?.ip, 64),
        clamp(req?.get?.('user-agent'), 255),
      ]
    );
  } catch (error) {
    // Never surface audit failures to the caller - the business action already
    // succeeded and must not be reported as a failure because of bookkeeping.
    console.warn('[Audit] failed to record entry:', {
      action,
      message: error.message,
    });
  }
}
