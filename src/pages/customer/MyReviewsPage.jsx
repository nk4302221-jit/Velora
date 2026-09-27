import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Star, MessageSquare, Clock, CheckCircle2, XCircle } from 'lucide-react';

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

const EMPTY = { productId: '', rating: 5, title: '', comment: '' };

/** Interactive 1-5 star input. */
const StarPicker = ({ value, onChange, disabled }) => (
  <div
    style={{ display: 'flex', gap: 4 }}
    role="radiogroup"
    aria-label="Your rating"
  >
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        type="button"
        role="radio"
        aria-checked={value === star}
        aria-label={`${star} star${star === 1 ? '' : 's'}`}
        disabled={disabled}
        onClick={() => onChange(star)}
        style={{
          background: 'none',
          border: 'none',
          padding: 2,
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: star <= value ? '#f59e0b' : 'var(--border-color)',
        }}
      >
        <Star size={26} fill={star <= value ? 'currentColor' : 'none'} />
      </button>
    ))}
  </div>
);

const MyReviews = () => {
  const { showToast } = useToast();

  const [reviews, setReviews] = useState([]);
  const [reviewable, setReviewable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      // The server computes which products are reviewable (delivered purchase,
      // not yet reviewed) so the form can never offer an invalid product_id.
      const [reviewsRes, reviewableRes] = await Promise.all([
        api.get('/customer/reviews'),
        api.get('/customer/reviews/reviewable'),
      ]);

      if (reviewsRes.data?.success) {
        setReviews(reviewsRes.data.data?.reviews || []);
      }

      if (reviewableRes.data?.success) {
        setReviewable(reviewableRes.data.data?.products || []);
      }
    } catch (err) {
      setError(
        err.response?.data?.message || 'Could not load your reviews.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const validate = () => {
    const errors = {};

    if (!form.productId) errors.productId = 'Choose a product to review.';
    if (form.rating < 1 || form.rating > 5)
      errors.rating = 'Pick a rating between 1 and 5.';
    if (form.comment.trim().length < 10)
      errors.comment = 'Please write at least 10 characters.';

    setFormErrors(errors);

    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    setSubmitting(true);

    try {
      const res = await api.post('/customer/reviews', {
        product_id: Number(form.productId),
        rating: Number(form.rating),
        title: form.title.trim() || undefined,
        comment: form.comment.trim(),
      });

      showToast(
        res.data?.message || 'Review submitted for moderation',
        'success'
      );

      setShowForm(false);
      setForm(EMPTY);
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not submit your review',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (    <>
      <PageHeader
        title="My Reviews"
        subtitle="Reviews can only be left for delivered purchases and appear publicly once approved."
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setForm(EMPTY);
              setFormErrors({});
              setShowForm(true);
            }}
            data-testid="open-review-form"
          >
            <Star size={16} /> Write a Review
          </button>
        }
      />

      {loading ? <LoadingState label="Loading your reviews..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        reviews.length === 0 ? (
          <EmptyState
            message="You have not written any reviews yet."
            icon={MessageSquare}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    {review.product_image ? (
                      <img
                        src={review.product_image}
                        alt=""
                        style={{
                          width: 48,
                          height: 48,
                          objectFit: 'cover',
                          borderRadius: 8,
                        }}
                      />
                    ) : null}

                    <div>
                      <Link
                        to={`/products/${review.product_id}`}
                        style={{ fontWeight: 700, fontSize: 15 }}
                      >
                        {review.product_name}
                      </Link>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          marginTop: 3,
                        }}
                        aria-label={`${review.rating} out of 5 stars`}
                      >
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={15}
                            fill={
                              star <= Number(review.rating)
                                ? '#f59e0b'
                                : 'none'
                            }
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

                  <div style={{ textAlign: 'right' }}>
                    <StatusBadge status={review.status} />
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        marginTop: 6,
                      }}
                    >
                      {new Date(review.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {review.title ? (
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>
                    {review.title}
                  </p>
                ) : null}

                <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {review.comment}
                </p>

                {review.status === 'pending' ? (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      marginTop: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Clock size={13} />
                    Awaiting moderation by the store team.
                  </p>
                ) : review.status === 'approved' ? (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      marginTop: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <CheckCircle2 size={13} /> Published on the product page.
                  </p>
                ) : (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      marginTop: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <XCircle size={13} /> Not published.
                  </p>
                )}
              </div>
            ))}
          </div>
        )
      ) : null}

      {/* ---------- New review ---------- */}
      {showForm ? (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-form-title"
          >
            <div className="modal-header">
              <h3 id="review-form-title">Write a Review</h3>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {reviewable.length === 0 ? (
                  <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    {reviews.length === 0
                      ? 'You need a delivered order before you can review a product.'
                      : 'You have reviewed every product you have received so far.'}
                  </p>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label" htmlFor="review-product">
                        Product
                      </label>
                      <select
                        id="review-product"
                        className="form-control"
                        value={form.productId}
                        onChange={(e) =>
                          setForm({ ...form, productId: e.target.value })
                        }
                      >
                        <option value="">Select a product...</option>
                        {reviewable.map((product) => (
                          <option key={product.product_id} value={product.product_id}>
                            {product.product_name} (from{' '}
                            {product.order_number || `order #${product.order_id}`})
                          </option>
                        ))}
                      </select>
                      {formErrors.productId ? (
                        <p className="form-error">{formErrors.productId}</p>
                      ) : null}
                    </div>

                    <div className="form-group">
                      <span className="form-label">Rating</span>
                      <StarPicker
                        value={form.rating}
                        onChange={(rating) => setForm({ ...form, rating })}
                        disabled={submitting}
                      />
                      {formErrors.rating ? (
                        <p className="form-error">{formErrors.rating}</p>
                      ) : null}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="review-title">
                        Title (optional)
                      </label>
                      <input
                        id="review-title"
                        className="form-control"
                        value={form.title}
                        onChange={(e) =>
                          setForm({ ...form, title: e.target.value })
                        }
                        placeholder="Sum it up in a few words"
                      />
                    </div>

                    <div
                      className="form-group"
                      style={{ marginBottom: 0 }}
                    >
                      <label className="form-label" htmlFor="review-comment">
                        Your Review
                      </label>
                      <textarea
                        id="review-comment"
                        className="form-control"
                        rows={4}
                        value={form.comment}
                        onChange={(e) =>
                          setForm({ ...form, comment: e.target.value })
                        }
                        placeholder="What did you like or dislike? Minimum 10 characters."
                      />
                      {formErrors.comment ? (
                        <p className="form-error">{formErrors.comment}</p>
                      ) : null}
                    </div>
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
                  disabled={submitting || reviewable.length === 0}
                >
                  {submitting ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
};

export const MyReviewsPage = () => (
  <CustomerRoute>
    <PortalLayout
      portalTitle="My Account"
      portalSubtitle="Orders, returns and reviews"
      accentColor="#047857"
      homePath="/customer/dashboard"
      navItems={CUSTOMER_NAV}
    >
      <MyReviews />
    </PortalLayout>
  </CustomerRoute>
);
