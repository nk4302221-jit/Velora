
import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Package,
  MapPin,
  CheckCircle2,
  Clock,
  Truck,
  ArrowLeft,
  CreditCard,
  Settings,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';
import { formatINR } from '../utils/currency';

export const OrderDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const backPath = canManageOrder ? '/admin/orders' : '/orders';
  const backLabel = canManageOrder
    ? 'Back to Admin Orders'
    : 'Back to My Orders';

  if (loading) {
    return (
      <div
        className="site-wrapper"
        style={{
          padding: '80px 0',
          textAlign: 'center',
          color: 'var(--text-muted)',
        }}
      >
        Loading order details...
      </div>
    );
  }

  if (!order) {
    return (
      <div
        className="site-wrapper"
        style={{
          margin: '80px auto',
          maxWidth: '500px',
          textAlign: 'center',
        }}
      >
        <h2>Order Not Found</h2>

        <p
          style={{
            color: 'var(--text-muted)',
            margin: '16px 0 24px',
          }}
        >
          We could not locate this order.
        </p>

        <Link to={backPath} className="btn btn-primary">
          {backLabel}
        </Link>
      </div>
    );
  }

  // Shipment tracking steps
  const steps = [
    { title: 'Order Placed', statusKey: 'pending', icon: Clock },
    {
      title: 'Payment Confirmed',
      statusKey: 'confirmed',
      icon: CheckCircle2,
    },
    {
      title: 'Processing',
      statusKey: 'processing',
      icon: Settings,
    },
    {
      title: 'Shipped & In Transit',
      statusKey: 'shipped',
      icon: Truck,
    },
    {
      title: 'Out for Delivery',
      statusKey: 'out_for_delivery',
      icon: MapPin,
    },
    {
      title: 'Delivered',
      statusKey: 'delivered',
      icon: Package,
    },
  ];

  const totalSteps = steps.length;

  const statusOrder = {
    pending: 0,
    confirmed: 1,
    processing: 2,
    shipped: 3,
    out_for_delivery: 4,
    delivered: 5,
  };

  const isCancelled = order.order_status === 'cancelled';

  const currentLevel = isCancelled
    ? -1
    : (statusOrder[order.order_status] ?? 0);

  const progressRatio =
    isCancelled || totalSteps <= 1
      ? 0
      : Math.max(0, Math.min(totalSteps - 1, currentLevel)) /
        (totalSteps - 1);

  const getStepState = (stepIndex) => {
    if (isCancelled) return 'upcoming';
    if (stepIndex < currentLevel) return 'completed';
    if (stepIndex === currentLevel) return 'active';
    return 'upcoming';
  };

  return (
    <div
      className="site-wrapper"
      style={{ margin: '36px auto 80px' }}
      id="order-details-container"
    >
      <button
        onClick={() => navigate(backPath)}
        className="btn btn-secondary btn-sm"
        style={{ marginBottom: '24px' }}
      >
        <ArrowLeft size={16} /> {backLabel}
      </button>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>
            Order #{order.order_number}
          </h1>

          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '14px',
            }}
          >
            Placed on {new Date(order.created_at).toLocaleString()}
          </p>
        </div>

        <div>
          <span
            className="badge badge-primary"
            style={{
              fontSize: '14px',
              textTransform: 'capitalize',
            }}
          >
            Status: {order.order_status}
          </span>
        </div>
      </div>

      {/* Shipment Visual Progress Tracker */}
      <div
        className="card"
        style={{ padding: '32px 24px', marginBottom: '32px' }}
        id="shipment-progress-tracker"
      >
        <h3
          className={`order-timeline-heading${
            isCancelled ? ' has-note' : ''
          }`}
        >
          Shipment Tracking Timeline
        </h3>

        {isCancelled && (
          <p className="order-timeline-cancelled-note">
            This order was cancelled and is no longer in transit.
          </p>
        )}

        <div
          className="order-timeline"
          style={{
            '--step-share': `${100 / totalSteps}%`,
            '--half-step': `${50 / totalSteps}%`,
            '--progress-ratio': String(progressRatio),
          }}
        >
          <div
            className="order-timeline-track"
            aria-hidden="true"
          />

          <div
            className="order-timeline-progress"
            aria-hidden="true"
          />

          {steps.map((st, idx) => {
            const state = getStepState(idx);
            const Icon = st.icon;

            return (
              <div
                key={st.statusKey}
                className={`order-timeline-step is-${state}`}
              >
                <div className={`order-timeline-dot is-${state}`}>
                  <Icon size={20} />
                </div>

                <div className="order-timeline-label">
                  <div className="order-timeline-label-title">
                    {st.title}
                  </div>

                  <div className="order-timeline-label-state">
                    {state}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Order Details Grid */}
      <div className="order-details-layout">
        {/* Purchased Items Card */}
        <div className="card" style={{ padding: '24px' }}>
          <h2
            style={{
              fontSize: '18px',
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            Purchased Products ({order.items?.length || 0})
          </h2>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {order.items?.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                  }}
                >
                  <img
                    src={item.product_image}
                    alt={item.product_name}
                    style={{
                      width: '56px',
                      height: '56px',
                      objectFit: 'cover',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  />

                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '15px',
                      }}
                    >
                      {item.product_name}
                    </div>

                    <div
                      style={{
                        fontSize: '13px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      Quantity: {item.quantity} × {formatINR(item.price)}
                    </div>
                  </div>
                </div>

                <div style={{ fontWeight: 700, fontSize: '15px' }}>
                  {formatINR(Number(item.price) * item.quantity)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Shipping & Payment Summary */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}
        >
          {/* Shipping Address */}
          <div className="card" style={{ padding: '20px' }}>
            <h3
              style={{
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '12px',
              }}
            >
              <MapPin size={18} color="var(--primary)" />
              Shipping Address
            </h3>

            <div
              style={{
                fontSize: '14px',
                lineHeight: 1.6,
                color: 'var(--text-main)',
              }}
            >
              <strong>{order.shipping_name}</strong>
              <br />

              {order.address_line1},{' '}
              {order.address_line2
                ? order.address_line2 + ', '
                : ''}
              <br />

              {order.city}, {order.state} {order.postal_code}
              <br />

              {order.country}

              {order.shipping_phone && (
                <div
                  style={{
                    marginTop: '4px',
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                  }}
                >
                  Contact: {order.shipping_phone}
                </div>
              )}
            </div>
          </div>

          {/* Payment Information */}
          <div className="card" style={{ padding: '20px' }}>
            <h3
              style={{
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '12px',
              }}
            >
              <CreditCard size={18} color="var(--primary)" />
              Payment & Totals
            </h3>

            <div className="summary-row">
              <span>Payment Gateway</span>
              <strong style={{ textTransform: 'uppercase' }}>
                {order.payment_method}
              </strong>
            </div>

            <div className="summary-row">
              <span>Payment Status</span>
              <span
                style={{
                  color:
                    order.payment_status === 'paid'
                      ? 'var(--success)'
                      : 'var(--warning)',
                  fontWeight: 700,
                  textTransform: 'capitalize',
                }}
              >
                {order.payment_status}
              </span>
            </div>

            <div className="summary-row">
              <span>Subtotal</span>
              <span>{formatINR(order.subtotal)}</span>
            </div>

            {Number(order.discount) > 0 && (
              <div
                className="summary-row"
                style={{ color: 'var(--success)' }}
              >
                <span>Discount / VIP Savings</span>
                <span>-{formatINR(order.discount)}</span>
              </div>
            )}

            <div className="summary-row">
              <span>Shipping</span>
              <span>
                {Number(order.shipping) === 0
                  ? 'FREE'
                  : formatINR(order.shipping)}
              </span>
            </div>

            <div className="summary-row total">
              <span>Total Paid</span>
              <span style={{ color: 'var(--primary)' }}>
                {formatINR(order.total_amount)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
