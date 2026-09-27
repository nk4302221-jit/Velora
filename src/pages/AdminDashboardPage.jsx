import React, { useEffect, useState } from 'react';

import {
  Package,
  ShoppingBag,
  DollarSign,
  Users,
  Plus,
  Trash2,
  Edit,
  RotateCcw,
  ShieldCheck,
  UserPlus,
  UserX,
  UserCheck,
} from 'lucide-react';

import api from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

import {
  normalizeRole,
  isSuperAdminRole,
  roleLabel,
} from '../utils/roles';

export const AdminDashboardPage = () => {
  const { showToast } = useToast();
  const { user } = useAuth();

  const isSuperAdmin = isSuperAdminRole(user?.role);

  // =====================================================
  // GENERAL STATE
  // =====================================================
  const [activeTab, setActiveTab] = useState('analytics');
  const [loading, setLoading] = useState(true);

  // =====================================================
  // ANALYTICS
  // =====================================================
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    totalUsers: 0,
    lowStockCount: 0,
    recentOrders: [],
  });

  // =====================================================
  // PRODUCTS
  // =====================================================
  const [products, setProducts] = useState([]);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);

  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    discount_price: '',
    stock: '',
    brand: '',
    category_id: 1,
    product_image: '',
  });

  // =====================================================
  // ORDERS
  // =====================================================
  const [orders, setOrders] = useState([]);

  // =====================================================
  // USERS
  // =====================================================
  const [users, setUsers] = useState([]);

  // =====================================================
  // CATEGORIES
  // =====================================================
  const [categories, setCategories] = useState([]);

  // =====================================================
  // CREATE ADMIN
  // =====================================================
  const [showAdminModal, setShowAdminModal] = useState(false);

  const [adminForm, setAdminForm] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
  });

  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // =====================================================
  // LOAD ADMIN DATA
  // =====================================================
  const loadAdminData = async () => {
    setLoading(true);

    try {
      const results = await Promise.allSettled([
        api.get('/admin/dashboard'),
        api.get('/products?limit=100'),
        api.get('/admin/orders?limit=100'),
        api.get('/admin/users?limit=100'),
        api.get('/products/categories'),
      ]);

      const [
        statsRes,
        productsRes,
        ordersRes,
        usersRes,
        catsRes,
      ] = results;

      // Dashboard
      if (statsRes.status === 'fulfilled') {
        if (statsRes.value.data.success) {
          setStats(
            statsRes.value.data.data?.stats ||
              statsRes.value.data.stats ||
              {}
          );
        }
      } else {
        console.error(
          '[AdminAPI] dashboard failed',
          statsRes.reason?.response?.data || statsRes.reason
        );

        showToast(
          statsRes.reason?.response?.data?.message ||
            'Failed to load dashboard statistics',
          'error'
        );
      }

      // Products
      if (productsRes.status === 'fulfilled') {
        if (productsRes.value.data.success) {
          setProducts(productsRes.value.data.products || []);
        }
      } else {
        console.error(
          '[AdminAPI] products failed',
          productsRes.reason?.response?.data || productsRes.reason
        );
      }

      // Orders
      if (ordersRes.status === 'fulfilled') {
        if (ordersRes.value.data.success) {
          setOrders(ordersRes.value.data.orders || []);
        }
      } else {
        console.error(
          '[AdminAPI] orders failed',
          ordersRes.reason?.response?.data || ordersRes.reason
        );

        showToast(
          ordersRes.reason?.response?.data?.message ||
            'Failed to load orders',
          'error'
        );
      }

      // Users
      if (usersRes.status === 'fulfilled') {
        if (usersRes.value.data.success) {
          setUsers(usersRes.value.data.users || []);
        }
      } else {
        console.error(
          '[AdminAPI] users failed',
          usersRes.reason?.response?.data || usersRes.reason
        );

        showToast(
          usersRes.reason?.response?.data?.message ||
            'Failed to load users',
          'error'
        );
      }

      // Categories
      if (catsRes.status === 'fulfilled') {
        if (catsRes.value.data.success) {
          setCategories(
            catsRes.value.data.data?.categories ||
              catsRes.value.data.categories ||
              []
          );
        }
      } else {
        console.error(
          '[AdminAPI] categories failed',
          catsRes.reason?.response?.data || catsRes.reason
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  // =====================================================
  // PRODUCT IMAGE UPLOAD
  // No URL input.
  // Selected image is converted to data URL.
  // =====================================================
  const handleProductImageUpload = (e) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      showToast(
        'Please select a valid image file.',
        'error'
      );

      e.target.value = '';
      return;
    }

    // Maximum 5 MB
    if (file.size > 5 * 1024 * 1024) {
      showToast(
        'Image size must be less than 5 MB.',
        'error'
      );

      e.target.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setProductForm((prev) => ({
        ...prev,
        product_image: reader.result,
      }));

      showToast(
        'Product image selected successfully.',
        'success'
      );
    };

    reader.onerror = () => {
      showToast(
        'Failed to read image.',
        'error'
      );

      e.target.value = '';
    };

    reader.readAsDataURL(file);
  };

  // =====================================================
  // REMOVE PRODUCT IMAGE
  // =====================================================
  const handleRemoveProductImage = () => {
    setProductForm((prev) => ({
      ...prev,
      product_image: '',
    }));

    const input = document.getElementById(
      'product-image-input'
    );

    if (input) {
      input.value = '';
    }
  };

  // =====================================================
  // RESET PRODUCT FORM
  // =====================================================
  const resetProductForm = () => {
    setEditingProductId(null);

    setProductForm({
      name: '',
      description: '',
      price: '',
      discount_price: '',
      stock: '',
      brand: '',
      category_id: 1,
      product_image: '',
    });

    const input = document.getElementById(
      'product-image-input'
    );

    if (input) {
      input.value = '';
    }
  };

  // =====================================================
  // SAVE / UPDATE PRODUCT
  // =====================================================
  const handleSaveProduct = async (e) => {
    e.preventDefault();

    try {
      const payload = {
        name: productForm.name,
        description: productForm.description,
        price: parseFloat(productForm.price),
        discount_price: productForm.discount_price
          ? parseFloat(productForm.discount_price)
          : null,
        stock: parseInt(productForm.stock, 10),
        brand: productForm.brand,
        category_id: Number(productForm.category_id),

        product_image:
          productForm.product_image ||
          'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80',
      };

      if (editingProductId) {
        const res = await api.put(
          `/products/${editingProductId}`,
          payload
        );

        if (res.data.success) {
          showToast(
            'Product updated successfully!',
            'success'
          );
        }
      } else {
        const res = await api.post(
          '/products',
          payload
        );

        if (res.data.success) {
          showToast(
            'New product added to catalog!',
            'success'
          );
        }
      }

      setShowProductModal(false);
      resetProductForm();

      await loadAdminData();
    } catch (err) {
      console.error(
        '[AdminAPI] save product failed',
        err.response?.data || err
      );

      showToast(
        err.response?.data?.message ||
          'Failed to save product',
        'error'
      );
    }
  };

  // =====================================================
  // EDIT PRODUCT
  // =====================================================
  const handleEditProductClick = (product) => {
    setEditingProductId(product.id);

    setProductForm({
      name: product.name || '',
      description: product.description || '',
      price:
        product.price !== undefined &&
        product.price !== null
          ? String(product.price)
          : '',
      discount_price:
        product.discount_price !== undefined &&
        product.discount_price !== null
          ? String(product.discount_price)
          : '',
      stock:
        product.stock !== undefined &&
        product.stock !== null
          ? String(product.stock)
          : '',
      brand: product.brand || '',
      category_id: product.category_id || 1,
      product_image: product.product_image || '',
    });

    setShowProductModal(true);
  };

  // =====================================================
  // DELETE PRODUCT
  // =====================================================
  const handleDeleteProduct = async (id) => {
    if (
      !window.confirm(
        'Are you sure you want to delete this product?'
      )
    ) {
      return;
    }

    try {
      const res = await api.delete(
        `/products/${id}`
      );

      if (res.data.success) {
        showToast(
          'Product deleted',
          'success'
        );

        setProducts((prev) =>
          prev.filter((product) => product.id !== id)
        );
      }
    } catch (err) {
      console.error(
        '[AdminAPI] delete product failed',
        err.response?.data || err
      );

      showToast(
        err.response?.data?.message ||
          'Failed to delete product',
        'error'
      );
    }
  };

  // =====================================================
  // UPDATE ORDER STATUS
  // =====================================================
  const handleUpdateOrderStatus = async (
    orderId,
    newStatus
  ) => {
    try {
      const res = await api.patch(
        `/admin/orders/${orderId}/status`,
        {
          orderStatus: newStatus,
        }
      );

      if (res.data.success) {
        showToast(
          `Order status updated to ${newStatus}`,
          'success'
        );

        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId
              ? {
                  ...order,
                  order_status: newStatus,
                }
              : order
          )
        );
      }
    } catch (err) {
      console.error(
        '[AdminAPI] update order status failed',
        err.response?.data || err
      );

      showToast(
        err.response?.data?.message ||
          'Failed to update status',
        'error'
      );
    }
  };

  // =====================================================
  // UPDATE USER STATUS
  // =====================================================
  const handleUpdateUserStatus = async (
    userId,
    status
  ) => {
    try {
      const res = await api.patch(
        `/admin/users/${userId}/status`,
        {
          status,
        }
      );

      if (res.data.success) {
        showToast(
          res.data.message ||
            'User status updated',
          'success'
        );

        setUsers((prev) =>
          prev.map((item) =>
            item.id === userId
              ? {
                  ...item,
                  status,
                }
              : item
          )
        );
      }
    } catch (err) {
      const message =
        err.response?.data?.message ||
        'Failed to update user status';

      console.error(
        '[AdminAPI] updateUserStatus failed',
        {
          status: err.response?.status,
          message,
        }
      );

      showToast(message, 'error');
    }
  };

  // =====================================================
  // CREATE ADMIN
  // =====================================================
  const handleCreateAdmin = async (e) => {
    e.preventDefault();

    if (!isSuperAdmin) {
      showToast(
        'Only Super Admin can create admin accounts',
        'error'
      );

      return;
    }

    try {
      setCreatingAdmin(true);

      const res = await api.post(
        '/admin/users/admin',
        {
          fullName: adminForm.fullName,
          email: adminForm.email,
          password: adminForm.password,
          phone: adminForm.phone || undefined,
        }
      );

      if (res.data.success) {
        showToast(
          res.data.message ||
            'Admin created successfully',
          'success'
        );

        setAdminForm({
          fullName: '',
          email: '',
          password: '',
          phone: '',
        });

        setShowAdminModal(false);

        await loadAdminData();
      }
    } catch (err) {
      const message =
        err.response?.data?.message ||
        'Failed to create admin';

      console.error(
        '[AdminAPI] createAdmin failed',
        {
          status: err.response?.status,
          message,
        }
      );

      showToast(message, 'error');
    } finally {
      setCreatingAdmin(false);
    }
  };

  // =====================================================
  // CHANGE ROLE
  // =====================================================
  const handleChangeUserRole = async (
    userId,
    currentRole,
    nextRole
  ) => {
    const normalizedCurrent =
      normalizeRole(currentRole);

    if (!isSuperAdmin) {
      showToast(
        'Only Super Admin can change roles',
        'error'
      );

      return;
    }

    if (normalizedCurrent === 'super_admin') {
      showToast(
        'The super_admin role cannot be changed from here',
        'error'
      );

      return;
    }

    if (userId === user?.id) {
      showToast(
        'You cannot change your own role',
        'error'
      );

      return;
    }

    if (
      !window.confirm(
        `Change ${normalizedCurrent} to ${nextRole}?`
      )
    ) {
      return;
    }

    try {
      const res = await api.patch(
        `/admin/users/${userId}/role`,
        {
          role: nextRole,
        }
      );

      if (res.data.success) {
        showToast(
          res.data.message ||
            `Role updated to ${nextRole}`,
          'success'
        );

        setUsers((prev) =>
          prev.map((item) =>
            item.id === userId
              ? {
                  ...item,
                  role: nextRole,
                }
              : item
          )
        );
      }
    } catch (err) {
      const message =
        err.response?.data?.message ||
        'Failed to update role';

      console.error(
        '[AdminAPI] updateUserRole failed',
        {
          status: err.response?.status,
          message,
        }
      );

      showToast(message, 'error');
    }
  };

  // =====================================================
  // LOADING
  // =====================================================
  if (loading) {
    return (
      <div
        className="site-wrapper"
        style={{
          margin: '36px auto 80px',
        }}
        id="admin-dashboard-container"
      >
        <div
          className="card"
          style={{
            padding: '50px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '18px',
              fontWeight: 700,
              marginBottom: '8px',
            }}
          >
            Loading Admin Dashboard...
          </div>

          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: '13px',
            }}
          >
            Please wait while store data is loading.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="site-wrapper"
      style={{
        margin: '36px auto 80px',
      }}
      id="admin-dashboard-container"
    >
      {/* =====================================================
          HEADER
      ===================================================== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <span
            className="badge badge-primary"
            style={{
              marginBottom: '6px',
            }}
          >
            Administrative Console
          </span>

          <h1
            style={{
              fontSize: '28px',
              margin: 0,
            }}
          >
            Store Management Hub
          </h1>

          <div
            style={{
              marginTop: '8px',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span
              className="badge badge-neutral"
              id="admin-session-role"
            >
              Signed in as {roleLabel(user?.role)}
            </span>

            {isSuperAdmin && (
              <span
                className="badge badge-primary"
                id="admin-superadmin-badge"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <ShieldCheck size={12} />
                Super Admin privileges
              </span>
            )}
          </div>
        </div>

        <button
          onClick={loadAdminData}
          className="btn btn-secondary btn-sm"
          id="refresh-admin-btn"
        >
          <RotateCcw size={14} />
          Refresh Data
        </button>
      </div>

      {/* =====================================================
          TABS
      ===================================================== */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom:
            '1px solid var(--border-color)',
          marginBottom: '28px',
          overflowX: 'auto',
        }}
      >
        {[
          ['analytics', <DollarSign size={16} />, 'Overview Analytics'],
          ['products', <Package size={16} />, `Products (${products.length})`],
          ['orders', <ShoppingBag size={16} />, `Orders (${orders.length})`],
          ['users', <Users size={16} />, `Users (${users.length})`],
        ].map(([tab, icon, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 18px',
              fontWeight: 700,
              fontSize: '14px',
              borderBottom:
                activeTab === tab
                  ? '2px solid var(--primary)'
                  : 'none',
              color:
                activeTab === tab
                  ? 'var(--primary)'
                  : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            id={`admin-tab-${tab}`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* =====================================================
          ANALYTICS
      ===================================================== */}
      {activeTab === 'analytics' && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '20px',
              marginBottom: '32px',
            }}
          >
            <div
              className="card"
              style={{ padding: '24px' }}
              id="admin-stat-revenue"
            >
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                Total Revenue
              </span>

              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  marginTop: '10px',
                }}
              >
                $
                {Number(
                  stats.totalRevenue || 0
                ).toFixed(2)}
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--success)',
                  marginTop: '4px',
                }}
              >
                Stripe & Razorpay Captured
              </div>
            </div>

            <div
              className="card"
              style={{ padding: '24px' }}
              id="admin-stat-orders"
            >
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                Total Orders
              </span>

              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  marginTop: '10px',
                }}
              >
                {stats.totalOrders || 0}
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                }}
              >
                Across all categories
              </div>
            </div>

            <div
              className="card"
              style={{ padding: '24px' }}
              id="admin-stat-products"
            >
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                Active Catalog
              </span>

              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  marginTop: '10px',
                }}
              >
                {stats.totalProducts || 0}
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                }}
              >
                SKUs currently in stock
              </div>
            </div>

            <div
              className="card"
              style={{ padding: '24px' }}
              id="admin-stat-users"
            >
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                Registered Users
              </span>

              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 800,
                  marginTop: '10px',
                }}
              >
                {stats.totalUsers || 0}
              </div>

              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                }}
              >
                Authenticated accounts
              </div>
            </div>
          </div>

          <div
            className="card"
            style={{ padding: '24px' }}
          >
            <h3
              style={{
                fontSize: '18px',
                marginBottom: '16px',
              }}
            >
              Recent Store Purchases
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom:
                        '2px solid var(--border-color)',
                      textAlign: 'left',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <th style={{ padding: '10px' }}>
                      Order #
                    </th>
                    <th style={{ padding: '10px' }}>
                      Customer
                    </th>
                    <th style={{ padding: '10px' }}>
                      Amount
                    </th>
                    <th style={{ padding: '10px' }}>
                      Payment
                    </th>
                    <th style={{ padding: '10px' }}>
                      Status
                    </th>
                    <th style={{ padding: '10px' }}>
                      Date
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {orders.slice(0, 5).map((order) => (
                    <tr
                      key={order.id}
                      style={{
                        borderBottom:
                          '1px solid var(--border-color)',
                      }}
                    >
                      <td style={{ padding: '12px 10px' }}>
                        #{order.order_number}
                      </td>

                      <td style={{ padding: '12px 10px' }}>
                        {order.customer_name}
                      </td>

                      <td
                        style={{
                          padding: '12px 10px',
                          fontWeight: 700,
                        }}
                      >
                        $
                        {Number(
                          order.total_amount || 0
                        ).toFixed(2)}
                      </td>

                      <td style={{ padding: '12px 10px' }}>
                        <span
                          className={`badge ${
                            order.payment_status ===
                            'paid'
                              ? 'badge-success'
                              : 'badge-warning'
                          }`}
                        >
                          {order.payment_status}
                        </span>
                      </td>

                      <td style={{ padding: '12px 10px' }}>
                        {order.order_status}
                      </td>

                      <td
                        style={{
                          padding: '12px 10px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {order.created_at
                          ? new Date(
                              order.created_at
                            ).toLocaleDateString()
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          PRODUCTS
      ===================================================== */}
      {activeTab === 'products' && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <h2 style={{ fontSize: '20px' }}>
              Inventory & Product Catalog
            </h2>

            <button
              onClick={() => {
                resetProductForm();
                setShowProductModal(true);
              }}
              className="btn btn-primary btn-sm"
              id="admin-add-product-btn"
            >
              <Plus size={16} />
              Add New Product
            </button>
          </div>

          {/* =================================================
              PRODUCT FORM
          ================================================= */}
          {showProductModal && (
            <div
              className="card"
              style={{
                padding: '24px',
                marginBottom: '32px',
                background: 'var(--bg-surface)',
              }}
            >
              <h3
                style={{
                  fontSize: '18px',
                  marginBottom: '16px',
                }}
              >
                {editingProductId
                  ? 'Edit Product'
                  : 'Create New Product'}
              </h3>

              <form onSubmit={handleSaveProduct}>
                {/* NAME + BRAND */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '1.2fr 1fr',
                    gap: '16px',
                  }}
                >
                  <div className="form-group">
                    <label className="form-label">
                      Product Name *
                    </label>

                    <input
                      type="text"
                      className="form-control"
                      required
                      value={productForm.name}
                      onChange={(e) =>
                        setProductForm((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      id="product-name-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Brand *
                    </label>

                    <input
                      type="text"
                      className="form-control"
                      required
                      value={productForm.brand}
                      onChange={(e) =>
                        setProductForm((prev) => ({
                          ...prev,
                          brand: e.target.value,
                        }))
                      }
                      id="product-brand-input"
                    />
                  </div>
                </div>

                {/* PRICE / DISCOUNT / STOCK / CATEGORY */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '1fr 1fr 1fr 1fr',
                    gap: '16px',
                  }}
                >
                  <div className="form-group">
                    <label className="form-label">
                      Price ($) *
                    </label>

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control"
                      required
                      value={productForm.price}
                      onChange={(e) =>
                        setProductForm((prev) => ({
                          ...prev,
                          price: e.target.value,
                        }))
                      }
                      id="product-price-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Discount Price ($)
                    </label>

                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control"
                      placeholder="Optional"
                      value={
                        productForm.discount_price
                      }
                      onChange={(e) =>
                        setProductForm((prev) => ({
                          ...prev,
                          discount_price:
                            e.target.value,
                        }))
                      }
                      id="product-discount-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Stock Quantity *
                    </label>

                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      required
                      value={productForm.stock}
                      onChange={(e) =>
                        setProductForm((prev) => ({
                          ...prev,
                          stock: e.target.value,
                        }))
                      }
                      id="product-stock-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Category
                    </label>

                    <select
                      className="form-control"
                      value={productForm.category_id}
                      onChange={(e) =>
                        setProductForm((prev) => ({
                          ...prev,
                          category_id: Number(
                            e.target.value
                          ),
                        }))
                      }
                      id="product-category-input"
                    >
                      {categories.map((category) => (
                        <option
                          key={category.id}
                          value={category.id}
                        >
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* =================================================
                    PRODUCT IMAGE UPLOAD
                    IMPORTANT: NO URL INPUT
                ================================================= */}
                <div className="form-group">
                  <label
                    className="form-label"
                    htmlFor="product-image-input"
                  >
                    Product Image
                  </label>

                  <input
                    type="file"
                    className="form-control"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    onChange={handleProductImageUpload}
                    id="product-image-input"
                  />

                  <div
                    style={{
                      marginTop: '8px',
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Select a product image from your
                    computer.
                    <br />
                    Supported: JPG, JPEG, PNG, WEBP,
                    GIF
                    <br />
                    Maximum size: 5 MB
                  </div>

                  {/* IMAGE PREVIEW */}
                  {productForm.product_image && (
                    <div
                      style={{
                        marginTop: '16px',
                        padding: '16px',
                        border:
                          '1px solid var(--border-color)',
                        borderRadius: '12px',
                        background:
                          'var(--bg-surface)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <img
                        src={productForm.product_image}
                        alt="Product preview"
                        style={{
                          width: '120px',
                          height: '120px',
                          objectFit: 'cover',
                          borderRadius: '10px',
                          border:
                            '1px solid var(--border-color)',
                          display: 'block',
                        }}
                      />

                      <div>
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: 700,
                            marginBottom: '6px',
                          }}
                        >
                          Image Preview
                        </div>

                        <div
                          style={{
                            fontSize: '12px',
                            color:
                              'var(--text-muted)',
                            marginBottom: '12px',
                          }}
                        >
                          Selected product image
                        </div>

                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={
                            handleRemoveProductImage
                          }
                          style={{
                            color: 'var(--danger)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                          id="remove-product-image-btn"
                        >
                          <Trash2 size={14} />
                          Remove Image
                        </button>
                      </div>
                    </div>
                  )}

                  {/* NO IMAGE */}
                  {!productForm.product_image && (
                    <div
                      style={{
                        marginTop: '14px',
                        padding: '18px',
                        border:
                          '1px dashed var(--border-color)',
                        borderRadius: '10px',
                        textAlign: 'center',
                        color:
                          'var(--text-muted)',
                        fontSize: '13px',
                      }}
                    >
                      No product image selected
                    </div>
                  )}
                </div>

                {/* DESCRIPTION */}
                <div className="form-group">
                  <label className="form-label">
                    Description
                  </label>

                  <textarea
                    className="form-control"
                    rows={3}
                    value={productForm.description}
                    onChange={(e) =>
                      setProductForm((prev) => ({
                        ...prev,
                        description:
                          e.target.value,
                      }))
                    }
                    id="product-desc-input"
                  />
                </div>

                {/* BUTTONS */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                  }}
                >
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    id="save-product-submit-btn"
                  >
                    {editingProductId
                      ? 'Update Product'
                      : 'Save Product'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowProductModal(false);
                      resetProductForm();
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* =================================================
              PRODUCTS TABLE
          ================================================= */}
          <div
            className="card"
            style={{ padding: '20px' }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom:
                        '2px solid var(--border-color)',
                      textAlign: 'left',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <th style={{ padding: '10px' }}>
                      Product
                    </th>
                    <th style={{ padding: '10px' }}>
                      Brand
                    </th>
                    <th style={{ padding: '10px' }}>
                      Price
                    </th>
                    <th style={{ padding: '10px' }}>
                      Stock
                    </th>
                    <th
                      style={{
                        padding: '10px',
                        textAlign: 'right',
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {products.map((product) => (
                    <tr
                      key={product.id}
                      style={{
                        borderBottom:
                          '1px solid var(--border-color)',
                      }}
                    >
                      <td
                        style={{
                          padding: '12px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <img
                          src={
                            product.product_image ||
                            'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200&auto=format&fit=crop&q=80'
                          }
                          alt={
                            product.name || 'Product'
                          }
                          onError={(e) => {
                            e.currentTarget.src =
                              'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200&auto=format&fit=crop&q=80';
                          }}
                          style={{
                            width: '40px',
                            height: '40px',
                            objectFit: 'cover',
                            borderRadius:
                              'var(--radius-sm)',
                            border:
                              '1px solid var(--border-color)',
                          }}
                        />

                        <span
                          style={{
                            fontWeight: 600,
                          }}
                        >
                          {product.name}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: '12px 10px',
                        }}
                      >
                        {product.brand}
                      </td>

                      <td
                        style={{
                          padding: '12px 10px',
                          fontWeight: 700,
                        }}
                      >
                        $
                        {Number(
                          product.discount_price ||
                            product.price ||
                            0
                        ).toFixed(2)}
                      </td>

                      <td
                        style={{
                          padding: '12px 10px',
                        }}
                      >
                        {product.stock <= 5 ? (
                          <span className="badge badge-danger">
                            Low: {product.stock}
                          </span>
                        ) : (
                          <span className="badge badge-success">
                            {product.stock} in stock
                          </span>
                        )}
                      </td>

                      <td
                        style={{
                          padding: '12px 10px',
                          textAlign: 'right',
                        }}
                      >
                        <div
                          style={{
                            display: 'inline-flex',
                            gap: '8px',
                          }}
                        >
                          <button
                            onClick={() =>
                              handleEditProductClick(
                                product
                              )
                            }
                            className="btn btn-secondary btn-sm"
                            style={{
                              padding: '4px 8px',
                            }}
                            title="Edit Product"
                          >
                            <Edit size={14} />
                          </button>

                          <button
                            onClick={() =>
                              handleDeleteProduct(
                                product.id
                              )
                            }
                            className="btn btn-secondary btn-sm"
                            style={{
                              padding: '4px 8px',
                              color:
                                'var(--danger)',
                            }}
                            title="Delete Product"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {products.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          padding: '30px',
                          textAlign: 'center',
                          color:
                            'var(--text-muted)',
                        }}
                      >
                        No products found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          ORDERS
      ===================================================== */}
      {activeTab === 'orders' && (
        <div
          className="card"
          style={{ padding: '24px' }}
        >
          <h2
            style={{
              fontSize: '20px',
              marginBottom: '20px',
            }}
          >
            Customer Orders Lifecycle
          </h2>

          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom:
                      '2px solid var(--border-color)',
                    textAlign: 'left',
                    color: 'var(--text-muted)',
                  }}
                >
                  <th style={{ padding: '10px' }}>
                    Order #
                  </th>
                  <th style={{ padding: '10px' }}>
                    Customer
                  </th>
                  <th style={{ padding: '10px' }}>
                    Items
                  </th>
                  <th style={{ padding: '10px' }}>
                    Total Amount
                  </th>
                  <th style={{ padding: '10px' }}>
                    Payment
                  </th>
                  <th style={{ padding: '10px' }}>
                    Current Status
                  </th>
                  <th style={{ padding: '10px' }}>
                    Change Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    style={{
                      borderBottom:
                        '1px solid var(--border-color)',
                    }}
                  >
                    <td
                      style={{
                        padding: '12px 10px',
                        fontWeight: 700,
                      }}
                    >
                      #{order.order_number}
                    </td>

                    <td
                      style={{
                        padding: '12px 10px',
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>
                        {order.customer_name}
                      </div>

                      <div
                        style={{
                          fontSize: '11px',
                          color:
                            'var(--text-muted)',
                        }}
                      >
                        {order.customer_email}
                      </div>
                    </td>

                    <td
                      style={{
                        padding: '12px 10px',
                      }}
                    >
                      {order.item_count} item(s)
                    </td>

                    <td
                      style={{
                        padding: '12px 10px',
                        fontWeight: 800,
                      }}
                    >
                      $
                      {Number(
                        order.total_amount || 0
                      ).toFixed(2)}
                    </td>

                    <td
                      style={{
                        padding: '12px 10px',
                      }}
                    >
                      <span
                        className={`badge ${
                          order.payment_status ===
                          'paid'
                            ? 'badge-success'
                            : 'badge-warning'
                        }`}
                      >
                        {order.payment_status}
                      </span>
                    </td>

                    <td
                      style={{
                        padding: '12px 10px',
                        textTransform: 'capitalize',
                        fontWeight: 600,
                      }}
                    >
                      {order.order_status}
                    </td>

                    <td
                      style={{
                        padding: '12px 10px',
                      }}
                    >
                      <select
                        className="form-control"
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          width: 'auto',
                        }}
                        value={order.order_status}
                        onChange={(e) =>
                          handleUpdateOrderStatus(
                            order.id,
                            e.target.value
                          )
                        }
                      >
                        <option value="pending">
                          Pending
                        </option>
                        <option value="confirmed">
                          Confirmed
                        </option>
                        <option value="shipped">
                          Shipped
                        </option>
                        <option value="delivered">
                          Delivered
                        </option>
                        <option value="cancelled">
                          Cancelled
                        </option>
                      </select>
                    </td>
                  </tr>
                ))}

                {orders.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: '30px',
                        textAlign: 'center',
                        color:
                          'var(--text-muted)',
                      }}
                    >
                      No orders found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================
          USERS
      ===================================================== */}
      {activeTab === 'users' && (
        <div
          className="card"
          style={{ padding: '24px' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: '20px',
                  margin: 0,
                }}
              >
                User Accounts & Roles
              </h2>

              <p
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                  margin: '6px 0 0',
                }}
              >
                {isSuperAdmin
                  ? 'As Super Admin you can create Admin accounts and manage roles.'
                  : 'As Admin you can manage customer accounts. Role changes and Admin creation are restricted to Super Admin.'}
              </p>
            </div>

            {isSuperAdmin && (
              <button
                onClick={() =>
                  setShowAdminModal(true)
                }
                className="btn btn-primary btn-sm"
                id="admin-create-admin-btn"
              >
                <UserPlus size={16} />
                Create Admin
              </button>
            )}
          </div>

          {/* CREATE ADMIN */}
          {isSuperAdmin && showAdminModal && (
            <div
              className="card"
              style={{
                padding: '24px',
                marginBottom: '28px',
                background:
                  'var(--bg-surface)',
              }}
            >
              <h3
                style={{
                  fontSize: '18px',
                  marginBottom: '16px',
                }}
              >
                Create a new Admin account
              </h3>

              <form onSubmit={handleCreateAdmin}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '1fr 1fr',
                    gap: '16px',
                  }}
                >
                  <div className="form-group">
                    <label className="form-label">
                      Full Name *
                    </label>

                    <input
                      type="text"
                      className="form-control"
                      required
                      value={adminForm.fullName}
                      onChange={(e) =>
                        setAdminForm((prev) => ({
                          ...prev,
                          fullName:
                            e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Email *
                    </label>

                    <input
                      type="email"
                      className="form-control"
                      required
                      value={adminForm.email}
                      onChange={(e) =>
                        setAdminForm((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '1fr 1fr',
                    gap: '16px',
                  }}
                >
                  <div className="form-group">
                    <label className="form-label">
                      Password * (min 6 chars)
                    </label>

                    <input
                      type="password"
                      className="form-control"
                      required
                      minLength={6}
                      value={adminForm.password}
                      onChange={(e) =>
                        setAdminForm((prev) => ({
                          ...prev,
                          password:
                            e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Phone
                    </label>

                    <input
                      type="tel"
                      className="form-control"
                      value={adminForm.phone}
                      onChange={(e) =>
                        setAdminForm((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <p
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    margin: '0 0 16px',
                  }}
                >
                  The server assigns the admin role
                  automatically.
                </p>

                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                  }}
                >
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={creatingAdmin}
                  >
                    {creatingAdmin
                      ? 'Creating...'
                      : 'Create Admin'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setShowAdminModal(false)
                    }
                    className="btn btn-secondary btn-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* USERS TABLE */}
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '14px',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom:
                      '2px solid var(--border-color)',
                    textAlign: 'left',
                    color: 'var(--text-muted)',
                  }}
                >
                  <th style={{ padding: '10px' }}>
                    User
                  </th>
                  <th style={{ padding: '10px' }}>
                    Email
                  </th>
                  <th style={{ padding: '10px' }}>
                    Email Verified
                  </th>
                  <th style={{ padding: '10px' }}>
                    Role
                  </th>
                  <th style={{ padding: '10px' }}>
                    Status
                  </th>
                  <th
                    style={{
                      padding: '10px',
                      textAlign: 'right',
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {users.map((item) => {
                  const rowRole = normalizeRole(
                    item.role
                  );

                  const isAdminRow =
                    rowRole === 'admin' ||
                    rowRole === 'super_admin';

                  const isSelf =
                    item.id === user?.id;

                  const canManageRow = isSuperAdmin
                    ? rowRole !== 'super_admin'
                    : !isAdminRow && !isSelf;

                  const currentStatus =
                    normalizeRole(
                      item.status
                    );

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom:
                          '1px solid var(--border-color)',
                      }}
                    >
                      <td
                        style={{
                          padding: '12px 10px',
                          fontWeight: 600,
                        }}
                      >
                        {item.name ||
                          item.full_name ||
                          '-'}

                        {isSelf && (
                          <span
                            className="badge badge-neutral"
                            style={{
                              marginLeft: '8px',
                              fontSize: '10px',
                            }}
                          >
                            You
                          </span>
                        )}
                      </td>

                      <td
                        style={{
                          padding: '12px 10px',
                        }}
                      >
                        {item.email}
                      </td>

                      <td
                        style={{
                          padding: '12px 10px',
                        }}
                      >
                        {item.email_verified ? (
                          <span className="badge badge-success">
                            Verified
                          </span>
                        ) : (
                          <span className="badge badge-warning">
                            Unverified
                          </span>
                        )}
                      </td>

                      <td
                        style={{
                          padding: '12px 10px',
                        }}
                      >
                        <span className="badge badge-primary">
                          {rowRole}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: '12px 10px',
                        }}
                      >
                        <span
                          className={`badge ${
                            currentStatus ===
                            'active'
                              ? 'badge-success'
                              : 'badge-danger'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: '12px 10px',
                          textAlign: 'right',
                        }}
                      >
                        <div
                          style={{
                            display: 'inline-flex',
                            gap: '8px',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            justifyContent:
                              'flex-end',
                          }}
                        >
                          {canManageRow ? (
                            <button
                              onClick={() =>
                                handleUpdateUserStatus(
                                  item.id,
                                  currentStatus ===
                                    'active'
                                    ? 'blocked'
                                    : 'active'
                                )
                              }
                              className="btn btn-secondary btn-sm"
                              style={{
                                fontSize: '11px',
                                padding:
                                  '4px 10px',
                                display:
                                  'inline-flex',
                                alignItems:
                                  'center',
                                gap: '5px',
                              }}
                            >
                              {currentStatus ===
                              'active' ? (
                                <>
                                  <UserX size={12} />
                                  Block
                                </>
                              ) : (
                                <>
                                  <UserCheck
                                    size={12}
                                  />
                                  Activate
                                </>
                              )}
                            </button>
                          ) : (
                            <span
                              style={{
                                fontSize: '11px',
                                color:
                                  'var(--text-muted)',
                              }}
                            >
                              {rowRole ===
                              'super_admin'
                                ? 'Protected'
                                : 'Super Admin only'}
                            </span>
                          )}

                          {isSuperAdmin &&
                            rowRole !==
                              'super_admin' && (
                              <button
                                onClick={() =>
                                  handleChangeUserRole(
                                    item.id,
                                    rowRole,
                                    rowRole ===
                                      'admin'
                                      ? 'customer'
                                      : 'admin'
                                  )
                                }
                                className="btn btn-secondary btn-sm"
                                style={{
                                  fontSize: '11px',
                                  padding:
                                    '4px 10px',
                                }}
                              >
                                {rowRole ===
                                'admin'
                                  ? 'Demote to Customer'
                                  : 'Promote to Admin'}
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: '30px',
                        textAlign: 'center',
                        color:
                          'var(--text-muted)',
                      }}
                    >
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboardPage;