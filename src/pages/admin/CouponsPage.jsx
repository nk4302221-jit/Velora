import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Ticket } from 'lucide-react';

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

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY = {
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: '',
  minOrderAmount: '',
  maxDiscountAmount: '',
  usageLimit: '',
  usageLimitPerUser: '',
  startsAt: '',
  expiresAt: '',
  status: 'active',
};

const Coupons = () => {
  const { showToast } = useToast();

  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [formErrors, setFormErrors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/management/coupons');

      if (res.data?.success) {
        setCoupons(res.data.data?.coupons || []);
      } else {
        setError(res.data?.message || 'Could not load coupons.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load coupons.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormErrors({});
    setShowForm(true);
  };

  const openEdit = (coupon) => {
    setEditing(coupon);
    setForm({
      code: coupon.code || '',
      description: coupon.description || '',
      discountType: coupon.discount_type || 'percentage',
      discountValue:
        coupon.discount_value !== null && coupon.discount_value !== undefined
          ? String(coupon.discount_value)
          : '',
      minOrderAmount:
        coupon.min_order_amount !== null &&
        coupon.min_order_amount !== undefined
          ? String(coupon.min_order_amount)
          : '',
      maxDiscountAmount:
        coupon.max_discount_amount !== null &&
        coupon.max_discount_amount !== undefined
          ? String(coupon.max_discount_amount)
          : '',
      usageLimit:
        coupon.usage_limit !== null && coupon.usage_limit !== undefined
          ? String(coupon.usage_limit)
          : '',
      usageLimitPerUser:
        coupon.usage_limit_per_user !== null &&
        coupon.usage_limit_per_user !== undefined
          ? String(coupon.usage_limit_per_user)
          : '',
      startsAt: coupon.starts_at ? String(coupon.starts_at).slice(0, 10) : '',
      expiresAt: coupon.expires_at ? String(coupon.expires_at).slice(0, 10) : '',
      status: coupon.status || 'active',
    });
    setFormErrors({});
    setShowForm(true);
  };

  const validate = () => {
    const errors = {};

    if (!form.code.trim()) {
      errors.code = 'Code is required.';
    } else if (!/^[A-Za-z0-9_-]{3,64}$/.test(form.code.trim())) {
      errors.code = 'Use 3-64 letters, numbers, hyphens or underscores.';
    }

    const value = Number(form.discountValue);

    if (form.discountValue === '' || Number.isNaN(value) || value <= 0) {
      errors.discountValue = 'Enter a discount greater than 0.';
    } else if (form.discountType === 'percentage' && value > 100) {
      errors.discountValue = 'A percentage cannot exceed 100.';
    }

    if (
      form.expiresAt &&
      form.startsAt &&
      new Date(form.expiresAt) < new Date(form.startsAt)
    ) {
      errors.expiresAt = 'Expiry must be on or after the start date.';
    }

    for (const field of ['usageLimit', 'usageLimitPerUser']) {
      if (form[field] !== '') {
        const n = Number(form[field]);

        if (!Number.isInteger(n) || n < 1) {
          errors[field] = 'Use a whole number of at least 1.';
        }
      }
    }

    setFormErrors(errors);

    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    setSaving(true);

    const numberOrUndefined = (v) =>
      v === '' ? undefined : Number(v);

    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || undefined,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      minOrderAmount: numberOrUndefined(form.minOrderAmount),
      maxDiscountAmount: numberOrUndefined(form.maxDiscountAmount),
      usageLimit: numberOrUndefined(form.usageLimit),
      usageLimitPerUser: numberOrUndefined(form.usageLimitPerUser),
      startsAt: form.startsAt || undefined,
      expiresAt: form.expiresAt || undefined,
      status: form.status,
    };

    // Strip undefined so PATCH-style partial updates never null a column.
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    try {
      const res = editing
        ? await api.put(`/management/coupons/${editing.id}`, payload)
        : await api.post('/management/coupons', payload);

      showToast(
        res.data?.message ||
          (editing ? 'Coupon updated' : 'Coupon created'),
        'success'
      );

      setShowForm(false);
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not save the coupon',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (coupon) => {
    if (
      !window.confirm(
        `Delete coupon "${coupon.code}"? Customers will no longer be able to redeem it.`
      )
    ) {
      return;
    }

    try {
      const res = await api.delete(`/management/coupons/${coupon.id}`);
      showToast(res.data?.message || 'Coupon deleted', 'success');
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not delete the coupon',
        'error'
      );
    }
  };

  const activeCount = coupons.filter((c) => c.status === 'active').length;
  const now = Date.now();
  const liveCount = coupons.filter((c) => {
    if (c.status !== 'active') return false;
    if (c.starts_at && new Date(c.starts_at).getTime() > now) return false;
    if (c.expires_at && new Date(c.expires_at).getTime() < now) return false;
    return true;
  }).length;

  return (
    <>
      <PageHeader
        title="Coupons"
        subtitle="Discount codes customers can apply at checkout."
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={openCreate}
            data-testid="add-coupon"
          >
            <Plus size={16} /> New Coupon
          </button>
        }
      />

      {loading ? <LoadingState label="Loading coupons..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div className="stat-cards-grid">
            <StatCard label="Total Coupons" value={coupons.length} icon={Ticket} />
            <StatCard label="Active Flag" value={activeCount} />
            <StatCard
              label="Currently Redeemable"
              value={liveCount}
              hint="Active and within its date window"
            />
          </div>

          {coupons.length === 0 ? (
            <EmptyState message="No coupons created yet." icon={Ticket} />
          ) : (
            <div className="table-responsive">
              <table className="table" data-testid="coupons-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Discount</th>
                    <th>Conditions</th>
                    <th>Usage</th>
                    <th>Window</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((coupon) => (
                    <tr key={coupon.id}>
                      <td>
                        <code
                          style={{
                            fontWeight: 700,
                            fontSize: 13,
                            background: 'var(--bg-light)',
                            padding: '3px 8px',
                            borderRadius: 6,
                          }}
                        >
                          {coupon.code}
                        </code>
                        {coupon.description ? (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--text-muted)',
                              marginTop: 4,
                            }}
                          >
                            {coupon.description}
                          </div>
                        ) : null}
                      </td>

                      <td>
                        {coupon.discount_type === 'percentage'
                          ? `${Number(coupon.discount_value)}% off`
                          : `${money(coupon.discount_value)} off`}
                        {coupon.max_discount_amount ? (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--text-muted)',
                            }}
                          >
                            Max {money(coupon.max_discount_amount)}
                          </div>
                        ) : null}
                      </td>

                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {coupon.min_order_amount
                          ? `Min ${money(coupon.min_order_amount)}`
                          : 'No minimum'}
                      </td>

                      <td style={{ fontSize: 13 }}>
                        {Number(coupon.used_count || 0)}
                        {coupon.usage_limit
                          ? ` / ${coupon.usage_limit}`
                          : ''}
                        {coupon.usage_limit_per_user ? (
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--text-muted)',
                            }}
                          >
                            {coupon.usage_limit_per_user} per customer
                          </div>
                        ) : null}
                      </td>

                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {coupon.starts_at
                          ? new Date(coupon.starts_at).toLocaleDateString()
                          : 'Anytime'}
                        {' → '}
                        {coupon.expires_at
                          ? new Date(coupon.expires_at).toLocaleDateString()
                          : 'No expiry'}
                      </td>

                      <td>
                        <StatusBadge status={coupon.status} />
                      </td>

                      <td
                        style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                      >
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEdit(coupon)}
                          aria-label={`Edit coupon ${coupon.code}`}
                        >
                          <Pencil size={14} /> Edit
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(coupon)}
                          aria-label={`Delete coupon ${coupon.code}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {showForm ? (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div
            className="modal-box"
            style={{ maxWidth: 640 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="coupon-form-title"
          >
            <div className="modal-header">
              <h3 id="coupon-form-title">
                {editing ? `Edit ${editing.code}` : 'New Coupon'}
              </h3>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 14,
                  }}
                >
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="cp-code">
                      Code
                    </label>
                    <input
                      id="cp-code"
                      className="form-control"
                      value={form.code}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          code: e.target.value.toUpperCase(),
                        })
                      }
                      disabled={saving}
                      style={{ textTransform: 'uppercase' }}
                    />
                    {formErrors.code ? (
                      <p className="form-error">{formErrors.code}</p>
                    ) : null}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="cp-type">
                      Discount Type
                    </label>
                    <select
                      id="cp-type"
                      className="form-control"
                      value={form.discountType}
                      onChange={(e) =>
                        setForm({ ...form, discountType: e.target.value })
                      }
                      disabled={saving}
                    >
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed Amount</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="cp-value">
                      Discount Value
                    </label>
                    <input
                      id="cp-value"
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control"
                      value={form.discountValue}
                      onChange={(e) =>
                        setForm({ ...form, discountValue: e.target.value })
                      }
                      disabled={saving}
                    />
                    {formErrors.discountValue ? (
                      <p className="form-error">
                        {formErrors.discountValue}
                      </p>
                    ) : null}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="cp-min">
                      Min Order Amount
                    </label>
                    <input
                      id="cp-min"
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control"
                      value={form.minOrderAmount}
                      onChange={(e) =>
                        setForm({ ...form, minOrderAmount: e.target.value })
                      }
                      disabled={saving}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="cp-max">
                      Max Discount
                    </label>
                    <input
                      id="cp-max"
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control"
                      value={form.maxDiscountAmount}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          maxDiscountAmount: e.target.value,
                        })
                      }
                      disabled={saving}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="cp-limit">
                      Total Usage Limit
                    </label>
                    <input
                      id="cp-limit"
                      type="number"
                      min="1"
                      step="1"
                      className="form-control"
                      value={form.usageLimit}
                      onChange={(e) =>
                        setForm({ ...form, usageLimit: e.target.value })
                      }
                      disabled={saving}
                    />
                    {formErrors.usageLimit ? (
                      <p className="form-error">{formErrors.usageLimit}</p>
                    ) : null}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="cp-peruser">
                      Usage Limit Per Customer
                    </label>
                    <input
                      id="cp-peruser"
                      type="number"
                      min="1"
                      step="1"
                      className="form-control"
                      value={form.usageLimitPerUser}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          usageLimitPerUser: e.target.value,
                        })
                      }
                      disabled={saving}
                    />
                    {formErrors.usageLimitPerUser ? (
                      <p className="form-error">
                        {formErrors.usageLimitPerUser}
                      </p>
                    ) : null}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="cp-start">
                      Starts On
                    </label>
                    <input
                      id="cp-start"
                      type="date"
                      className="form-control"
                      value={form.startsAt}
                      onChange={(e) =>
                        setForm({ ...form, startsAt: e.target.value })
                      }
                      disabled={saving}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="cp-expiry">
                      Expires On
                    </label>
                    <input
                      id="cp-expiry"
                      type="date"
                      className="form-control"
                      min={today()}
                      value={form.expiresAt}
                      onChange={(e) =>
                        setForm({ ...form, expiresAt: e.target.value })
                      }
                      disabled={saving}
                    />
                    {formErrors.expiresAt ? (
                      <p className="form-error">{formErrors.expiresAt}</p>
                    ) : null}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="cp-status">
                      Status
                    </label>
                    <select
                      id="cp-status"
                      className="form-control"
                      value={form.status}
                      onChange={(e) =>
                        setForm({ ...form, status: e.target.value })
                      }
                      disabled={saving}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <div
                    className="form-group"
                    style={{ marginBottom: 0, gridColumn: '1 / -1' }}
                  >
                    <label className="form-label" htmlFor="cp-desc">
                      Description
                    </label>
                    <input
                      id="cp-desc"
                      className="form-control"
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? 'Saving...'
                    : editing
                    ? 'Save Changes'
                    : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
};

export const CouponsPage = () => (
  <PortalPage portal="admin">
    <Coupons />
  </PortalPage>
);
