import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Check, X, IndianRupee } from 'lucide-react';

import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { PortalPage } from '../../components/PortalPage';
import {
  PageHeader,
  LoadingState,
  ErrorState,
  EmptyState,
  StatusBadge,
} from '../../components/PortalPrimitives';

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const STATUSES = ['requested', 'approved', 'rejected', 'refunded'];

const Returns = () => {
  const { showToast } = useToast();

  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [status, setStatus] = useState('requested');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);

  // Refund modal state, keyed by return id.
  const [refundTarget, setRefundTarget] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [modalError, setModalError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/management/returns', {
        params: { status: status || undefined, page, limit: 20 },
      });

      if (res.data?.success) {
        // Returns are returned as a top-level array, not nested under data.
        setRequests(res.data.returns || []);
        setPagination(res.data.pagination || null);
      } else {
        setError(res.data?.message || 'Could not load return requests.');
      }
    } catch (err) {
      setError(
        err.response?.data?.message || 'Could not load return requests.'
      );
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (entry, nextStatus, extra = {}) => {
    setBusyId(entry.id);

    try {
      const res = await api.patch(`/management/returns/${entry.id}`, {
        status: nextStatus,
        ...extra,
      });

      showToast(
        res.data?.message || `Return marked ${nextStatus}`,
        'success'
      );

      setRefundTarget(null);
      setRefundAmount('');
      setAdminNote('');
      setModalError('');
      load();
    } catch (err) {
      const message =
        err.response?.data?.message || 'Could not update the return request';

      setModalError(message);
      showToast(message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const openRefund = (entry) => {
    setRefundTarget(entry);
    setRefundAmount(String(entry.total_amount ?? ''));
    setAdminNote('');
    setModalError('');
  };

  const submitRefund = (e) => {
    e.preventDefault();

    if (refundAmount === '' || Number(refundAmount) < 0) {
      setModalError('Enter a refund amount of 0 or more.');
      return;
    }

    resolve(refundTarget, 'refunded', {
      refundAmount: Number(refundAmount),
      adminNote: adminNote.trim() || undefined,
    });
  };

  return (
    <>
      <PageHeader
        title="Returns & Refunds"
        subtitle="Approve, reject and refund customer return requests."
      />

      <div style={{ marginBottom: 20 }}>
        <div
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          role="tablist"
          aria-label="Filter returns by status"
        >
          {['', ...STATUSES].map((value) => (
            <button
              key={value || 'all'}
              type="button"
              role="tab"
              aria-selected={status === value}
              className={
                status === value
                  ? 'btn btn-primary btn-sm'
                  : 'btn btn-secondary btn-sm'
              }
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {value
                ? value.charAt(0).toUpperCase() + value.slice(1)
                : 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? <LoadingState label="Loading return requests..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        requests.length === 0 ? (
          <EmptyState
            message={
              status
                ? `No ${status} return requests.`
                : 'No return requests have been submitted.'
            }
            icon={RotateCcw}
          />
        ) : (
          <div className="table-responsive">
            <table className="table" data-testid="returns-table-admin">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Reason</th>
                  <th style={{ textAlign: 'right' }}>Order Total</th>
                  <th style={{ textAlign: 'right' }}>Refunded</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {entry.order_number || `#${entry.order_id}`}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {entry.order_status}
                      </div>
                    </td>

                    <td style={{ fontSize: 13 }}>
                      <div>{entry.customer_name || '-'}</div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {entry.customer_email}
                      </div>
                    </td>

                    <td style={{ fontSize: 13, maxWidth: 220 }}>
                      {entry.reason}
                      {entry.admin_note ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            marginTop: 4,
                          }}
                        >
                          Note: {entry.admin_note}
                        </div>
                      ) : null}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {money(entry.total_amount)}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {entry.refund_amount
                        ? money(entry.refund_amount)
                        : '-'}
                    </td>

                    <td>
                      <StatusBadge status={entry.status} />
                    </td>

                    <td
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.requested_at
                        ? new Date(entry.requested_at).toLocaleDateString()
                        : '-'}
                    </td>

                    <td
                      style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                    >
                      {entry.status === 'requested' ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busyId === entry.id}
                            onClick={() => resolve(entry, 'approved')}
                            aria-label="Approve return"
                          >
                            <Check size={14} /> Approve
                          </button>{' '}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={busyId === entry.id}
                            onClick={() => resolve(entry, 'rejected')}
                            aria-label="Reject return"
                          >
                            <X size={14} /> Reject
                          </button>
                        </>
                      ) : entry.status === 'approved' ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === entry.id}
                          onClick={() => openRefund(entry)}
                          aria-label="Issue refund"
                        >
                          <IndianRupee size={14} /> Refund
                        </button>
                      ) : (
                        <span
                          style={{ fontSize: 12, color: 'var(--text-muted)' }}
                        >
                          Resolved
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {pagination && pagination.totalPages > 1 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 16,
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Page {pagination.page} of {pagination.totalPages} ·{' '}
                  {pagination.total} requests
                </span>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )
      ) : null}

      {refundTarget ? (
        <div
          className="modal-backdrop"
          onClick={() => setRefundTarget(null)}
        >
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="refund-form-title"
          >
            <div className="modal-header">
              <h3 id="refund-form-title">Issue Refund</h3>
            </div>

            <form onSubmit={submitRefund}>
              <div className="modal-body">
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    marginBottom: 16,
                  }}
                >
                  {refundTarget.order_number || `Order #${refundTarget.order_id}`}{' '}
                  · order total {money(refundTarget.total_amount)}
                </p>

                <div className="form-group">
                  <label className="form-label" htmlFor="refund-amount">
                    Refund Amount
                  </label>
                  <input
                    id="refund-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    className="form-control"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    disabled={busyId === refundTarget.id}
                  />
                </div>

                <div
                  className="form-group"
                  style={{ marginBottom: 0 }}
                >
                  <label className="form-label" htmlFor="refund-note">
                    Note to Customer (optional)
                  </label>
                  <textarea
                    id="refund-note"
                    className="form-control"
                    rows={2}
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    disabled={busyId === refundTarget.id}
                  />
                </div>

                {modalError ? (
                  <p className="form-error" style={{ marginTop: 12 }}>
                    {modalError}
                  </p>
                ) : null}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRefundTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busyId === refundTarget.id}
                >
                  {busyId === refundTarget.id
                    ? 'Processing...'
                    : 'Confirm Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
};

export const ReturnsPage = () => (
  <PortalPage portal="admin">
    <Returns />
  </PortalPage>
);
