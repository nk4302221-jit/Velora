import React, { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, Search, ChevronLeft, ChevronRight } from 'lucide-react';

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

// Mirrors validOrderStatuses in adminController.updateOrderStatus().
const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

const Orders = () => {
  const { showToast } = useToast();

  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/admin/orders', {
        params: {
          page,
          limit: 20,
          search: search || undefined,
          status: status || undefined,
          paymentStatus: paymentStatus || undefined,
        },
      });

      if (res.data?.success) {
        // Orders are a top-level array, not nested under data.
        setOrders(res.data.orders || []);
        setPagination(res.data.pagination || null);
      } else {
        setError(res.data?.message || 'Could not load orders.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, [page, search, status, paymentStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (order, nextStatus) => {
    if (nextStatus === order.order_status) return;

    setBusyId(order.id);

    try {
      const res = await api.patch(`/admin/orders/${order.id}/status`, {
        orderStatus: nextStatus,
      });

      showToast(
        res.data?.message || `Order marked ${nextStatus}`,
        'success'
      );
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not update the order',
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Fulfilment pipeline across every customer order."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <input
            className="form-control"
            placeholder="Search by customer, email or order ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search orders"
          />
        </div>

        <select
          className="form-control"
          style={{ width: 170 }}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by order status"
        >
          <option value="">All order statuses</option>
          {ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>

        <select
          className="form-control"
          style={{ width: 170 }}
          value={paymentStatus}
          onChange={(e) => {
            setPaymentStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by payment status"
        >
          <option value="">All payment statuses</option>
          {PAYMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>

        <button type="submit" className="btn btn-secondary btn-sm">
          <Search size={15} /> Search
        </button>
      </form>

      {loading ? <LoadingState label="Loading orders..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        orders.length === 0 ? (
          <EmptyState message="No orders match these filters." icon={ShoppingBag} />
        ) : (
          <>
            <div className="table-responsive">
              <table className="table" data-testid="admin-orders-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th style={{ textAlign: 'right' }}>Items</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Payment</th>
                    <th style={{ width: 170 }}>Order Status</th>
                    <th>Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {order.order_number || `#${order.id}`}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {order.payment_method || 'razorpay'}
                        </div>
                      </td>

                      <td style={{ fontSize: 13 }}>
                        <div>{order.customer_name || '-'}</div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {order.customer_email}
                        </div>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        {Number(order.item_count || 0)}
                      </td>

                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {money(order.total_amount)}
                      </td>

                      <td>
                        <StatusBadge status={order.payment_status} />
                      </td>

                      <td>
                        <select
                          className="form-control"
                          value={order.order_status}
                          disabled={busyId === order.id}
                          onChange={(e) => changeStatus(order, e.target.value)}
                          aria-label={`Status for ${order.order_number || order.id}`}
                        >
                          {ORDER_STATUSES.map((value) => (
                            <option key={value} value={value}>
                              {value.charAt(0).toUpperCase() + value.slice(1)}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td
                        style={{
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {order.created_at
                          ? new Date(order.created_at).toLocaleDateString()
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
                  {pagination.total} orders
                </span>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={15} /> Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    aria-label="Next page"
                  >
                    Next <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )
      ) : null}
    </>
  );
};

export const OrdersPage = () => (
  <PortalPage portal="admin">
    <Orders />
  </PortalPage>
);
