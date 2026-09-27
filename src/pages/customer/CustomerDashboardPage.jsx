import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  RotateCcw,
  Wallet,
  MessageSquare,
  Heart,
  Package,
  TrendingUp,
  CheckCircle2,
  Truck,
  Clock,
  XCircle,
  Star,
  MapPin,
  UserCircle,
} from 'lucide-react';

import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { CustomerRoute } from '../../components/CustomerRoute';
import { PortalLayout } from '../../components/PortalLayout';
import {
  PageHeader,
  StatCard,
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

const QUICK_ACTIONS = [
  { to: '/customer/orders', label: 'Track an order', icon: Truck },
  { to: '/customer/returns', label: 'Request a return', icon: RotateCcw },
  { to: '/customer/payments', label: 'Payment history', icon: Wallet },
  { to: '/customer/reviews', label: 'Write a review', icon: Star },
  { to: '/wishlist', label: 'My wishlist', icon: Heart },
  { to: '/profile/addresses', label: 'Saved addresses', icon: MapPin },
  { to: '/profile', label: 'Account settings', icon: UserCircle },
  { to: '/products', label: 'Continue shopping', icon: Package },
];

const CustomerDashboard = () => {
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/customer/dashboard');

      if (res.data?.success) {
        setData(res.data.data);
      } else {
        setError(res.data?.message || 'Could not load your dashboard.');
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Could not load your dashboard. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.stats || {};
  const recentOrders = data?.recentOrders || [];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.name || user?.full_name || 'shopper'}`}
        subtitle="Track orders, manage returns and review your purchase history."
      />

      {loading ? <LoadingState label="Loading your dashboard..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && data ? (
        <>
          <div className="stat-cards-grid">
            <StatCard
              label="Total Orders"
              value={stats.totalOrders ?? 0}
              hint={`${stats.activeOrders ?? 0} in progress`}
              icon={ShoppingBag}
            />
            <StatCard
              label="Delivered"
              value={stats.deliveredOrders ?? 0}
              icon={CheckCircle2}
            />
            <StatCard
              label="Total Spent"
              value={money(stats.totalSpent)}
              icon={TrendingUp}
            />
            <StatCard
              label="Open Returns"
              value={stats.openReturns ?? 0}
              icon={RotateCcw}
            />
            <StatCard
              label="Cart Items"
              value={stats.cartItems ?? 0}
              icon={ShoppingBag}
            />
            <StatCard
              label="Wishlist Items"
              value={stats.wishlistItems ?? 0}
              icon={Heart}
            />
          </div>

          {/* ---------- Quick actions ---------- */}
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 18, marginBottom: 14 }}>Quick Actions</h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;

                return (
                  <Link
                    key={action.to}
                    to={action.to}
                    className="card"
                    style={{
                      padding: 18,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: 'var(--primary-light)',
                        color: 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={19} />
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      {action.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ---------- Recent orders ---------- */}
          <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: '18px 20px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <h2 style={{ fontSize: 17 }}>Recent Orders</h2>
              <Link
                to="/customer/orders"
                className="btn btn-secondary btn-sm"
              >
                View All Orders
              </Link>
            </div>

            {recentOrders.length === 0 ? (
              <EmptyState
                message="You have not placed any orders yet."
                icon={ShoppingBag}
              />
            ) : (
              <div className="table-responsive" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
                <table className="table" data-testid="recent-orders">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Payment</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr key={order.id}>
                        <td style={{ fontWeight: 600 }}>
                          {order.order_number || `#${order.id}`}
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                        <td>
                          <StatusBadge status={order.order_status} />
                        </td>
                        <td>
                          <StatusBadge status={order.payment_status} />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          {money(order.total_amount)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link
                            to={`/orders/${order.id}`}
                            className="btn btn-secondary btn-sm"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ---------- Getting started ---------- */}
          {stats.totalOrders === 0 ? (
            <section
              className="card"
              style={{
                padding: 24,
                marginTop: 24,
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
              }}
            >
              <Clock size={22} color="var(--primary)" />
              <div>
                <h3 style={{ fontSize: 16, marginBottom: 6 }}>
                  New to Velora?
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    color: 'var(--text-muted)',
                    marginBottom: 12,
                    lineHeight: 1.6,
                  }}
                >
                  Your account is ready. Once an order is delivered you can
                  track it, cancel eligible orders, request returns and leave a
                  verified-purchase review.
                </p>
                <Link to="/products" className="btn btn-primary btn-sm">
                  Start Shopping
                </Link>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
};

export const CustomerDashboardPage = () => (
  <CustomerRoute>
    <PortalLayout
      portalTitle="My Account"
      portalSubtitle="Orders, returns and reviews"
      accentColor="#047857"
      homePath="/customer/dashboard"
      navItems={CUSTOMER_NAV}
    >
      <CustomerDashboard />
    </PortalLayout>
  </CustomerRoute>
);
