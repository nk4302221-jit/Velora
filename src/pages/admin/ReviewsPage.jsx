import React, { useState, useEffect, useCallback } from 'react';
import { Star, Check, X, Trash2, MessageSquare } from 'lucide-react';

import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { PortalPage } from '../../components/PortalPage';
import {
  PageHeader,
  StatCard,
  LoadingState,
  ErrorState,
  EmptyState,
  StatusBadge,
} from '../../components/PortalPrimitives';

const STATUSES = ['pending', 'approved', 'rejected'];

const Reviews = () => {
  const { showToast } = useToast();

  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState({});
  const [pagination, setPagination] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/management/reviews', {
        params: { status: status || undefined, page, limit: 20 },
      });

      if (res.data?.success) {
        // NOTE: raw { success, reviews, summary, pagination } body, so the
        // payload is top level - NOT under res.data.data.
        setReviews(res.data.reviews || []);
        setSummary(res.data.summary || {});
        setPagination(res.data.pagination || null);
      } else {
        setError(res.data?.message || 'Could not load reviews.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load reviews.');
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const moderate = async (review, newStatus) => {
    setBusyId(review.id);

    try {
      const res = await api.patch(`/management/reviews/${review.id}`, {
        status: newStatus,
      });

      showToast(res.data?.message || `Review ${newStatus}`, 'success');
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not moderate the review',
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (review) => {
    if (!window.confirm('Permanently delete this review?')) {
      return;
    }

    setBusyId(review.id);

    try {
      const res = await api.delete(`/management/reviews/${review.id}`);
      showToast(res.data?.message || 'Review deleted', 'success');
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not delete the review',
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Reviews"
        subtitle="Customer reviews are only visible on the storefront once approved."
      />

      <div className="stat-cards-grid">
        <StatCard
          label="All Reviews"
          value={Number(summary.totalReviews || 0)}
          icon={MessageSquare}
        />
        <StatCard
          label="Awaiting Moderation"
          value={Number(summary.pending || 0)}
          hint="Currently showing this queue"
        />
        <StatCard
          label="Average Rating"
          value={summary.averageRating || '0.00'}
          hint="Across approved reviews"
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          role="tablist"
          aria-label="Filter reviews by status"
        >
          {['', ...STATUSES].map((value) => (
            <button
              key={value || 'all'}
              type="button"
              role="tab"
              aria-selected={status === value}
              className={
                status === value ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'
              }
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {value ? value.charAt(0).toUpperCase() + value.slice(1) : 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? <LoadingState label="Loading reviews..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        reviews.length === 0 ? (
          <EmptyState
            message={
              status
                ? `No ${status} reviews to show.`
                : 'No reviews have been submitted yet.'
            }
            icon={MessageSquare}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {reviews.map((review) => (
              <div key={review.id} className="card" style={{ padding: 20 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {review.product_name}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginTop: 4,
                        fontSize: 12,
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>{review.customer_name || 'Customer'}</span>
                      <span>·</span>
                      <span>{review.customer_email}</span>
                      <span>·</span>
                      <span>
                        {new Date(review.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <StatusBadge status={review.status} />
                    <div
                      style={{
                        display: 'flex',
                        gap: 2,
                        marginTop: 6,
                        justifyContent: 'flex-end',
                      }}
                      aria-label={`${review.rating} out of 5 stars`}
                    >
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={14}
                          fill={star <= Number(review.rating) ? '#f59e0b' : 'none'}
                          color={
                            star <= Number(review.rating)
                              ? '#f59e0b'
                              : 'var(--border-color)'
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {review.title ? (
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>
                    {review.title}
                  </p>
                ) : null}

                <p
                  style={{
                    fontSize: 14,
                    color: 'var(--text-muted)',
                    lineHeight: 1.6,
                  }}
                >
                  {review.comment}
                </p>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  {review.status !== 'approved' ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busyId === review.id}
                      onClick={() => moderate(review, 'approved')}
                      aria-label="Approve review"
                    >
                      <Check size={14} /> Approve
                    </button>
                  ) : null}

                  {review.status !== 'rejected' ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busyId === review.id}
                      onClick={() => moderate(review, 'rejected')}
                      aria-label="Reject review"
                    >
                      <X size={14} /> Reject
                    </button>
                  ) : null}

                  {review.status !== 'pending' ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busyId === review.id}
                      onClick={() => moderate(review, 'pending')}
                      aria-label="Move review back to pending"
                    >
                      Move to Pending
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={busyId === review.id}
                    onClick={() => handleDelete(review)}
                    aria-label="Delete review"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>
            ))}

            {pagination && pagination.totalPages > 1 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Page {pagination.page} of {pagination.totalPages} ·{' '}
                  {pagination.total} reviews
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
    </>
  );
};

export const ReviewsPage = () => (
  <PortalPage portal="admin">
    <Reviews />
  </PortalPage>
);
