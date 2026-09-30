import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Package,
  MapPin,
  CheckCircle2,
  Clock,
  Truck,
  ArrowLeft,
  ShieldCheck,
  CreditCard,
  Settings,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { isAdminRole } from '../utils/roles';

// Mirrors validOrderStatuses in adminController.updateOrderStatus().
const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

export const OrderDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { showToast } = useToast();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const canManageOrder = isAdminRole(role);

  useEffect(() => {
    async function fetchOrder() {
      try {
        setLoading(true);
        const res = await api.get(`/orders/${id}`);
        if (res.data.success) {
          setOrder(res.data.data.order);
        }
      } catch (err) {
        console.error('Failed to load order details:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [id]);

  // Staff-only fulfilment action. Reuses the audited admin endpoint so the
  // existing audit logging keeps recording who changed the status.
  const updateOrderStatus = async (nextStatus) => {
    if (!order || nextStatus === order.order_status) return;

    setUpdating(true);

    try {
      const res = await api.patch(`/admin/orders/${order.id}/status`, {
        orderStatus: nextStatus,
      });

      const updated = res.data?.data?.order;

      // Reflect the new status immediately, without a full reload.
      setOrder((previous) =>
        previous ? { ...previous, ...(updated || { order_status: nextStatus }) } : previous
      );

      showToast(
        res.data?.message || `Order marked ${nextStatus}`,
        'success'
      );
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not update the order',
        'error'
      );
    } finally {
      setUpdating(false);
    }
  };

  const backPath = canManageOrder ? '/admin/orders' : '/orders';
  const backLabel = canManageOrder ? 'Back to Admin Orders' : 'Back to My Orders';

  if (loading) {
    return (
      <div className="site-wrapper" style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading order details...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="site-wrapper" style={{ margin: '80px auto', maxWidth: '500px', textAlign: 'center' }}>
        <h2>Order Not Found</h2>
        <p style={{ color: 'var(--text-muted)', margin: '16px 0 24px' }}>
          We could not locate this order.
        </p>
        <Link to={backPath} className="btn btn-primary">{backLabel}</Link>
      </div>
    );
  }

  // Tracking steps
  const steps = [
    { title: 'Order Placed', statusKey: 'pending', icon: Clock },
    { title: 'Payment Confirmed', statusKey: 'confirmed', icon: CheckCircle2 },
    { title: 'Processing', statusKey: 'processing', icon: Settings },
    { title: 'Shipped & In Transit', statusKey: 'shipped', icon: Truck },
    { title: 'Delivered', statusKey: 'delivered', icon: Package },
  ];

  const getStepState = (stepIndex) => {
    const statusOrder = {
      pending: 0,
      confirmed: 1,
      processing: 2,
      shipped: 3,
      delivered: 4,
    };
    // A cancelled order has no fulfilment progress to show.
    const currentLevel =
      order.order_status === 'cancelled'
        ? -1
        : (statusOrder[order.order_status] ?? 0);
    if (stepIndex < currentLevel) return 'completed';
    if (stepIndex === currentLevel) return 'active';
    return 'upcoming';
  };

  return (
    <div className="site-wrapper" style={{ margin: '36px auto 80px' }} id="order-details-container">
      <button onClick={() => navigate(backPath)} className="btn btn-secondary btn-sm" style={{ marginBottom: '24px' }}>
        <ArrowLeft size={16} /> {backLabel}
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>Order #{order.order_number}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Placed on {new Date(order.created_at).toLocaleString()}
          </p>
        </div>
        <div>
          <span className="badge badge-primary" style={{ fontSize: '14px', textTransform: 'capitalize' }}>
            Status: {order.order_status}
          </span>
        </div>
      </div>

      {/* Manage Order - admin / super_admin only. Customers never see this. */}
      {canManageOrder ? (
        <div className="card" style={{ padding: '24px', marginBottom: '32px' }} id="manage-order-panel">
          <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <ShieldCheck size={18} color="var(--primary)" /> Manage Order
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Advance or cancel this order. Every change is recorded in the audit log.
          </p>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {ORDER_STATUSES.map((value) => (
              <button
                key={value}
                type="button"
                className={`btn btn-sm ${
                  value === order.order_status
                    ? 'btn-primary'
                    : 'btn-secondary'
                }`}
                disabled={updating || value === order.order_status}
                onClick={() => updateOrderStatus(value)}
                aria-label={`Set order ${order.order_number || order.id} to ${value}`}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Shipment Visual Progress Tracker */}
      <div className="card" style={{ padding: '32px 24px', marginBottom: '32px' }} id="shipment-progress-tracker">
        <h3 style={{ fontSize: '16px', marginBottom: '24px' }}>Shipment Tracking Timeline</h3>
        {order.order_status === 'cancelled' && (
          <p style={{ fontSize: '13px', color: 'var(--danger)', marginTop: '-14px', marginBottom: '18px' }}>
            This order was cancelled and is no longer in transit.
          </p>
        )}
        <div className="order-timeline">
          {/* Connector Line */}
          <div className="order-timeline-connector" />

          {steps.map((st, idx) => {
            const state = getStepState(idx);
            const Icon = st.icon;
            const isDone = state === 'completed' || state === 'active';

            return (
              <div
                key={idx}
                className="order-timeline-step"
                style={{ '--step-share': `${100 / steps.length}%` }}
              >
                <div
                  className="order-timeline-dot"
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: state === 'active' ? 'var(--primary)' : isDone ? 'var(--success)' : '#e2e8f0',
                    color: isDone ? '#ffffff' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: state === 'active' ? '0 0 0 4px var(--primary-light)' : 'none',
                  }}
                >
                  <Icon size={20} />
                </div>
                <div className="order-timeline-label">
                  <div style={{ fontWeight: 700, fontSize: '13px', color: isDone ? 'var(--text-main)' : 'var(--text-light)' }}>
                    {st.title}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'capitalize' }}>
                    {state}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Details Grid */}
      <div className="order-details-layout">
        {/* Purchased Items Card */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
            Purchased Products ({order.items?.length || 0})
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {order.items?.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <img
                    src={item.product_image}
                    alt={item.product_name}
                    style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>{item.product_name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      Quantity: {item.quantity} × ${Number(item.price).toFixed(2)}
                    </div>
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>
                  ${(Number(item.price) * item.quantity).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Shipping & Payment Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Shipping Address */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <MapPin size={18} color="var(--primary)" /> Shipping Address
            </h3>
            <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-main)' }}>
              <strong>{order.shipping_name}</strong><br />
              {order.address_line1}, {order.address_line2 ? order.address_line2 + ', ' : ''}<br />
              {order.city}, {order.state} {order.postal_code}<br />
              {order.country}
              {order.shipping_phone && (
                <div style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Contact: {order.shipping_phone}
                </div>
              )}
            </div>
          </div>

          {/* Payment Information */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <CreditCard size={18} color="var(--primary)" /> Payment & Totals
            </h3>
            <div className="summary-row">
              <span>Payment Gateway</span>
              <strong style={{ textTransform: 'uppercase' }}>{order.payment_method}</strong>
            </div>
            <div className="summary-row">
              <span>Payment Status</span>
              <span style={{ color: order.payment_status === 'paid' ? 'var(--success)' : 'var(--warning)', fontWeight: 700, textTransform: 'capitalize' }}>
                {order.payment_status}
              </span>
            </div>
            <div className="summary-row">
              <span>Subtotal</span>
              <span>${Number(order.subtotal).toFixed(2)}</span>
            </div>
            {Number(order.discount) > 0 && (
              <div className="summary-row" style={{ color: 'var(--success)' }}>
                <span>Discount / VIP Savings</span>
                <span>-${Number(order.discount).toFixed(2)}</span>
              </div>
            )}
            <div className="summary-row">
              <span>Shipping</span>
              <span>{Number(order.shipping) === 0 ? 'FREE' : `$${Number(order.shipping).toFixed(2)}`}</span>
            </div>
            <div className="summary-row total">
              <span>Total Paid</span>
              <span style={{ color: 'var(--primary)' }}>${Number(order.total_amount).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};