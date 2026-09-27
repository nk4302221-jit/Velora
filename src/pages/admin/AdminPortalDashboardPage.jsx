import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  IndianRupee,
  ShoppingBag,
  Users,
  Boxes,
  Crown,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';

import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { PortalPage } from '../../components/PortalPage';
import {
  PageHeader,
  StatCard,
  LoadingState,
  ErrorState,
  EmptyState,
  StatusBadge,
} from '../../components/PortalPrimitives';

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const QUICK_ACTIONS = [
  { to: '/admin/orders', label: 'Fulfil orders' },
  { to: '/admin/products', label: 'Add a product' },
  { to: '/admin/inventory', label: 'Update stock' },
  { to: '/admin/returns', label: 'Handle returns' },
  { to: '/admin/reports', label: 'View reports' },
];

const AdminDashboard = () => {
  const { user } = useAuth();

  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [categoryStats, setCategoryStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/admin/dashboard');

      if (res.data?.success) {
        setStats(res.data.data?.stats || null);
        setRecentOrders(res.data.data?.recentOrders || []);
        setCategoryStats(res.data.data?.categoryStats || []);
      } else {
        setError(res.data?.message || 'Could not load dashboard data.');
      }
    } catch (err) {
      setError(
        err.response?.data?.message || 'Could not load dashboard data.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.name?.split(' ')[0] || 'Admin'}`}
        subtitle="Store performance at a glance."
      />

      {loading ? <LoadingState label="Loading dashboard..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && stats ? (
        <>
          <div className="stat-cards-grid">
            <StatCard
              label="Revenue (paid)"
              value={money(stats.totalRevenue)}
              icon={IndianRupee}
            />
            <StatCard
              label="Orders"
              value={stats.totalOrders}
              icon={ShoppingBag}
            />
            <StatCard
              label="Customers"
              value={stats.totalUsers}
              icon={Users}
            />
            <StatCard
              label="Products"
              value={stats.totalProducts}
              icon={Boxes}
            />
            <StatCard
              label="Active Memberships"
              value={stats.activeMemberships}
              icon={Crown}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 20,
              marginTop: 24,
            }}
          >
            {/* ---------- Recent orders ---------- */}
            <section className="card" style={{ padding: 22 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <h2 style={{ fontSize: 18 }}>Recent Orders</h2>
                <Link
                  to="/admin/orders"
                  style={{
                    fontSize: 13,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  View all <ArrowRight size={14} />
                </Link>
              </div>

              {recentOrders.length === 0 ? (
                <EmptyState message="No orders yet." icon={ShoppingBag} />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  {recentOrders.map((order) => (
                    <div
                      key={order.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        paddingBottom: 12,
                        borderBottom: '1px solid var(--border-color)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {order.order_number || `#${order.id}`}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {order.customer_name} ·{' '}
                          {new Date(order.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {money(order.total_amount)}
                        </div>
                        <StatusBadge status={order.order_status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ---------- Category spread + shortcuts ---------- */}
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
            >
              <section className="card" style={{ padding: 22 }}>
                <h2 style={{ fontSize: 18, marginBottom: 16 }}>
                  Catalogue by Category
                </h2>

                {categoryStats.length === 0 ? (
                  <EmptyState message="No products yet." icon={Boxes} />
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    {categoryStats
                      .slice()
                      .sort(
                        (a, b) =>
                          Number(b.product_count) - Number(a.product_count)
                      )
                      .map((category) => {
                        const max = Math.max(
                          ...categoryStats.map((c) =>
                            Number(c.product_count)
                          )
                        );
                        const pct = Math.round(
                          (Number(category.product_count) / max) * 100
                        );

                        return (
                          <div key={category.category_name || 'none'}>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 13,
                                marginBottom: 4,
                              }}
                            >
                              <span>
                                {category.category_name || 'Uncategorised'}
                              </span>
                              <span
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {category.product_count} · avg{' '}
                                {money(category.avg_price)}
                              </span>
                            </div>

                            <div
                              style={{
                                height: 6,
                                background: 'var(--bg-light)',
                                borderRadius: 4,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: 'var(--primary)',
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </section>

              <section className="card" style={{ padding: 22 }}>
                <h2
                  style={{
                    fontSize: 18,
                    marginBottom: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <TrendingUp size={18} /> Quick Actions
                </h2>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  {QUICK_ACTIONS.map((action) => (
                    <Link
                      key={action.to}
                      to={action.to}
                      className="btn btn-secondary btn-sm"
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
};

export const AdminPortalDashboardPage = () => (
  <PortalPage portal="admin">
    <AdminDashboard />
  </PortalPage>
);
