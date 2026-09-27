import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Boxes, Image as ImageIcon } from 'lucide-react';

import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { PortalPage } from '../../components/PortalPage';
import {
  PageHeader,
  StatCard,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/PortalPrimitives';

const EMPTY = { name: '', description: '', imageUrl: '' };

const Categories = () => {
  const { showToast } = useToast();

  const [categories, setCategories] = useState([]);
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
      const res = await api.get('/management/categories');

      if (res.data?.success) {
        setCategories(res.data.data?.categories || []);
      } else {
        setError(res.data?.message || 'Could not load categories.');
      }
    } catch (err) {
      setError(
        err.response?.data?.message || 'Could not load categories.'
      );
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

  const openEdit = (category) => {
    setEditing(category);
    setForm({
      name: category.name || '',
      description: category.description || '',
      imageUrl: category.image_url || '',
    });
    setFormErrors({});
    setShowForm(true);
  };

  const validate = () => {
    const errors = {};

    if (!form.name.trim()) {
      errors.name = 'Category name is required.';
    } else if (form.name.trim().length < 2) {
      errors.name = 'Use at least 2 characters.';
    }

    setFormErrors(errors);

    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      imageUrl: form.imageUrl.trim() || undefined,
    };

    try {
      const res = editing
        ? await api.put(`/management/categories/${editing.id}`, payload)
        : await api.post('/management/categories', payload);

      showToast(
        res.data?.message ||
          (editing ? 'Category updated' : 'Category created'),
        'success'
      );

      setShowForm(false);
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not save the category',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category) => {
    if (
      !window.confirm(
        `Delete "${category.name}"? Products in this category will need to be reassigned.`
      )
    ) {
      return;
    }

    try {
      const res = await api.delete(`/management/categories/${category.id}`);
      showToast(res.data?.message || 'Category deleted', 'success');
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not delete the category',
        'error'
      );
    }
  };

  const totalProducts = categories.reduce(
    (sum, c) => sum + Number(c.product_count || 0),
    0
  );

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Product groupings shown across the storefront navigation."
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={openCreate}
            data-testid="add-category"
          >
            <Plus size={16} /> New Category
          </button>
        }
      />

      {loading ? <LoadingState label="Loading categories..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div className="stat-cards-grid">
            <StatCard label="Categories" value={categories.length} icon={Boxes} />
            <StatCard
              label="Categorised Products"
              value={totalProducts}
              hint="Products without a category are not counted"
            />
          </div>

          {categories.length === 0 ? (
            <EmptyState message="No categories yet." icon={Boxes} />
          ) : (
            <div className="table-responsive">
              <table className="table" data-testid="categories-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Slug</th>
                    <th style={{ textAlign: 'right' }}>Products</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id}>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          {category.image_url ? (
                            <img
                              src={category.image_url}
                              alt=""
                              style={{
                                width: 40,
                                height: 40,
                                objectFit: 'cover',
                                borderRadius: 8,
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 8,
                                background: 'var(--bg-light)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-muted)',
                              }}
                            >
                              <ImageIcon size={16} />
                            </span>
                          )}

                          <div>
                            <div style={{ fontWeight: 700 }}>
                              {category.name}
                            </div>
                            {category.description ? (
                              <div
                                style={{
                                  fontSize: 12,
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {category.description}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td>
                        <code style={{ fontSize: 12 }}>{category.slug}</code>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        {Number(category.product_count || 0)}
                      </td>

                      <td
                        style={{
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openEdit(category)}
                          aria-label={`Edit ${category.name}`}
                        >
                          <Pencil size={14} /> Edit
                        </button>{' '}
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(category)}
                          aria-label={`Delete ${category.name}`}
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
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-form-title"
          >
            <div className="modal-header">
              <h3 id="category-form-title">
                {editing ? `Edit ${editing.name}` : 'New Category'}
              </h3>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="cat-name">
                    Name
                  </label>
                  <input
                    id="cat-name"
                    className="form-control"
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                    disabled={saving}
                  />
                  {formErrors.name ? (
                    <p className="form-error">{formErrors.name}</p>
                  ) : null}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="cat-desc">
                    Description
                  </label>
                  <textarea
                    id="cat-desc"
                    className="form-control"
                    rows={3}
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    disabled={saving}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="cat-image">
                    Image URL
                  </label>
                  <input
                    id="cat-image"
                    className="form-control"
                    value={form.imageUrl}
                    onChange={(e) =>
                      setForm({ ...form, imageUrl: e.target.value })
                    }
                    placeholder="https://..."
                    disabled={saving}
                  />
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
                    : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
};

export const CategoriesPage = () => (
  <PortalPage portal="admin">
    <Categories />
  </PortalPage>
);
