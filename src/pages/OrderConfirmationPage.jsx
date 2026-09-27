import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, Package, MapPin, ArrowRight, Truck, CreditCard } from 'lucide-react';
import api from '../api/client';

const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

function formatAmount(amount, currency = 'INR') {
  const symbol = CURRENCY_SYMBOLS[String(currency).toUpperCase()] || `${currency} `;
  return `${symbol}${Number(amount).toFixed(2)}`;
}

function formatPaidAt(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const OrderConfirmationPage = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrder() {
      try {
        setLoading(true);
        const res = await api.get(`/orders/${id}`);
        if (res.data.success) {
          setOrder(res.data.data.order);
        }
      } catch (err) {
        console.error('Failed to load confirmed order:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [id]);

  if (loading) {
    return (
      <div className="site-wrapper" style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        Retrieving order verification details...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="site-wrapper" style={{ margin: '80px auto', maxWidth: '500px', textAlign: 'center' }}>
        <h2>Order Not Found</h2>
        <p style={{ color: 'var(--text-muted)', margin: '16px 0 24px' }}>
          Could not find details for the requested order.
        </p>
        <Link to="/orders" className="btn btn-primary">My Orders</Link>
      </div>
    );
  }

  return (
    <div className="site-wrapper" style={{ margin: '40px auto 80px', maxWidth: '780px' }} id="order-confirmed-view">
      {/* Success Hero Header */}
      <div className="card" style={{ padding: '40px 32px', textAlign: 'center', marginBottom: '28px' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            background: 'var(--success-light)',
            color: 'var(--success)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <CheckCircle2 size={36} />
        </div>

        <span className="badge badge-success" style={{ marginBottom: '12px' }}>
          Order Confirmed & Paid
        </span>
        <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>Thank You For Your Order!</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px', maxWidth: '520px', margin: '0 auto 20px' }}>
          We received your order <strong>#{order.order_number}</strong>. A confirmation email with shipping tracker has been dispatched.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <Link to={`/orders/${order.id}`} className="btn btn-primary" id="track-order-btn">
            <Package size={16} /> Track Shipment Status
          </Link>
          <Link to="/orders" className="btn btn-secondary">
            View My Orders <ArrowRight size={16} />
          </Link>
          <Link to="/products" className="btn btn-secondary">
            Continue Shopping <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* Order Details Breakdown */}
      <div className="card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Order ID</div>
            <div style={{ fontWeight: 700, fontSize: '16px' }}>#{order.order_number}</div>
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Payment Status</div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--success)', textTransform: 'capitalize' }}>
              {order.payment_status} ({order.payment_method})
            </div>
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Paid On</div>
            <div style={{ fontWeight: 700, fontSize: '14px' }}>
              {formatPaidAt(order.paid_at) || '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Total Amount</div>
            <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--primary)' }}>
              {formatAmount(order.total_amount, order.currency)}
            </div>
          </div>
        </div>

        {order.razorpay_payment_id && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              marginBottom: '24px',
              fontSize: '13px',
            }}
          >
            <CreditCard size={16} color="var(--primary)" />
            <span style={{ color: 'var(--text-muted)' }}>Razorpay Payment ID:</span>
            <span style={{ fontWeight: 700 }}>{order.razorpay_payment_id}</span>
          </div>
        )}

        {/* Purchased Items */}
        <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>Purchased Items</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          {order.items?.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: '1px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img
                  src={item.product_image}
                  alt={item.product_name}
                  style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{item.product_name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Qty: {item.quantity} × {formatAmount(item.price, order.currency)}
                  </div>
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>
                {formatAmount(Number(item.price) * item.quantity, order.currency)}
              </div>
            </div>
          ))}
        </div>

        {/* Shipping Address Summary */}
        <div style={{ background: 'var(--bg-surface)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>
            <MapPin size={16} color="var(--primary)" /> Delivery Address
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-main)', lineHeight: 1.5 }}>
            <strong>{order.shipping_name}</strong><br />
            {order.address_line1}, {order.address_line2 ? order.address_line2 + ', ' : ''}
            {order.city}, {order.state} {order.postal_code}, {order.country}
          </div>
        </div>
      </div>
    </div>
  );
};