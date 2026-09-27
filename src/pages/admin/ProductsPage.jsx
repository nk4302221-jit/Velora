import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Boxes, Search } from 'lucide-react';

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

const EMPTY = {
  name: '',
  description: '',
  categoryId: '',
  brand: '',
  price: '',
  discountPrice: '',
  stock: '',
  productImage: '',
  status: 'active',
};

const toForm = (product) => ({
  name: product.name || '',
  description: product.description || '',
  categoryId:
    product.category_id !== null && product.category_id !== undefined
      ? String(product.category_id)
      : '',
  brand: product.brand || '',
  price:
    product.price !== null && product.price !== undefined
      ? String(product.price)
      : '',
  discountPrice:
    product.discount_price !== null &&
    product.discount_price !== undefined
      ? String(product.discount_price)
      : '',
  stock:
    product.stock !== null && product.stock !== undefined
      ? String(product.stock)
      : '',
  productImage: product.product_image || '',
  status: product.status || 'active',
});

const Products = () => {
  const { showToast } = useToast();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState(EMPTY);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // =====================================================
  // LOAD PRODUCTS
  // =====================================================
  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/products', {
        params: {
          page,
          limit: 20,
          search: search || undefined,
        },
      });

      if (res.data?.success) {
        setProducts(res.data.products || []);
        setPagination(res.data.pagination || null);
      } else {
        setError(res.data?.message || 'Could not load products.');
      }
    } catch (err) {
      setError(
        err.response?.data?.message || 'Could not load products.'
      );
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  // =====================================================
  // LOAD CATEGORIES
  // =====================================================
  useEffect(() => {
    api
      .get('/management/categories')
      .then((res) => {
        if (res.data?.success) {
          setCategories(res.data.data?.categories || []);
        }
      })
      .catch(() => {
        setCategories([]);
      });
  }, []);

  // =====================================================
  // OPEN CREATE FORM
  // =====================================================
  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setFormErrors({});
    setShowForm(true);
  };

  // =====================================================
  // OPEN EDIT FORM
  // =====================================================
  const openEdit = (product) => {
    setEditing(product);
    setForm(toForm(product));
    setFormErrors({});
    setShowForm(true);
  };

  // =====================================================
  // SELECTED CATEGORY
  // =====================================================
  const selectedCategory = categories.find(
    (category) => String(category.id) === form.categoryId
  );

  // =====================================================
  // PRODUCT IMAGE UPLOAD
  // Converts selected image into Base64/Data URL.
  // Existing product_image backend field remains unchanged.
  // =====================================================
  const handleProductImageUpload = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    // Validate image type
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file.', 'error');

      event.target.value = '';
      return;
    }

    // Maximum 5 MB
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size must be less than 5 MB.', 'error');

      event.target.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setForm((previousForm) => ({
        ...previousForm,
        productImage: reader.result,
      }));

      showToast('Product image selected successfully.', 'success');
    };

    reader.onerror = () => {
      showToast('Failed to read the selected image.', 'error');
      event.target.value = '';
    };

    reader.readAsDataURL(file);
  };

  // =====================================================
  // REMOVE PRODUCT IMAGE
  // =====================================================
  const handleRemoveProductImage = () => {
    setForm((previousForm) => ({
      ...previousForm,
      productImage: '',
    }));

    const input = document.getElementById('pr-image');

    if (input) {
      input.value = '';
    }
  };

  // =====================================================
  // VALIDATION
  // =====================================================
  const validate = () => {
    const errors = {};

    if (!form.name.trim()) {
      errors.name = 'Product name is required.';
    }

    if (!form.brand.trim()) {
      errors.brand = 'Brand is required.';
    }

    if (!form.categoryId) {
      errors.categoryId = 'Choose a category.';
    }

    const price = Number(form.price);

    if (
      form.price === '' ||
      Number.isNaN(price) ||
      price <= 0
    ) {
      errors.price = 'Enter a price greater than 0.';
    }

    const discount = Number(form.discountPrice);

    if (form.discountPrice !== '') {
      if (
        Number.isNaN(discount) ||
        discount < 0
      ) {
        errors.discountPrice =
          'Discount price cannot be negative.';
      } else if (
        !Number.isNaN(price) &&
        discount > price
      ) {
        errors.discountPrice =
          'Discount price cannot exceed the price.';
      }
    }

    if (form.stock !== '') {
      const stock = Number(form.stock);

      if (
        !Number.isInteger(stock) ||
        stock < 0
      ) {
        errors.stock =
          'Stock must be a whole number of 0 or more.';
      }
    }

    setFormErrors(errors);

    return Object.keys(errors).length === 0;
  };

  // =====================================================
  // SUBMIT PRODUCT
  // =====================================================
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    setSaving(true);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      brand: form.brand.trim(),

      category_id: Number(form.categoryId),

      // Keep category name synced with selected category
      category_name: selectedCategory?.name || '',

      price: Number(form.price),

      discount_price:
        form.discountPrice === ''
          ? null
          : Number(form.discountPrice),

      stock:
        form.stock === ''
          ? 0
          : parseInt(form.stock, 10),

      // Image is now Base64/Data URL
      product_image:
        form.productImage || undefined,

      status: form.status,
    };

    try {
      const res = editing
        ? await api.put(
            `/products/${editing.id}`,
            payload
          )
        : await api.post(
            '/products',
            payload
          );

      showToast(
        res.data?.message ||
          (editing
            ? 'Product updated'
            : 'Product created'),
        'success'
      );

      setShowForm(false);
      setForm(EMPTY);
      setEditing(null);

      load();
    } catch (err) {
      showToast(
        err.response?.data?.message ||
          'Could not save the product',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  // =====================================================
  // DELETE PRODUCT
  // =====================================================
  const handleDelete = async (product) => {
    if (
      !window.confirm(
        `Delete "${product.name}"? This cannot be undone and will break any order history referencing it.`
      )
    ) {
      return;
    }

    try {
      const res = await api.delete(
        `/products/${product.id}`
      );

      showToast(
        res.data?.message || 'Product deleted',
        'success'
      );

      load();
    } catch (err) {
      showToast(
        err.response?.data?.message ||
          'Could not delete the product',
        'error'
      );
    }
  };

  // =====================================================
  // RENDER
  // =====================================================
  return (
    <>
      <PageHeader
        title="Products"
        subtitle="The catalogue customers browse and order from."
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={openCreate}
            data-testid="add-product"
          >
            <Plus size={16} />
            New Product
          </button>
        }
      />

      {/* =================================================
          SEARCH
      ================================================= */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
        }}
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 20,
        }}
      >
        <div style={{ flex: 1 }}>
          <input
            className="form-control"
            placeholder="Search products by name, brand or category..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            aria-label="Search products"
          />
        </div>

        <button
          type="submit"
          className="btn btn-secondary btn-sm"
        >
          <Search size={15} />
          Search
        </button>
      </form>

      {/* =================================================
          LOADING
      ================================================= */}
      {loading ? (
        <LoadingState label="Loading products..." />
      ) : null}

      {/* =================================================
          ERROR
      ================================================= */}
      {!loading && error ? (
        <ErrorState
          message={error}
          onRetry={load}
        />
      ) : null}

      {/* =================================================
          PRODUCTS
      ================================================= */}
      {!loading && !error ? (
        products.length === 0 ? (
          <EmptyState
            message="No products match this search."
            icon={Boxes}
          />
        ) : (
          <>
            <div className="table-responsive">
              <table
                className="table"
                data-testid="products-table"
              >
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Brand</th>
                    <th
                      style={{
                        textAlign: 'right',
                      }}
                    >
                      Price
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                      }}
                    >
                      Stock
                    </th>
                    <th>Status</th>
                    <th
                      style={{
                        textAlign: 'right',
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {products.map((product) => (
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
                              onError={(event) => {
                                event.currentTarget.style.display =
                                  'none';
                              }}
                              style={{
                                width: 44,
                                height: 44,
                                objectFit: 'cover',
                                borderRadius: 8,
                              }}
                            />
                          ) : null}

                          <div
                            style={{
                              maxWidth: 260,
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 14,
                              }}
                            >
                              {product.name}
                            </div>

                            {product.description ? (
                              <div
                                style={{
                                  fontSize: 12,
                                  color:
                                    'var(--text-muted)',
                                  overflow: 'hidden',
                                  textOverflow:
                                    'ellipsis',
                                  whiteSpace:
                                    'nowrap',
                                }}
                              >
                                {product.description}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td
                        style={{
                          fontSize: 13,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {product.category_name || '-'}
                      </td>

                      <td
                        style={{
                          fontSize: 13,
                        }}
                      >
                        {product.brand || '-'}
                      </td>

                      <td
                        style={{
                          textAlign: 'right',
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                          }}
                        >
                          {money(
                            product.discount_price ??
                              product.price
                          )}
                        </div>

                        {product.discount_price ? (
                          <div
                            style={{
                              fontSize: 12,
                              color:
                                'var(--text-muted)',
                              textDecoration:
                                'line-through',
                            }}
                          >
                            {money(product.price)}
                          </div>
                        ) : null}
                      </td>

                      <td
                        style={{
                          textAlign: 'right',
                        }}
                      >
                        {Number(
                          product.stock || 0
                        ) <= 5 ? (
                          <span
                            style={{
                              color: '#b45309',
                              fontWeight: 700,
                            }}
                          >
                            {product.stock}
                          </span>
                        ) : (
                          product.stock
                        )}
                      </td>

                      <td>
                        <StatusBadge
                          status={product.status}
                        />
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
                          onClick={() =>
                            openEdit(product)
                          }
                          aria-label={`Edit ${product.name}`}
                        >
                          <Pencil size={14} />
                          Edit
                        </button>{' '}

                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() =>
                            handleDelete(product)
                          }
                          aria-label={`Delete ${product.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* =================================================
                PAGINATION
            ================================================= */}
            {pagination &&
            pagination.totalPages > 1 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent:
                    'space-between',
                  marginTop: 16,
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                  }}
                >
                  Page {pagination.page} of{' '}
                  {pagination.totalPages} ·{' '}
                  {pagination.total} products
                </span>

                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page <= 1}
                    onClick={() =>
                      setPage(
                        (previousPage) =>
                          previousPage - 1
                      )
                    }
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={
                      page >=
                      pagination.totalPages
                    }
                    onClick={() =>
                      setPage(
                        (previousPage) =>
                          previousPage + 1
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )
      ) : null}

      {/* =================================================
          PRODUCT CREATE / EDIT MODAL
      ================================================= */}
      {showForm ? (
        <div
          className="modal-backdrop"
          onClick={() =>
            setShowForm(false)
          }
        >
          <div
            className="modal-box"
            style={{
              maxWidth: 640,
            }}
            onClick={(event) =>
              event.stopPropagation()
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-form-title"
          >
            {/* =================================================
                MODAL HEADER
            ================================================= */}
            <div className="modal-header">
              <h3 id="product-form-title">
                {editing
                  ? `Edit ${editing.name}`
                  : 'New Product'}
              </h3>
            </div>

            {/* =================================================
                PRODUCT FORM
            ================================================= */}
            <form onSubmit={handleSubmit}>
              <div className="modal-body">

                {/* NAME */}
                <div className="form-group">
                  <label
                    className="form-label"
                    htmlFor="pr-name"
                  >
                    Name
                  </label>

                  <input
                    id="pr-name"
                    className="form-control"
                    value={form.name}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        name: event.target.value,
                      })
                    }
                    disabled={saving}
                  />

                  {formErrors.name ? (
                    <p className="form-error">
                      {formErrors.name}
                    </p>
                  ) : null}
                </div>

                {/* DESCRIPTION */}
                <div className="form-group">
                  <label
                    className="form-label"
                    htmlFor="pr-desc"
                  >
                    Description
                  </label>

                  <textarea
                    id="pr-desc"
                    className="form-control"
                    rows={3}
                    value={form.description}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        description:
                          event.target.value,
                      })
                    }
                    disabled={saving}
                  />
                </div>

                {/* CATEGORY / BRAND / PRICE / DISCOUNT / STOCK / STATUS */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(190px, 1fr))',
                    gap: 14,
                  }}
                >
                  {/* CATEGORY */}
                  <div
                    className="form-group"
                    style={{
                      marginBottom: 0,
                    }}
                  >
                    <label
                      className="form-label"
                      htmlFor="pr-category"
                    >
                      Category
                    </label>

                    <select
                      id="pr-category"
                      className="form-control"
                      value={form.categoryId}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          categoryId:
                            event.target.value,
                        })
                      }
                      disabled={saving}
                    >
                      <option value="">
                        Select a category...
                      </option>

                      {categories.map(
                        (category) => (
                          <option
                            key={category.id}
                            value={category.id}
                          >
                            {category.name}
                          </option>
                        )
                      )}
                    </select>

                    {formErrors.categoryId ? (
                      <p className="form-error">
                        {formErrors.categoryId}
                      </p>
                    ) : null}
                  </div>

                  {/* BRAND */}
                  <div
                    className="form-group"
                    style={{
                      marginBottom: 0,
                    }}
                  >
                    <label
                      className="form-label"
                      htmlFor="pr-brand"
                    >
                      Brand
                    </label>

                    <input
                      id="pr-brand"
                      className="form-control"
                      value={form.brand}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          brand: event.target.value,
                        })
                      }
                      disabled={saving}
                    />

                    {formErrors.brand ? (
                      <p className="form-error">
                        {formErrors.brand}
                      </p>
                    ) : null}
                  </div>

                  {/* PRICE */}
                  <div
                    className="form-group"
                    style={{
                      marginBottom: 0,
                    }}
                  >
                    <label
                      className="form-label"
                      htmlFor="pr-price"
                    >
                      Price
                    </label>

                    <input
                      id="pr-price"
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control"
                      value={form.price}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          price:
                            event.target.value,
                        })
                      }
                      disabled={saving}
                    />

                    {formErrors.price ? (
                      <p className="form-error">
                        {formErrors.price}
                      </p>
                    ) : null}
                  </div>

                  {/* DISCOUNT PRICE */}
                  <div
                    className="form-group"
                    style={{
                      marginBottom: 0,
                    }}
                  >
                    <label
                      className="form-label"
                      htmlFor="pr-discount"
                    >
                      Discount Price
                    </label>

                    <input
                      id="pr-discount"
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-control"
                      value={
                        form.discountPrice
                      }
                      onChange={(event) =>
                        setForm({
                          ...form,
                          discountPrice:
                            event.target.value,
                        })
                      }
                      disabled={saving}
                    />

                    {formErrors.discountPrice ? (
                      <p className="form-error">
                        {
                          formErrors.discountPrice
                        }
                      </p>
                    ) : null}
                  </div>

                  {/* STOCK */}
                  <div
                    className="form-group"
                    style={{
                      marginBottom: 0,
                    }}
                  >
                    <label
                      className="form-label"
                      htmlFor="pr-stock"
                    >
                      Stock
                    </label>

                    <input
                      id="pr-stock"
                      type="number"
                      min="0"
                      step="1"
                      className="form-control"
                      value={form.stock}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          stock:
                            event.target.value,
                        })
                      }
                      disabled={saving}
                    />

                    {formErrors.stock ? (
                      <p className="form-error">
                        {formErrors.stock}
                      </p>
                    ) : null}
                  </div>

                  {/* STATUS */}
                  <div
                    className="form-group"
                    style={{
                      marginBottom: 0,
                    }}
                  >
                    <label
                      className="form-label"
                      htmlFor="pr-status"
                    >
                      Status
                    </label>

                    <select
                      id="pr-status"
                      className="form-control"
                      value={form.status}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          status:
                            event.target.value,
                        })
                      }
                      disabled={saving}
                    >
                      <option value="active">
                        Active
                      </option>

                      <option value="inactive">
                        Inactive
                      </option>
                    </select>
                  </div>
                </div>

                {/* =================================================
                    PRODUCT IMAGE UPLOAD
                ================================================= */}
                <div
                  className="form-group"
                  style={{
                    marginTop: 14,
                    marginBottom: 0,
                  }}
                >
                  <label
                    className="form-label"
                    htmlFor="pr-image"
                  >
                    Product Image
                  </label>

                  <input
                    id="pr-image"
                    type="file"
                    className="form-control"
                    accept="image/*"
                    onChange={
                      handleProductImageUpload
                    }
                    disabled={saving}
                  />

                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color:
                        'var(--text-muted)',
                    }}
                  >
                    Supported formats: JPG,
                    JPEG, PNG, WEBP, GIF
                    <br />
                    Maximum file size: 5 MB
                  </div>

                  {/* IMAGE PREVIEW */}
                  {form.productImage ? (
                    <div
                      style={{
                        marginTop: 16,
                        padding: 16,
                        border:
                          '1px solid var(--border-color)',
                        borderRadius: 12,
                        background:
                          'var(--bg-surface)',
                        display: 'flex',
                        alignItems:
                          'center',
                        gap: 16,
                        flexWrap: 'wrap',
                      }}
                    >
                      <img
                        src={
                          form.productImage
                        }
                        alt="Product preview"
                        style={{
                          width: 120,
                          height: 120,
                          objectFit: 'cover',
                          borderRadius: 10,
                          border:
                            '1px solid var(--border-color)',
                          display: 'block',
                        }}
                      />

                      <div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            marginBottom: 6,
                          }}
                        >
                          Image Preview
                        </div>

                        <div
                          style={{
                            fontSize: 12,
                            color:
                              'var(--text-muted)',
                            marginBottom: 12,
                          }}
                        >
                          This image will be
                          saved with the
                          product.
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={
                            handleRemoveProductImage
                          }
                          disabled={saving}
                          style={{
                            color:
                              'var(--danger)',
                          }}
                        >
                          <Trash2 size={14} />
                          Remove Image
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        marginTop: 14,
                        padding: 18,
                        border:
                          '1px dashed var(--border-color)',
                        borderRadius: 10,
                        textAlign: 'center',
                        color:
                          'var(--text-muted)',
                        fontSize: 13,
                      }}
                    >
                      No product image
                      selected
                    </div>
                  )}
                </div>
              </div>

              {/* =================================================
                  MODAL FOOTER
              ================================================= */}
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setShowForm(false)
                  }
                  disabled={saving}
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
                    : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
};

export const ProductsPage = () => (
  <PortalPage portal="admin">
    <Products />
  </PortalPage>
);