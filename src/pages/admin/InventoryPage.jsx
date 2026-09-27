import React, { useState, useEffect, useCallback } from 'react';
import { Package, Save, Search, AlertTriangle, XCircle } from 'lucide-react';

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

const Inventory = () => {
  const { showToast } = useToast();

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [pagination, setPagination] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [page, setPage] = useState(1);

  // Per-row edit buffers, so typing in one row never clobbers another.
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/management/inventory', {
        params: { page, limit: 20, search: search || undefined, stock: stockFilter || undefined },
      });

      if (res.data?.success) {
        // NOTE: this endpoint responds with a raw { success, items, summary,
        // pagination } body rather than successResponse(), so the payload sits
        // at the top level - NOT under res.data.data.
        setItems(res.data.items || []);
        setSummary(res.data.summary || {});
        setPagination(res.data.pagination || null);
      } else {
        setError(res.data?.message || 'Could not load inventory.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load inventory.');
    } finally {
      setLoading(false);
    }
  }, [page, search, stockFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const setDraft = (id, patch) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  };

  const saveRow = async (product) => {
    const draft = drafts[product.id];

    if (!draft) return;

    const payload = {};

    if (draft.stock !== undefined && draft.stock !== product.stock) {
      const parsed = Number(draft.stock);

      if (!Number.isInteger(parsed) || parsed < 0) {
        showToast('Stock must be a whole number of 0 or more', 'error');
        return;
      }

      payload.stock = parsed;
    }

    if (draft.status && draft.status !== product.status) {
      payload.status = draft.status;
    }

    if (Object.keys(payload).length === 0) {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[product.id];
        return next;
      });
      return;
    }

    setSavingId(product.id);

    try {
      const res = await api.patch(`/management/inventory/${product.id}`, payload);
      showToast(
        res.data?.message || `Updated ${product.name}`,
        'success'
      );
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not update inventory',
        'error'
      );
    } finally {
      setSavingId(null);
    }
  };

  const onSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="Stock levels and product availability across the catalogue."
      />

      <div className="stat-cards-grid">
        <StatCard
          label="Units in Stock"
          value={Number(summary.totalUnits || 0)}
          icon={Package}
        />
        <StatCard
          label="Low Stock"
          value={Number(summary.lowStock || 0)}
          hint="At or below the reorder threshold"
        />
        <StatCard
          label="Out of Stock"
          value={Number(summary.outOfStock || 0)}
          icon={XCircle}
        />
        <StatCard
          label="Tracked Products"
          value={Number(summary.totalProducts || 0)}
        />
      </div>

      <form
        onSubmit={onSearchSubmit}
        style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <input
            className="form-control"
            placeholder="Search by product or brand..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search inventory"
          />
        </div>

        <select
          className="form-control"
          style={{ width: 180 }}
          value={stockFilter}
          onChange={(e) => {
            setStockFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by stock level"
        >
          <option value="">All stock levels</option>
          <option value="out_of_stock">Out of stock</option>
          <option value="low">Low stock</option>
          <option value="in_stock">In stock</option>
        </select>

        <button type="submit" className="btn btn-secondary btn-sm">
          <Search size={15} /> Search
        </button>
      </form>

      {loading ? <LoadingState label="Loading inventory..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        items.length === 0 ? (
          <EmptyState message="No products match this filter." icon={Package} />
        ) : (
          <div className="table-responsive">
            <table className="table" data-testid="inventory-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Stock</th>
                  <th style={{ width: 150 }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Save</th>
                </tr>
              </thead>
              <tbody>
                {items.map((product) => {
                  const draft = drafts[product.id] || {};
                  const dirty =
                    (draft.stock !== undefined &&
                      Number(draft.stock) !== Number(product.stock)) ||
                    (draft.status && draft.status !== product.status);
                  const low =
                    Number(product.stock) > 0 &&
                    Number(product.stock) <= 5;

                  return (
                    <tr key={product.id}>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          {product.product_image ? (
                            <img
                              src={product.product_image}
                              alt=""
                              style={{
                                width: 40,
                                height: 40,
                                objectFit: 'cover',
                                borderRadius: 8,
                              }}
                            />
                          ) : null}

                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                              {product.name}
                            </div>
                            {product.brand ? (
                              <div
                                style={{
                                  fontSize: 12,
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {product.brand}
                              </div>
                            ) : null}
                            {low ? (
                              <div
                                style={{
                                  fontSize: 12,
                                  color: '#b45309',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <AlertTriangle size={12} /> Low stock
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {product.category_name || '-'}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        {money(
                          product.discount_price ?? product.price
                        )}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          className="form-control"
                          style={{ textAlign: 'right' }}
                          value={
                            draft.stock !== undefined
                              ? draft.stock
                              : product.stock
                          }
                          onChange={(e) =>
                            setDraft(product.id, {
                              stock: e.target.value,
                            })
                          }
                          aria-label={`Stock for ${product.name}`}
                        />
                      </td>

                      <td>
                        <select
                          className="form-control"
                          value={
                            draft.status || product.status || 'active'
                          }
                          onChange={(e) =>
                            setDraft(product.id, {
                              status: e.target.value,
                            })
                          }
                          aria-label={`Status for ${product.name}`}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                        {product.status ? (
                          <div style={{ marginTop: 5 }}>
                            <StatusBadge status={product.status} />
                          </div>
                        ) : null}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={!dirty || savingId === product.id}
                          onClick={() => saveRow(product)}
                          aria-label={`Save ${product.name}`}
                        >
                          <Save size={14} />{' '}
                          {savingId === product.id ? '...' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
                  {pagination.total} products
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

export const InventoryPage = () => (
  <PortalPage portal="admin">
    <Inventory />
  </PortalPage>
);
