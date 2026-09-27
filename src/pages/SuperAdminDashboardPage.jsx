import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Settings,
  ScrollText,
  BarChart3,
  CreditCard,
  KeyRound,
  Boxes,
  ShoppingBag,
  Star,
} from 'lucide-react';

import api from '../api/client';
import { SuperAdminRoute } from '../components/SuperAdminRoute';
import { PortalLayout } from '../components/PortalLayout';
import {
  PageHeader,
  StatCard,
  LoadingState,
  ErrorState,
  EmptyState,
  StatusBadge,
} from '../components/PortalPrimitives';
import { SUPER_ADMIN_NAV } from '../config/portalNav';

const SuperAdminDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/super-admin/dashboard');

      if (res.data?.success) {
        setData(res.data.data);
      } else {
        setError(res.data?.message || 'Could not load the Super Admin dashboard.');
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'Could not reach the Super Admin dashboard. Check that you are signed in as a Super Admin.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.stats || {};
  const recentAdmins = data?.recentAdmins || [];
  // The API returns `recentAudit`, not `recentActivity`.
  const recentActivity = data?.recentAudit || [];

  return (
    <>
      <PageHeader
        title="Super Admin Dashboard"
        subtitle="Full control over staff accounts, roles, store settings and platform-wide analytics."
      />

      {loading ? <LoadingState label="Loading Super Admin dashboard..." /> : null}

      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && data ? (
        <>
          <div className="stat-cards-grid">
            <StatCard
              label="Total Admins"
              value={stats.admins ?? 0}
              hint={`${stats.superAdmins ?? 0} Super Admin`}
              icon={Users}
            />
            <StatCard
              label="Registered Users"
              value={stats.totalUsers ?? 0}
              hint="Including customers"
              icon={KeyRound}
            />
            <StatCard
              label="Total Orders"
              value={stats.totalOrders ?? 0}
              icon={ShoppingBag}
            />
            <StatCard
              label="Revenue"
              value={`₹${Number(stats.totalRevenue || 0).toLocaleString('en-IN')}`}
              icon={CreditCard}
            />
            <StatCard
              label="Products"
              value={stats.totalProducts ?? 0}
              icon={Boxes}
            />
            <StatCard
              label="Audit Events"
              value={stats.auditEvents ?? 0}
              hint="Privileged actions recorded"
              icon={ScrollText}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 24,
            }}
          >
            {/* ---------- Recent staff accounts ---------- */}
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
                <h2 style={{ fontSize: 17 }}>Staff Accounts</h2>
                <Link
                  to="/super-admin/admins"
                  className="btn btn-secondary btn-sm"
                >
                  Manage Admins
                </Link>
              </div>

              {recentAdmins.length === 0 ? (
                <EmptyState message="No privileged accounts found." />
              ) : (
                <div className="table-responsive" style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentAdmins.map((admin) => (
                        <tr key={admin.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{admin.full_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {admin.email}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                admin.role === 'super_admin'
                                  ? 'badge-danger'
                                  : 'badge-primary'
                              }`}
                            >
                              {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                            </span>
                          </td>
                          <td>
                            <StatusBadge status={admin.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ---------- Recent privileged activity ---------- */}
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
                <h2 style={{ fontSize: 17 }}>Recent Privileged Activity</h2>
                <Link
                  to="/super-admin/audit-logs"
                  className="btn btn-secondary btn-sm"
                >
                  Full Audit Trail
                </Link>
              </div>

              {recentActivity.length === 0 ? (
                <EmptyState message="No privileged activity recorded yet." />
              ) : (
                <div style={{ padding: '8px 20px 16px' }}>
                  {recentActivity.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        padding: '12px 0',
                        borderBottom: '1px solid var(--border-color)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <span
                          className="badge badge-neutral"
                          style={{ fontFamily: 'monospace', fontSize: 12 }}
                        >
                          {log.action}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, marginTop: 6 }}>
                        <strong>{log.actor_email || 'system'}</strong>
                        {log.actor_role ? (
                          <span className="badge badge-primary" style={{ marginLeft: 8 }}>
                            {log.actor_role}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </>
  );
};

// Guarded: only a live super_admin can render this page.
export const SuperAdminDashboardPage = () => (
  <SuperAdminRoute>
    <PortalLayout
      portalTitle="Super Admin"
      portalSubtitle="Platform owner console"
      accentColor="#7c2d12"
      homePath="/super-admin/dashboard"
      navItems={SUPER_ADMIN_NAV}
    >
      <SuperAdminDashboard />
    </PortalLayout>
  </SuperAdminRoute>
);
