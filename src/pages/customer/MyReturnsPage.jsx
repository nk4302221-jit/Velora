import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';

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

const RETURN_REASONS = [
  'Item arrived damaged',
  'Wrong item delivered',
  'Item does not match the description',
  'Changed my mind',
  'Defective on arrival',
];

const MyReturns = () => {
  const { showToast } = useToast();

  const [returns, setReturns] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [returnsRes, ordersRes] = await Promise.all([
        api.get('/customer/returns'),
        api.get('/orders'),
      ]);

      if (returnsRes.data?.success) {
        setReturns(returnsRes.data.data?.returns || []);
      }

      if (ordersRes.data?.success) {
        const all = ordersRes.data.data?.orders || [];

        // Only shipped/delivered orders are eligible for a return, matching the
        // server-side rule exactly.
        setOrders(
          all.filter((o) => ['shipped', 'delivered'].includes(o.order_status))
        );
      }
    } catch (err) {
      setError(
        err.response?.data?.message || 'Could not load your return requests.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!orderId) {
      setFormError('Please choose an order to return.');
      return;
    }

    if (!reason.trim()) {
      setFormError('Please tell us why you are returning the item.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const res = await api.post(`/customer/orders/${orderId}/return`, {
        reason,
      });

      showToast(res.data?.message || 'Return requested', 'success');

      setShowForm(false);
      setOrderId('');
      setReason(RETURN_REASONS[0]);
      load();
    } catch (err) {
      const message =
        err.response?.data?.message || 'Could not submit the return request';
      setFormError(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const alreadyRequested = new Set(
    returns
      .filter((r) => ['requested', 'approved'].includes(r.status))
      .map((r) => r.order_id)
  );

  return (
    <>
      <PageHeader
        title="Returns & Refunds"
        subtitle="Request a return for a delivered order and follow its refund status."
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setFormError('');
              setShowForm(true);
            }}
            data-testid="open-return-request"
          >
            <RotateCcw size={16} /> Request a Return
          </button>
        }
      />

      {loading ? <LoadingState label="Loading your returns..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        returns.length === 0 ? (
          <EmptyState
            message="You have no return requests. Delivered orders can be returned within the return window."
            icon={RotateCcw}
          />
        ) : (
          <div className="table-responsive">
            <table className="table" data-testid="returns-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Refund</th>
                  <th>Requested</th>
                  <th>Resolved</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <Link
                        to={`/orders/${entry.order_id}`}
                        style={{ fontWeight: 600 }}
                      >
                        {entry.order_number || `#${entry.order_id}`}
                      </Link>
                    </td>
                    <td style={{ fontSize: 13, maxWidth: 220 }}>{entry.reason}</td>
                    <td>
                      <StatusBadge status={entry.status} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {entry.refund_amount
                        ? money(entry.refund_amount)
                        : '-'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {entry.requested_at
                        ? new Date(entry.requested_at).toLocaleDateString()
                        : '-'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {entry.resolved_at
                        ? new Date(entry.resolved_at).toLocaleDateString()
                        : '-'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 200 }}>
                      {entry.admin_note || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {/* ---------- New return request ---------- */}
      {showForm ? (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-request-title"
          >
            <div className="modal-header">
              <h3 id="return-request-title">Request a Return</h3>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {orders.length === 0 ? (
                  <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    You have no shipped or delivered orders that are eligible
                    for return right now.
                  </p>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="return-order">
                        Order
                      </label>
                      <select
                        id="return-order"
                        className="form-control"
                        value={orderId}
                        onChange={(e) => setOrderId(e.target.value)}
                      >
                        <option value="">Select an order...</option>
                        {orders
                          .filter((o) => !alreadyRequested.has(o.id))
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.order_number || `Order #${o.id}`} ·{' '}
                              {money(o.total_amount)} · {o.order_status}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" htmlFor="return-reason">
                        Reason
                      </label>
                      <select
                        id="return-reason"
                        className="form-control"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      >
                        {RETURN_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>

                    {formError ? (
                      <p className="form-error" style={{ marginTop: 12 }}>
                        {formError}
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowForm(false)}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || orders.length === 0}
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
};

export const MyReturnsPage = () => (
  <CustomerRoute>
    <PortalLayout
      portalTitle="My Account"
      portalSubtitle="Orders, returns and reviews"
      accentColor="#047857"
      homePath="/customer/dashboard"
      navItems={CUSTOMER_NAV}
    >
      <MyReturns />
    </PortalLayout>
  </CustomerRoute>
);
