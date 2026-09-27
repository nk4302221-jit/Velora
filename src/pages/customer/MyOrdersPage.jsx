import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag,
  Truck,
  XCircle,
  CheckCircle2,
  Clock,
  Package,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { CustomerRoute } from '../../components/CustomerRoute';
import { PortalLayout } from '../../components/PortalLayout';
import {
  PageHeader,
  LoadingState,
  ErrorState,
  EmptyState,
  StatusBadge,
} from '../../components/PortalPrimitives';
import { CUSTOMER_NAV } from '../../config/portalNav';

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const StepIcon = ({ reached, isLast }) => {
  if (!reached) {
    return (
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'var(--bg-surface)',
          border: '2px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Clock size={12} color="var(--text-muted)" />
      </span>
    );
  }

  return (
    <span
      style={{
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: isLast ? 'var(--success)' : 'var(--primary)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <CheckCircle2 size={14} />
    </span>
  );
};

/** Inline delivery timeline rendered from /customer/orders/:id/tracking. */
const TrackingTimeline = ({ tracking }) => {
  if (!tracking?.steps?.length) return null;

  return (
    <div
      style={{
        marginTop: 16,
        padding: 18,
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <h4 style={{ fontSize: 14, marginBottom: 14 }}>Delivery Progress</h4>

      {tracking.steps.map((step, index) => {
        const isLast = index === tracking.steps.length - 1;

        return (
          <div
            key={step.key}
            style={{ display: 'flex', gap: 12, minHeight: 46 }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <StepIcon reached={step.reached} isLast={isLast} />

              {!isLast ? (
                <div
                  style={{
                    flex: 1,
                    width: 2,
                    background: step.reached ? 'var(--primary)' : 'var(--border-color)',
                  }}
                />
              ) : null}
            </div>

            <div style={{ paddingTop: 4 }}>
              <div
                style={{
                  fontWeight: step.reached ? 700 : 500,
                  color: step.reached ? 'var(--text-main)' : 'var(--text-muted)',
                  fontSize: 14,
                }}
              >
                {step.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const MyOrders = () => {
  const { showToast } = useToast();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expanded, setExpanded] = useState(null);
  const [tracking, setTracking] = useState({});
  const [cancelling, setCancelling] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      // /api/orders is already scoped to the signed-in customer server-side.
      const res = await api.get('/orders');

      if (res.data?.success) {
        setOrders(res.data.orders || res.data.data?.orders || []);
      } else {
        setError(res.data?.message || 'Could not load your orders.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleTracking = async (order) => {
    if (expanded === order.id) {
      setExpanded(null);
      return;
    }

    setExpanded(order.id);

    if (tracking[order.id]) return;

    try {
      const res = await api.get(`/customer/orders/${order.id}/tracking`);

      if (res.data?.success) {
        setTracking((prev) => ({ ...prev, [order.id]: res.data.data }));
      }
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not load tracking',
        'error'
      );
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;

    setCancelling(true);

    try {
      const res = await api.post(`/customer/orders/${cancelTarget.id}/cancel`, {
        reason: 'Changed my mind',
      });

      showToast(res.data?.message || 'Order cancelled', 'success');

      setCancelTarget(null);
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not cancel the order',
        'error'
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <PageHeader
        title="My Orders"
        subtitle="Track deliveries and cancel eligible orders."
        actions={
          <Link to="/products" className="btn btn-primary btn-sm">
            Continue Shopping
          </Link>
        }
      />

      {loading ? <LoadingState label="Loading your orders..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        orders.length === 0 ? (
          <EmptyState
            message="You have not placed any orders yet."
            icon={ShoppingBag}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {orders.map((order) => {
              const orderTracking = tracking[order.id];
              const isOpen = expanded === order.id;
              const cancellable = orderTracking?.canCancel;

              return (
                <div key={order.id} className="card" style={{ padding: 20 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 16,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        <strong style={{ fontSize: 16 }}>
                          {order.order_number || `Order #${order.id}`}
                        </strong>
                        <StatusBadge status={order.order_status} />
                        <StatusBadge status={order.payment_status} />
                      </div>

                      <p
                        style={{
                          fontSize: 13,
                          color: 'var(--text-muted)',
                          marginTop: 6,
                        }}
                      >
                        Placed on{' '}
                        {new Date(order.created_at).toLocaleDateString()} ·{' '}
                        {order.total_items || 0} item
                        {Number(order.total_items) === 1 ? '' : 's'} ·{' '}
                        {order.payment_method || 'online'}
                      </p>
                    </div>

                    <div
                      style={{
                        textAlign: 'right',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        alignItems: 'flex-end',
                      }}
                    >
                      <strong style={{ fontSize: 18 }}>
                        {money(order.total_amount)}
                      </strong>

                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => toggleTracking(order)}
                          aria-expanded={isOpen}
                        >
                          <Truck size={14} /> Track
                          {isOpen ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </button>

                        <Link
                          to={`/orders/${order.id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          Details
                        </Link>

                        {cancellable ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => setCancelTarget(order)}
                          >
                            <XCircle size={14} /> Cancel
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {isOpen ? (
                    <TrackingTimeline tracking={orderTracking} />
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : null}

      {/* ---------- Cancel confirmation ---------- */}
      {cancelTarget ? (
        <div className="modal-backdrop" onClick={() => setCancelTarget(null)}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-order-title"
          >
            <div className="modal-header">
              <h3 id="cancel-order-title">Cancel this order?</h3>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
                You are about to cancel{' '}
                <strong>
                  {cancelTarget.order_number || `order #${cancelTarget.id}`}
                </strong>{' '}
                for <strong>{money(cancelTarget.total_amount)}</strong>.
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                This cannot be undone. If the order has already shipped, cancel
                is no longer available and you will need to request a return
                instead.
              </p>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCancelTarget(null)}
              >
                Keep Order
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling...' : 'Yes, Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};

export const MyOrdersPage = () => (
  <CustomerRoute>
    <PortalLayout
      portalTitle="My Account"
      portalSubtitle="Orders, returns and reviews"
      accentColor="#047857"
      homePath="/customer/dashboard"
      navItems={CUSTOMER_NAV}
    >
      <MyOrders />
    </PortalLayout>
  </CustomerRoute>
);
