import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  ShoppingBag,
  Users,
  Package,
  AlertTriangle,
} from 'lucide-react';

import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AdminRoute } from '../../components/AdminRoute';
import { SuperAdminRoute } from '../../components/SuperAdminRoute';
import { PortalLayout } from '../../components/PortalLayout';
import {
  PageHeader,
  StatCard,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/PortalPrimitives';
import { ADMIN_NAV, SUPER_ADMIN_NAV } from '../../config/portalNav';
import { PERMISSIONS, hasPermission } from '../../utils/roles';

const money = (value, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency === 'INR' ? 'INR' : currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

/** Horizontal bar used for the revenue-by-day and by-category breakdowns. */
const BarRow = ({ label, value, max, formatter = money }) => {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 13,
          marginBottom: 5,
          gap: 12,
        }}
      >
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color: 'var(--text-muted)' }}>
          {formatter(value)}
        </span>
      </div>

      <div
        style={{
          height: 8,
          background: 'var(--bg-surface)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: '100%',
            background: 'var(--primary)',
            borderRadius: 4,
          }}
        />
      </div>
    </div>
  );
};

const ReportsContent = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canViewReports = hasPermission(user?.role, PERMISSIONS.VIEW_REPORTS);

  const load = useCallback(async () => {
    if (!canViewReports) return;

    setLoading(true);
    setError('');

    try {
      // Admins and Super Admins both read /admin/reports; only the capability
      // differs, and the server enforces it.
      const res = await api.get('/admin/reports');

      if (res.data?.success) {
        setData(res.data.data);
      } else {
        setError(res.data?.message || 'Could not load reports.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load reports.');
    } finally {
      setLoading(false);
    }
  }, [canViewReports]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canViewReports) {
    return (
      <ErrorState message="Your role does not include the view_reports capability." />
    );
  }

  const totals = data?.totals || {};
  const revenueByDay = data?.revenueByDay || [];
  const revenueByCategory = data?.revenueByCategory || [];
  const topProducts = data?.topProducts || [];
  const orderStatus = data?.orderStatusBreakdown || [];
  const lowStock = data?.lowStock || [];

  const maxDay = Math.max(0, ...revenueByDay.map((d) => Number(d.revenue || 0)));
  const maxCategory = Math.max(
    0,
    ...revenueByCategory.map((c) => Number(c.revenue || 0))
  );

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Revenue, order status and catalogue health across the store."
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              load();
              showToast('Reports refreshed', 'info');
            }}
          >
            <BarChart3 size={16} /> Refresh
          </button>
        }
      />

      {loading ? <LoadingState label="Crunching the numbers..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && data ? (
        <>
          <div className="stat-cards-grid">
            <StatCard
              label="Total Revenue"
              value={money(totals.revenue)}
              icon={TrendingUp}
            />
            <StatCard
              label="Paid Orders"
              value={totals.paidOrders ?? 0}
              icon={ShoppingBag}
            />
            <StatCard
              label="Customers"
              value={totals.customers ?? 0}
              icon={Users}
            />
            <StatCard
              label="Admins"
              value={totals.admins ?? 0}
              hint={`${totals.superAdmins ?? 0} super admin`}
              icon={Users}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 24,
            }}
          >
            {/* ---------- Revenue by day ---------- */}
            <section className="card" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 17, marginBottom: 16 }}>
                Revenue by Day
              </h2>

              {revenueByDay.length === 0 ? (
                <EmptyState message="No revenue recorded yet." />
              ) : (
                revenueByDay.map((row) => (
                  <BarRow
                    key={row.day || row.date}
                    label={row.day || row.date}
                    value={Number(row.revenue || 0)}
                    max={maxDay}
                  />
                ))
              )}
            </section>

            {/* ---------- Revenue by category ---------- */}
            <section className="card" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 17, marginBottom: 16 }}>
                Revenue by Category
              </h2>

              {revenueByCategory.length === 0 ? (
                <EmptyState message="No category revenue yet." />
              ) : (
                revenueByCategory.map((row) => (
                  <BarRow
                    key={row.category || row.category_name}
                    label={row.category || row.category_name}
                    value={Number(row.revenue || 0)}
                    max={maxCategory}
                  />
                ))
              )}
            </section>

            {/* ---------- Order status ---------- */}
            <section className="card" style={{ padding: 20 }}>
              <h2 style={{ fontSize: 17, marginBottom: 16 }}>
                Order Status Breakdown
              </h2>

              {orderStatus.length === 0 ? (
                <EmptyState message="No orders yet." />
              ) : (
                <div className="table-responsive" style={{ boxShadow: 'none' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderStatus.map((row) => (
                        <tr key={row.order_status || row.status}>
                          <td>
                            {String(row.order_status || row.status).replace(/_/g, ' ')}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>
                            {row.count ?? row.total ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ---------- Low stock ---------- */}
            <section className="card" style={{ padding: 20 }}>
              <h2
                style={{
                  fontSize: 17,
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertTriangle size={18} color="#d97706" />
                Low Stock Alerts
              </h2>

              {lowStock.length === 0 ? (
                <EmptyState message="Every product is well stocked." icon={Package} />
              ) : (
                <div className="table-responsive" style={{ boxShadow: 'none' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th style={{ textAlign: 'right' }}>In stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStock.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className="badge badge-warning">
                              {row.stock}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* ---------- Top products ---------- */}
          <section className="card" style={{ padding: 20, marginTop: 24 }}>
            <h2 style={{ fontSize: 17, marginBottom: 16 }}>Top Products</h2>

            {topProducts.length === 0 ? (
              <EmptyState message="No product sales yet." />
            ) : (
              <div className="table-responsive" style={{ boxShadow: 'none' }}>
                <table className="table" data-testid="top-products">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Product</th>
                      <th style={{ textAlign: 'right' }}>Units sold</th>
                      <th style={{ textAlign: 'right' }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((row, index) => (
                      <tr key={row.product_id ?? row.id}>
                        <td>{index + 1}</td>
                        <td>
                          {row.product_name}
                          {row.image_url ? (
                            <img
                              src={row.image_url}
                              alt=""
                              style={{
                                width: 36,
                                height: 36,
                                objectFit: 'cover',
                                borderRadius: 6,
                                marginLeft: 10,
                              }}
                            />
                          ) : null}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {row.units_sold ?? 0}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {money(row.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
};

// Available to both admins and super admins (guarded by VIEW_REPORTS server-side).
export const ReportsPage = () => (
  <AdminRoute>
    <PortalLayout
      portalTitle="Admin Portal"
      portalSubtitle="Store operations"
      accentColor="#1e3a8a"
      homePath="/admin/dashboard"
      navItems={ADMIN_NAV}
    >
      <ReportsContent />
    </PortalLayout>
  </AdminRoute>
);

// Strict Super Admin wrapper for /super-admin/reports. AdminRoute would also
// admit a plain admin, which must not see the owner console.
export const SuperAdminReportsPage = () => (
  <SuperAdminRoute>
    <PortalLayout
      portalTitle="Super Admin"
      portalSubtitle="Platform owner console"
      accentColor="#7c2d12"
      homePath="/super-admin/dashboard"
      navItems={SUPER_ADMIN_NAV}
    >
      <ReportsContent />
    </PortalLayout>
  </SuperAdminRoute>
);
