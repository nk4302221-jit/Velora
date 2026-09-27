import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Megaphone } from 'lucide-react';

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

const EMPTY = {
  title: '',
  description: '',
  bannerImage: '',
  discountType: 'percentage',
  discountValue: '',
  startsAt: '',
  endsAt: '',
  status: 'active',
};

const Offers = () => {
  const { showToast } = useToast();

  const [offers, setOffers] = useState([]);
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
      const res = await api.get('/management/offers');

      if (res.data?.success) {
        setOffers(res.data.data?.offers || []);
      } else {
        setError(res.data?.message || 'Could not load offers.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load offers.');
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

  const openEdit = (offer) => {
    setEditing(offer);
    setForm({
      title: offer.title || '',
      description: offer.description || '',
      bannerImage: offer.banner_image || '',
      discountType: offer.discount_type || 'percentage',
      discountValue:
        offer.discount_value !== null && offer.discount_value !== undefined
          ? String(offer.discount_value)
          : '',
      startsAt: offer.starts_at ? String(offer.starts_at).slice(0, 10) : '',
      endsAt: offer.ends_at ? String(offer.ends_at).slice(0, 10) : '',
      status: offer.status || 'active',
    });
    setFormErrors({});
    setShowForm(true);
  };

  const validate = () => {
    const errors = {};

    if (!form.title.trim()) {
      errors.title = 'Title is required.';
    }

    const value = Number(form.discountValue);

    if (form.discountValue === '' || Number.isNaN(value) || value <= 0) {
      errors.discountValue = 'Enter a discount greater than 0.';
    } else if (form.discountType === 'percentage' && value > 100) {
      errors.discountValue = 'A percentage cannot exceed 100.';
    }

    if (
      form.startsAt &&
      form.endsAt &&
      new Date(form.endsAt) < new Date(form.startsAt)
    ) {
      errors.endsAt = 'End date must be on or after the start date.';
    }

    setFormErrors(errors);

    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    setSaving(true);

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      bannerImage: form.bannerImage.trim() || undefined,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      startsAt: form.startsAt || undefined,
      endsAt: form.endsAt || undefined,
      status: form.status,
    };

    Object.keys(payload).forEach(
      (k) => payload[k] === undefined && delete payload[k]
    );

    try {
      const res = editing
        ? await api.put(`/management/offers/${editing.id}`, payload)
        : await api.post('/management/offers', payload);

      showToast(
        res.data?.message || (editing ? 'Offer updated' : 'Offer created'),
        'success'
      );

      setShowForm(false);
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not save the offer',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (offer) => {
    if (!window.confirm(`Delete offer "${offer.title}"?`)) {
      return;
    }

    try {
      const res = await api.delete(`/management/offers/${offer.id}`);
      showToast(res.data?.message || 'Offer deleted', 'success');
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not delete the offer',
        'error'
      );
    }
  };

  const activeCount = offers.filter((o) => o.status === 'active').length;

  return (
    <>
      <PageHeader
        title="Offers"
        subtitle="Time-boxed promotional banners shown on the storefront."
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={openCreate}
            data-testid="add-offer"
          >
            <Plus size={16} /> New Offer
          </button>
        }
      />

      {loading ? <LoadingState label="Loading offers..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div className="stat-cards-grid">
            <StatCard label="Total Offers" value={offers.length} icon={Megaphone} />
            <StatCard label="Active" value={activeCount} />
          </div>

          {offers.length === 0 ? (
            <EmptyState message="No offers created yet." icon={Megaphone} />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 16,
              }}
            >
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  className="card"
                  style={{ padding: 0, overflow: 'hidden' }}
                >
                  {offer.banner_image ? (
                    <img
                      src={offer.banner_image}
                      alt=""
                      style={{
                        width: '100%',
                        height: 130,
                        objectFit: 'cover',
                      }}
                    />
                  ) : null}

                  <div style={{ padding: 18 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        marginBottom: 8,
                      }}
                    >
                      <h3 style={{ fontSize: 17, margin: 0 }}>
                        {offer.title}
                      </h3>
                      <StatusBadge status={offer.status} />
                    </div>

                    {offer.description ? (
                      <p
                        style={{
                          fontSize: 13,
                          color: 'var(--text-muted)',
                          lineHeight: 1.6,
                        }}
                      >
                        {offer.description}
                      </p>
                    ) : null}

                    <p
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: 'var(--primary)',
                        margin: '8px 0',
                      }}
                    >
                      {offer.discount_type === 'percentage'
                        ? `${Number(offer.discount_value)}% off`
                        : `${money(offer.discount_value)} off`}
                    </p>

                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        marginBottom: 14,
                      }}
                    >
                      {offer.starts_at
                        ? new Date(offer.starts_at).toLocaleDateString()
                        : 'Anytime'}{' '}
                      →{' '}
                      {offer.ends_at
                        ? new Date(offer.ends_at).toLocaleDateString()
                        : 'No end date'}
                    </p>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEdit(offer)}
                        aria-label={`Edit offer ${offer.title}`}
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(offer)}
                        aria-label={`Delete offer ${offer.title}`}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {showForm ? (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div
            className="modal-box"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="offer-form-title"
          >
            <div className="modal-header">
              <h3 id="offer-form-title">
                {editing ? `Edit ${editing.title}` : 'New Offer'}
              </h3>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="of-title">
                    Title
                  </label>
                  <input
                    id="of-title"
                    className="form-control"
                    value={form.title}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value })
                    }
                    disabled={saving}
                  />
                  {formErrors.title ? (
                    <p className="form-error">{formErrors.title}</p>
                  ) : null}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="of-desc">
                    Description
                  </label>
                  <textarea
                    id="of-desc"
                    className="form-control"
                    rows={2}
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    disabled={saving}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="of-banner">
                    Banner Image URL
                  </label>
                  <input
                    id="of-banner"
                    className="form-control"
                    value={form.bannerImage}
                    onChange={(e) =>
                      setForm({ ...form, bannerImage: e.target.value })
                    }
                    placeholder="https://..."
                    disabled={saving}
                  />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 14,
                  }}
                >
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="of-type">
                      Discount Type
                    </label>
                    <select
                      id="of-type"
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
                    <label className="form-label" htmlFor="of-value">
                      Value
                    </label>
                    <input
                      id="of-value"
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
                    <label className="form-label" htmlFor="of-start">
                      Starts On
                    </label>
                    <input
                      id="of-start"
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
                    <label className="form-label" htmlFor="of-end">
                      Ends On
                    </label>
                    <input
                      id="of-end"
                      type="date"
                      className="form-control"
                      value={form.endsAt}
                      onChange={(e) =>
                        setForm({ ...form, endsAt: e.target.value })
                      }
                      disabled={saving}
                    />
                    {formErrors.endsAt ? (
                      <p className="form-error">{formErrors.endsAt}</p>
                    ) : null}
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 14, marginBottom: 0 }}>
                  <label className="form-label" htmlFor="of-status">
                    Status
                  </label>
                  <select
                    id="of-status"
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
                    : 'Create Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
};

export const OffersPage = () => (
  <PortalPage portal="admin">
    <Offers />
  </PortalPage>
);
