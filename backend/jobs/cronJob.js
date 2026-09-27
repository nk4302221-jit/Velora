import cron from 'node-cron';
import { executeQuery } from '../config/db.js';

/**
 * Periodically checks for expired memberships (every 5 minutes)
 * Deactivates active subscriptions where expiry_time <= CURRENT_TIMESTAMP
 * and revokes premium access from user profiles.
 */
export async function checkExpiredMemberships() {
  try {
    // 1. Find expired active subscriptions
    const expiredSubs = await executeQuery(`
      SELECT id, user_id, plan_id, expiry_time 
      FROM subscriptions 
      WHERE status = 'active' AND expiry_time <= CURRENT_TIMESTAMP
    `);

    if (expiredSubs.length > 0) {
      console.log(`[CronJob] Found ${expiredSubs.length} expired membership(s). Revoking access...`);

      for (const sub of expiredSubs) {
        // Mark subscription status as expired
        await executeQuery(
          "UPDATE subscriptions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [sub.id]
        );

        // Check if user has another active subscription; if not, clear active_plan_id
        const otherActive = await executeQuery(
          "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' AND expiry_time > CURRENT_TIMESTAMP",
          [sub.user_id]
        );

        if (otherActive.length === 0) {
          await executeQuery('UPDATE users SET active_plan_id = NULL WHERE id = ?', [sub.user_id]);
          console.log(`[CronJob] Revoked premium membership for user #${sub.user_id}`);
        }
      }
    }
  } catch (error) {
    console.error('[CronJob Error]: Failed to check expired memberships:', error.message);
  }
}

export function startMembershipCronJob() {
  // Run on startup
  checkExpiredMemberships();

  // Schedule to run every 5 minutes: '*/5 * * * *'
  const job = cron.schedule('*/5 * * * *', async () => {
    console.log('[CronJob] Running 5-minute membership expiry check...');
    await checkExpiredMemberships();
  });

  console.log('[CronJob] Membership expiry cron job scheduled (every 5 minutes)');
  return job;
}

export default { startMembershipCronJob, checkExpiredMemberships };
