import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, ChevronRight, Clock, CheckCircle2, Truck, AlertCircle } from 'lucide-react';
import api from '../api/client';

export const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    async function fetchOrders() {
      try {
        setLoading(true);
        const res = await api.get('/orders');
        if (res.data.success) {
          setOrders(res.data.data.orders);
        }
      } catch (err) {
        console.error('Failed to load orders:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, []);

  const filteredOrders = orders.filter((o) => {
    if (filter === 'all') return true;
    return o.order_status === filter;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'confirmed':
        return <span className="badge badge-primary">Confirmed</span>;
      case 'shipped':
        return <span className="badge badge-warning">Shipped</span>;
      case 'delivered':
        return <span className="badge badge-success">Delivered</span>;
      case 'cancelled':
        return <span className="badge badge-danger">Cancelled</span>;
      default:
        return <span className="badge badge-neutral">Pending</span>;
    }
  };

  return (
    <div className="site-wrapper" style={{ margin: '36px auto 80px' }} id="orders-page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>My Orders</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Track, view invoice, and manage your recent purchases
          </p>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {['all', 'confirmed', 'shipped', 'delivered'].map((st) => (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={`btn btn-sm ${filter === st ? 'btn-primary' : 'btn-secondary'}`}
              style={{ textTransform: 'capitalize' }}
              id={`filter-order-${st}`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading your order history...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="card" style={{ padding: '60px 24px', textAlign: 'center' }}>
          <Package size={48} style={{ margin: '0 auto 16px', color: 'var(--text-muted)' }} />
          <h2 style={{ fontSize: '20px', marginBottom: '8px' }}>No Orders Found</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            You haven't placed any orders matching this criteria yet.
          </p>
          <Link to="/products" className="btn btn-primary" style={{ margin: '0 auto' }}>
            Start Shopping
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredOrders.map((ord) => (
            <div
              key={ord.id}
              className="card"
              style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}
              id={`order-card-${ord.id}`}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 800, fontSize: '16px' }}>#{ord.order_number}</span>
                  {getStatusBadge(ord.order_status)}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Placed on {new Date(ord.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })} • {ord.total_items} items
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Deliver to: {ord.shipping_name}, {ord.city}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Amount</div>
                  <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--primary)' }}>
                    ${Number(ord.total_amount).toFixed(2)}
                  </div>
                  <div style={{ fontSize: '11px', color: ord.payment_status === 'paid' ? 'var(--success)' : 'var(--text-light)', fontWeight: 600 }}>
                    {ord.payment_status === 'paid' ? 'Paid via ' + ord.payment_method : 'Payment Pending'}
                  </div>
                </div>

                <Link to={`/orders/${ord.id}`} className="btn btn-secondary btn-sm" id={`view-order-${ord.id}`}>
                  Order Details <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};