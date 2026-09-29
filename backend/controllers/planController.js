import { executeQuery } from '../config/db.js';
import { successResponse, errorResponse } from '../utils/responseHelper.js';
import { createSubscriptionSession } from '../services/stripeService.js';
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
} from '../services/razorpayService.js';

export async function getPlans(req, res) {
  try {
    const plans = await executeQuery(
      "SELECT * FROM plans WHERE status = 'active' ORDER BY price ASC"
    );

    const formatted = plans.map((p) => ({
      ...p,
      benefits:
        typeof p.benefits === 'string'
          ? JSON.parse(p.benefits || '[]')
          : p.benefits,
    }));

    return successResponse(res, 'Membership plans retrieved', {
      plans: formatted,
    });
  } catch (error) {
    console.error('GetPlans Error:', error);
    return errorResponse(res, 'Failed to fetch membership plans', 500);
  }
}

export async function subscribePlan(req, res) {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    // FIXED: active must use single quotes
    const plans = await executeQuery(
      "SELECT * FROM plans WHERE id = ? AND status = 'active'",
      [planId]
    );

    if (plans.length === 0) {
      return errorResponse(res, 'Plan not found or inactive', 404);
    }

    const plan = plans[0];

    const clientUrl =
      process.env.CLIENT_URL || 'http://localhost:4000';

    // If Free Tier, activate immediately without payment
    if (Number(plan.price) === 0) {
      const now = new Date();

      const expiry = new Date(
        now.getTime() +
          plan.duration_hours * 60 * 60 * 1000
      );

      const expiryStr = expiry
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19);

      // Deactivate any existing active subscriptions
      await executeQuery(
        "UPDATE subscriptions SET status = 'cancelled' WHERE user_id = ? AND status = 'active'",
        [userId]
      );

      // Create new subscription
      await executeQuery(
        `INSERT INTO subscriptions
          (user_id, plan_id, start_time, expiry_time, status, payment_id)
         VALUES (?, ?, CURRENT_TIMESTAMP, ?, 'active', 'free_trial_grant')`,
        [userId, plan.id, expiryStr]
      );

      // Update user active_plan_id
      await executeQuery(
        'UPDATE users SET active_plan_id = ? WHERE id = ?',
        [plan.id, userId]
      );

      return successResponse(
        res,
        `Congratulations! You have activated the ${plan.name} for ${plan.duration_hours} hour(s).`,
        {
          planId: plan.id,
          planName: plan.name,
          expiryTime: expiryStr,
          status: 'active',
        }
      );
    }

    // For Paid Tiers (Silver / Gold), initiate Stripe checkout session
    const session = await createSubscriptionSession({
      planId: plan.id,
      planName: plan.name,
      price: plan.price,
      customerEmail: req.user.email,
      successUrl: `${clientUrl}/plans`,
      cancelUrl: `${clientUrl}/plans`,
    });

    return successResponse(
      res,
      'Subscription checkout session initiated',
      {
        checkoutUrl: session.url,
        sessionId: session.id,
        isSandboxMock: session.isSandboxMock,
      }
    );
  } catch (error) {
    console.error('SubscribePlan Error:', error);
    return errorResponse(
      res,
      'Failed to process plan subscription',
      500
    );
  }
}

export async function confirmSubscriptionPayment(req, res) {
  try {
    const userId = req.user.id;
    const { planId, sessionId } = req.body;

    const plans = await executeQuery(
      'SELECT * FROM plans WHERE id = ?',
      [planId]
    );

    if (plans.length === 0) {
      return errorResponse(res, 'Plan not found', 404);
    }

    const plan = plans[0];

    const now = new Date();

    const expiry = new Date(
      now.getTime() +
        plan.duration_hours * 60 * 60 * 1000
    );

    const expiryStr = expiry
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19);

    // Cancel old active subscriptions
    await executeQuery(
      "UPDATE subscriptions SET status = 'cancelled' WHERE user_id = ? AND status = 'active'",
      [userId]
    );

    const paymentId =
      sessionId || `sub_pay_${Date.now()}`;

    // Insert new active subscription
    await executeQuery(
      `INSERT INTO subscriptions
        (user_id, plan_id, start_time, expiry_time, status, payment_id)
       VALUES (?, ?, CURRENT_TIMESTAMP, ?, 'active', ?)`,
      [userId, plan.id, expiryStr, paymentId]
    );

    // Update user active plan
    await executeQuery(
      'UPDATE users SET active_plan_id = ? WHERE id = ?',
      [plan.id, userId]
    );

    return successResponse(
      res,
      `Successfully upgraded to ${plan.name}! Valid for ${plan.duration_hours} hours.`,
      {
        planId: plan.id,
        planName: plan.name,
        expiryTime: expiryStr,
        status: 'active',
      }
    );
  } catch (error) {
    console.error(
      'ConfirmSubscriptionPayment Error:',
      error
    );

    return errorResponse(
      res,
      'Failed to confirm plan payment',
      500
    );
  }
}

export async function createRazorpayPlanOrder(req, res) {
  try {
    const userId = req.user.id;
    const { planId } = req.params;

    // FIXED: active must use single quotes
    const plans = await executeQuery(
      "SELECT * FROM plans WHERE id = ? AND status = 'active'",
      [planId]
    );

    if (plans.length === 0) {
      return errorResponse(res, 'Plan not found', 404);
    }

    const plan = plans[0];

    // If free tier, activate directly
    if (Number(plan.price) === 0) {
      const now = new Date();

      const expiry = new Date(
        now.getTime() +
          plan.duration_hours * 60 * 60 * 1000
      );

      const expiryStr = expiry
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19);

      await executeQuery(
        "UPDATE subscriptions SET status = 'cancelled' WHERE user_id = ? AND status = 'active'",
        [userId]
      );

      await executeQuery(
        `INSERT INTO subscriptions
          (user_id, plan_id, start_time, expiry_time, status, payment_id)
         VALUES (?, ?, CURRENT_TIMESTAMP, ?, 'active', 'free_trial_grant')`,
        [userId, plan.id, expiryStr]
      );

      await executeQuery(
        'UPDATE users SET active_plan_id = ? WHERE id = ?',
        [plan.id, userId]
      );

      return successResponse(
        res,
        `Activated ${plan.name} successfully!`,
        {
          planId: plan.id,
          isFree: true,
        }
      );
    }

    // Create Razorpay order for paid plan
    const razorpayOrder = await createRazorpayOrder({
      amount: plan.price,
      currency: 'INR',
      receipt: `plan_rcpt_${plan.id}_${userId}`,
      notes: {
        planId: String(plan.id),
        planName: plan.name,
        userId: String(userId),
        userEmail: req.user.email,
      },
    });

    return successResponse(
      res,
      'Razorpay order generated for plan subscription',
      {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId: razorpayOrder.keyId,
        isSandboxMock: razorpayOrder.isSandboxMock,
      }
    );
  } catch (error) {
    console.error(
      'CreateRazorpayPlanOrder Error:',
      error
    );

    return errorResponse(
      res,
      'Failed to create plan Razorpay order',
      500
    );
  }
}

export async function verifyRazorpayPlanPayment(req, res) {
  try {
    const userId = req.user.id;

    const {
      planId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body;

    const plans = await executeQuery(
      'SELECT * FROM plans WHERE id = ?',
      [planId]
    );

    if (plans.length === 0) {
      return errorResponse(res, 'Plan not found', 404);
    }

    const plan = plans[0];

    const isValid = await verifyRazorpaySignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!isValid) {
      return errorResponse(
        res,
        'Invalid Razorpay signature',
        400
      );
    }

    const now = new Date();

    const expiry = new Date(
      now.getTime() +
        plan.duration_hours * 60 * 60 * 1000
    );

    const expiryStr = expiry
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19);

    await executeQuery(
      "UPDATE subscriptions SET status = 'cancelled' WHERE user_id = ? AND status = 'active'",
      [userId]
    );

    await executeQuery(
      `INSERT INTO subscriptions
        (user_id, plan_id, start_time, expiry_time, status, payment_id)
       VALUES (?, ?, CURRENT_TIMESTAMP, ?, 'active', ?)`,
      [
        userId,
        plan.id,
        expiryStr,
        razorpayPaymentId,
      ]
    );

    await executeQuery(
      'UPDATE users SET active_plan_id = ? WHERE id = ?',
      [plan.id, userId]
    );

    return successResponse(
      res,
      `Successfully upgraded to ${plan.name} via Razorpay!`,
      {
        planId: plan.id,
        planName: plan.name,
        expiryTime: expiryStr,
        status: 'active',
      }
    );
  } catch (error) {
    console.error(
      'VerifyRazorpayPlanPayment Error:',
      error
    );

    return errorResponse(
      res,
      'Failed to verify Razorpay plan payment',
      500
    );
  }
}

export async function getMyMembership(req, res) {
  try {
    const userId = req.user.id;

    const subs = await executeQuery(
      `SELECT
        s.*,
        p.name as plan_name,
        p.duration_hours,
        p.benefits,
        p.price
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.user_id = ? AND s.status = 'active'
       ORDER BY s.created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (subs.length === 0) {
      return successResponse(
        res,
        'No active membership',
        {
          active: false,
          membership: null,
        }
      );
    }

    const sub = subs[0];

    const isExpired =
      new Date(sub.expiry_time).getTime() <= Date.now();

    if (isExpired) {
      // Mark as expired in DB
      await executeQuery(
        "UPDATE subscriptions SET status = 'expired' WHERE id = ?",
        [sub.id]
      );

      await executeQuery(
        'UPDATE users SET active_plan_id = NULL WHERE id = ?',
        [userId]
      );

      return successResponse(
        res,
        'Membership has expired',
        {
          active: false,
          membership: null,
        }
      );
    }

    return successResponse(
      res,
      'Active membership retrieved',
      {
        active: true,
        membership: {
          ...sub,
          benefits:
            typeof sub.benefits === 'string'
              ? JSON.parse(sub.benefits || '[]')
              : sub.benefits,
        },
      }
    );
  } catch (error) {
    console.error('GetMyMembership Error:', error);

    return errorResponse(
      res,
      'Failed to fetch membership status',
      500
    );
  }
}