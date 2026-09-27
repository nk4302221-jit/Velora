import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, ChevronLeft, ChevronRight, Save } from 'lucide-react';

import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AdminRoute } from '../../components/AdminRoute';
import { SuperAdminRoute } from '../../components/SuperAdminRoute';
import { PortalLayout } from '../../components/PortalLayout';
import {
  PageHeader,
  LoadingState,
  ErrorState,
  EmptyState,
  StatusBadge,
} from '../../components/PortalPrimitives';
import { ADMIN_NAV, SUPER_ADMIN_NAV } from '../../config/portalNav';
import { PERMISSIONS, hasPermission } from '../../utils/roles';

const PAGE_SIZE = 20;

const money = (value, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency === 'INR' ? 'INR' : currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

/**
 * Transaction list.
 *
 * Reading transactions needs only VIEW_PAYMENTS, so both Admin and Super Admin
 * can use it. Editing the Razorpay credentials is gated behind
 * MANAGE_PAYMENT_CREDENTIALS, which only a Super Admin holds - and the API
 * enforces that separately.
 */
const PaymentsContent = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [payments, setPayments] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [page, setPage] = useState(1);

  const canViewPayments = hasPermission(user?.role, PERMISSIONS.VIEW_PAYMENTS);
  const canManageCredentials = hasPermission(
    user?.role,
    PERMISSIONS.MANAGE_PAYMENT_CREDENTIALS
  );

  // Razorpay credentials. The GET returns a PUBLIC shape only - the secret is
  // never sent to the browser, so there is nothing to reveal/hide here.
  const [gateway, setGateway] = useState(null);
  const [gatewayForm, setGatewayForm] = useState({
    keyId: '',
    keySecret: '',
    environment: 'test',
  });
  const [savingGateway, setSavingGateway] = useState(false);

  const load = useCallback(async () => {
    if (!canViewPayments) return;

    setLoading(true);
    setError('');

    try {
      const res = await api.get('/admin/payments', {
        params: { page, limit: PAGE_SIZE },
      });

      if (res.data?.success) {
        setPayments(res.data.payments || []);
        setPagination(res.data.pagination || null);
      } else {
        setError(res.data?.message || 'Could not load transactions.');
      }
    } catch (err) {
      setError(
        err.response?.data?.message || 'Could not load transactions.'
      );
    } finally {
      setLoading(false);
    }
  }, [page, canViewPayments]);

  useEffect(() => {
    load();
  }, [load]);

  const loadGateway = useCallback(async () => {
    if (!canManageCredentials) return;

    try {
      const res = await api.get('/admin/payments/razorpay');

      if (res.data?.success) {
        setGateway(res.data.data || res.data.config || null);
      }
    } catch {
      // A missing/inactive config is not an error worth surfacing.
      setGateway(null);
    }
  }, [canManageCredentials]);

  useEffect(() => {
    loadGateway();
  }, [loadGateway]);

  const handleSaveGateway = async (e) => {
    e.preventDefault();

    setSavingGateway(true);

    try {
      const res = await api.put('/admin/payments/razorpay', gatewayForm);

      showToast(
        res.data?.message || 'Payment configuration saved',
        'success'
      );

      setGatewayForm({ keyId: '', keySecret: '', environment: 'test' });
      loadGateway();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not save the configuration',
        'error'
      );
    } finally {
      setSavingGateway(false);
    }
  };

  if (!canViewPayments) {
    return (
      <ErrorState message="Your role does not include the view_payments capability." />
    );
  }

  const totalPages = pagination?.totalPages || 1;

  return (
    <>
      <PageHeader
        title="Payments & Transactions"
        subtitle="Every Razorpay payment recorded against a store order."
      />

      {loading ? <LoadingState label="Loading transactions..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        payments.length === 0 ? (
          <EmptyState message="No payments recorded yet." icon={CreditCard} />
        ) : (
          <>
            <div className="table-responsive">
              <table className="table" data-testid="payments-table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Customer</th>
                    <th>Order</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <code style={{ fontSize: 11 }}>
                          {payment.payment_intent_id || `pay_${payment.id}`}
                        </code>
                      </td>
                      <td>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {payment.customer_name || '-'}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {payment.customer_email || ''}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 13 }}>
                          {payment.order_number || `#${payment.order_id}`}
                        </div>
                        <div style={{ marginTop: 2 }}>
                          <StatusBadge status={payment.order_status} />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {money(payment.amount, payment.currency)}
                      </td>
                      <td>
                        <span className="badge badge-neutral">
                          {payment.provider || '-'}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={payment.status} />
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(payment.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="pagination-wrap">
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Page {pagination?.page} of {totalPages} ·{' '}
                  {pagination?.total} transactions
                </span>

                <div className="pagination-pages">
                  <button
                    type="button"
                    className="page-btn"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    className={`page-btn ${page === 1 ? 'active' : ''}`}
                    onClick={() => setPage(1)}
                  >
                    1
                  </button>
                  <button
                    type="button"
                    className={`page-btn ${page === totalPages ? 'active' : ''}`}
                    onClick={() => setPage(totalPages)}
                  >
                    {totalPages}
                  </button>
                  <button
                    type="button"
                    className="page-btn"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )
      ) : null}

      {/* ---------- Razorpay credentials: Super Admin only ---------- */}
      {canManageCredentials ? (
        <section
          className="card"
          style={{ padding: 24, marginTop: 32 }}
          data-testid="gateway-config"
        >
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>
            Razorpay Configuration
          </h2>
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              marginBottom: 20,
            }}
          >
            Restricted to Super Admins. The secret is write-only: it is stored
            encrypted and is never returned by the API.
          </p>

          {gateway ? (
            <div
              style={{
                display: 'flex',
                gap: 20,
                flexWrap: 'wrap',
                padding: 14,
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 20,
                fontSize: 13,
              }}
            >
              <span>
                <strong>Status:</strong>{' '}
                <span
                  className={`badge ${
                    gateway.credentialsRejected
                      ? 'badge-warning'
                      : gateway.configured
                        ? 'badge-success'
                        : 'badge-warning'
                  }`}
                >
                  {gateway.statusMessage || (gateway.configured ? 'Configured' : 'Not Configured')}
                </span>
              </span>
              <span>
                <strong>Key ID:</strong> {gateway.keyId || 'not set'}
              </span>
              <span>
                <strong>Mode:</strong> {gateway.environment}
              </span>
              <span>
                <strong>Source:</strong> {gateway.source}
              </span>
            </div>
          ) : null}

          {gateway?.credentialsRejected ? (
            <div
              role="alert"
              data-testid="gateway-credentials-rejected"
              style={{
                padding: 14,
                marginBottom: 20,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--danger, #dc2626)',
                background: 'rgba(220, 38, 38, 0.08)',
                fontSize: 13,
              }}
            >
              <strong>Razorpay rejected these credentials.</strong>{' '}
              The gateway responded with an authentication failure, so every
              checkout will fail until valid {gateway.environment} keys are
              saved below
              {gateway.lastGatewayCheckAt
                ? ` (last detected ${new Date(
                    gateway.lastGatewayCheckAt
                  ).toLocaleString()})`
                : ''}
              .
            </div>
          ) : null}

          <form onSubmit={handleSaveGateway}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="rz-key-id">
                  Razorpay Key ID
                </label>
                <input
                  id="rz-key-id"
                  className="form-control"
                  value={gatewayForm.keyId}
                  onChange={(e) =>
                    setGatewayForm({ ...gatewayForm, keyId: e.target.value })
                  }
                  autoComplete="off"
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="rz-key-secret">
                  Razorpay Key Secret
                </label>
                <input
                  id="rz-key-secret"
                  type="password"
                  className="form-control"
                  value={gatewayForm.keySecret}
                  onChange={(e) =>
                    setGatewayForm({ ...gatewayForm, keySecret: e.target.value })
                  }
                  autoComplete="new-password"
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="rz-env">
                  Environment
                </label>
                <select
                  id="rz-env"
                  className="form-control"
                  value={gatewayForm.environment}
                  onChange={(e) =>
                    setGatewayForm({ ...gatewayForm, environment: e.target.value })
                  }
                >
                  <option value="test">Test</option>
                  <option value="live">Live</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ marginTop: 20 }}
              disabled={savingGateway}
            >
              <Save size={16} /> {savingGateway ? 'Saving...' : 'Save Configuration'}
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
};

export const PaymentsPage = () => (
  <AdminRoute>
    <PortalLayout
      portalTitle="Admin Portal"
      portalSubtitle="Store operations"
      accentColor="#1e3a8a"
      homePath="/admin/dashboard"
      navItems={ADMIN_NAV}
    >
      <PaymentsContent />
    </PortalLayout>
  </AdminRoute>
);

// Strict Super Admin wrapper for /super-admin/payments - only the owner portal
// should expose the Razorpay credential form.
export const SuperAdminPaymentsPage = () => (
  <SuperAdminRoute>
    <PortalLayout
      portalTitle="Super Admin"
      portalSubtitle="Platform owner console"
      accentColor="#7c2d12"
      homePath="/super-admin/dashboard"
      navItems={SUPER_ADMIN_NAV}
    >
      <PaymentsContent />
    </PortalLayout>
  </SuperAdminRoute>
);
