import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';

import api from '../../api/client';
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

const money = (value, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency === 'INR' ? 'INR' : currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const PaymentHistory = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/customer/payments');

      if (res.data?.success) {
        setPayments(res.data.data?.payments || []);
      } else {
        setError(res.data?.message || 'Could not load your payments.');
      }
    } catch (err) {
      setError(
        err.response?.data?.message || 'Could not load your payments.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Derived client-side for display only; the API remains the source of truth.
  const totalPaid = payments
    .filter((p) => p.status === 'succeeded')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const totalRefunded = payments
    .filter((p) => p.status === 'refunded')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return (
    <>
      <PageHeader
        title="Payment History"
        subtitle="Every payment Velora has processed for your account."
      />

      {loading ? <LoadingState label="Loading your payments..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div className="stat-cards-grid">
            <StatCard
              label="Transactions"
              value={payments.length}
              icon={Wallet}
            />
            <StatCard label="Total Paid" value={money(totalPaid)} />
            <StatCard label="Total Refunded" value={money(totalRefunded)} />
          </div>

          {payments.length === 0 ? (
            <EmptyState
              message="No payments recorded for your account yet."
              icon={Wallet}
            />
          ) : (
            <div className="table-responsive">
              <table className="table" data-testid="customer-payments">
                <thead>
                  <tr>
                    <th>Transaction</th>
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
                        <Link to={`/orders/${payment.order_id}`}>
                          {payment.order_number || `#${payment.order_id}`}
                        </Link>
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
                      <td
                        style={{
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {new Date(payment.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </>
  );
};

export const PaymentHistoryPage = () => (
  <CustomerRoute>
    <PortalLayout
      portalTitle="My Account"
      portalSubtitle="Orders, returns and reviews"
      accentColor="#047857"
      homePath="/customer/dashboard"
      navItems={CUSTOMER_NAV}
    >
      <PaymentHistory />
    </PortalLayout>
  </CustomerRoute>
);
