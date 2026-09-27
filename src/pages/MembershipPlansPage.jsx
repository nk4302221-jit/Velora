import React, { useState, useEffect } from 'react';
import { Crown, Check, Clock, Zap, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';
import api from '../api/client';
import { loadRazorpayCheckout, openRazorpayCheckout } from '../api/razorpay';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const MembershipPlansPage = () => {
  const { user, membership, refreshMembership } = useAuth();
  const { showToast } = useToast();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscribingId, setSubscribingId] = useState(null);

  useEffect(() => {
    async function fetchPlans() {
      try {
        setLoading(true);
        const res = await api.get('/plans');
        if (res.data.success) {
          setPlans(res.data.data.plans);
        }
      } catch (err) {
        console.error('Failed to load plans:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPlans();
  }, []);

  const handleSubscribe = async (plan) => {
    if (!user) {
      showToast('Please sign in or register to activate a membership pass', 'info');
      return;
    }

    setSubscribingId(plan.id);

    try {
      // Step 1: Request Razorpay Order for Plan
      const res = await api.post(`/plans/${plan.id}/razorpay/create-order`);
      const data = res.data.data;

      if (data.isFree) {
        // Free trial activated directly!
        await refreshMembership();
        showToast(res.data.message || `Activated ${plan.name} successfully!`, 'success');
        setSubscribingId(null);
        return;
      }

      // Step 2: Open Razorpay Checkout, or fall back to sandbox simulation
      // when no real Razorpay keys are configured on the backend.
      if (!data.isSandboxMock) {
        // Wait for the SDK so window.Razorpay is guaranteed to exist.
        await loadRazorpayCheckout();

        openRazorpayCheckout({
          keyId: data.keyId,
          razorpayOrderId: data.orderId,
          amount: data.amount,
          currency: data.currency || 'INR',
          name: 'Velora Membership',
          description: `${plan.name} (${plan.duration_hours} Hours)`,
          prefill: {
            name: user.full_name,
            email: user.email,
          },
          theme: { color: '#2563eb' },
          onSuccess: async (response) => {
            try {
              const verifyRes = await api.post('/plans/razorpay/verify-payment', {
                planId: plan.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });

              if (verifyRes.data.success) {
                await refreshMembership();
                showToast(`Upgraded to ${plan.name} successfully!`, 'success');
              }
            } catch (vErr) {
              showToast(vErr.response?.data?.message || 'Verification failed', 'error');
            }
          },
          onFailure: () => {
            showToast('Payment was not completed. Your membership has not been upgraded.', 'error');
          },
        });
      } else {
        // High fidelity sandbox simulation
        showToast(`Activating ${plan.name} in Sandbox Mode...`, 'info');
        const verifyRes = await api.post('/plans/razorpay/verify-payment', {
          planId: plan.id,
          razorpayOrderId: data.orderId,
          razorpayPaymentId: `pay_rzp_plan_${Date.now()}`,
          razorpaySignature: `sig_rzp_${Date.now()}`,
        });

        if (verifyRes.data.success) {
          await refreshMembership();
          showToast(`Successfully upgraded to ${plan.name}! Enjoy your VIP discounts.`, 'success');
        }
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Subscription failed', 'error');
    } finally {
      setSubscribingId(null);
    }
  };

  return (
    <div className="site-wrapper" style={{ margin: '40px auto 80px' }} id="membership-plans-container">
      {/* Header */}
      <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 48px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--primary-light)',
            color: 'var(--primary)',
            padding: '6px 14px',
            borderRadius: 'var(--radius-full)',
            fontSize: '12px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '16px',
          }}
        >
          <Crown size={15} /> Timed VIP Pass Engine
        </div>
        <h1 style={{ fontSize: '36px', marginBottom: '12px' }}>
          Accelerate Savings with Instant Member Passes
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1.6 }}>
          Unlock exclusive percentage discounts on every catalog item, free priority express shipping,
          and concierge service. Passes run on automated cron timers with live status tracking.
        </p>
      </div>

      {/* Active Membership Status Notification Card */}
      {membership?.active && (
        <div
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
            color: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            padding: '24px 32px',
            marginBottom: '40px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            boxShadow: 'var(--shadow-lg)',
          }}
          id="active-plan-status-card"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Crown size={26} color="#fef08a" />
            </div>
            <div>
              <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px', color: '#93c5fd', fontWeight: 700 }}>
                Active Membership
              </div>
              <h2 style={{ fontSize: '22px', color: '#ffffff', margin: 0 }}>
                {membership.plan_name} Active
              </h2>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: '#bfdbfe' }}>Pass Expiry Time</div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#ffffff' }}>
                {membership.expiry_time
                  ? new Date(membership.expiry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
                  : 'Active'}
              </div>
            </div>
            <div className="badge badge-success" style={{ padding: '6px 12px', fontSize: '13px' }}>
              Auto Applied
            </div>
          </div>
        </div>
      )}

      {/* Plans Pricing Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          Loading membership passes...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '28px' }}>
          {plans.map((p) => {
            const isCurrent = membership?.active && membership.plan_id === p.id;
            const isFeatured = p.duration_hours === 12;

            return (
              <div
                key={p.id}
                className="card"
                style={{
                  padding: '32px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  border: isCurrent
                    ? '2px solid var(--success)'
                    : isFeatured
                    ? '2px solid var(--primary)'
                    : '1px solid var(--border-color)',
                  position: 'relative',
                  boxShadow: isFeatured ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
                }}
                id={`plan-card-${p.id}`}
              >
                {isFeatured && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-12px',
                      right: '24px',
                      background: 'var(--primary)',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-full)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Best Value
                  </span>
                )}

                {isCurrent && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-12px',
                      left: '24px',
                      background: 'var(--success)',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-full)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Currently Active
                  </span>
                )}

                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>{p.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
                    <Clock size={15} /> Active for {p.duration_hours} hour{p.duration_hours > 1 ? 's' : ''}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '24px' }}>
                  <span style={{ fontSize: '38px', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-main)' }}>
                    ${Number(p.price).toFixed(2)}
                  </span>
                  <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                    / {p.duration_hours}h access
                  </span>
                </div>

                {/* Benefits List */}
                <div style={{ flex: 1, marginBottom: '28px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Included Privileges:
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {Array.isArray(p.benefits) &&
                      p.benefits.map((b, i) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--text-main)' }}>
                          <div style={{ color: 'var(--success)' }}>
                            <Check size={16} />
                          </div>
                          <span>{b}</span>
                        </li>
                      ))}
                  </ul>
                </div>

                {/* Subscription Action Button */}
                <button
                  type="button"
                  className={`btn btn-lg ${isCurrent ? 'btn-success' : isFeatured ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ width: '100%' }}
                  disabled={isCurrent || subscribingId === p.id}
                  onClick={() => handleSubscribe(p)}
                  id={`subscribe-plan-btn-${p.id}`}
                >
                  {isCurrent ? (
                    <>
                      <Check size={18} /> Plan Active Now
                    </>
                  ) : subscribingId === p.id ? (
                    'Processing...'
                  ) : Number(p.price) === 0 ? (
                    'Activate Free Trial'
                  ) : (
                    <>
                      <Zap size={18} /> Pay with Razorpay (${Number(p.price).toFixed(2)})
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Trust & Guarantee Box */}
      <div
        style={{
          marginTop: '60px',
          borderTop: '1px solid var(--border-color)',
          paddingTop: '32px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '24px',
          textAlign: 'center',
        }}
      >
        <div>
          <ShieldCheck size={28} color="var(--primary)" style={{ margin: '0 auto 8px' }} />
          <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Automated Expiry</h4>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Background Node-Cron jobs automatically manage session intervals with zero hidden recurring fees.
          </p>
        </div>

        <div>
          <Sparkles size={28} color="var(--accent)" style={{ margin: '0 auto 8px' }} />
          <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Instant Cart Application</h4>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Your discount percentage is automatically applied to both checkout totals and shipping rates.
          </p>
        </div>

        <div>
          <Zap size={28} color="var(--success)" style={{ margin: '0 auto 8px' }} />
          <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Razorpay Security</h4>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Pay via UPI, debit card, or internet banking with end-to-end cryptographic verification.
          </p>
        </div>
      </div>
    </div>
  );
};