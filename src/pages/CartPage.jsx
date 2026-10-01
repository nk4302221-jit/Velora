import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ShoppingBag, ArrowRight, ShieldCheck, Crown } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

export const CartPage = () => {
  const { items, totals, updateQuantity, removeFromCart, clearCart, loading } = useCart();
  const { membership } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="site-wrapper" style={{ padding: '80px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading shopping cart...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="site-wrapper" style={{ margin: '80px auto', maxWidth: '540px', textAlign: 'center' }} id="empty-cart-view">
        <div className="card" style={{ padding: '48px 32px' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <ShoppingBag size={36} />
          </div>
          <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Your Shopping Cart is Empty</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            Looks like you have not added anything to your cart yet. Explore our top electronics and tech gadgets.
          </p>
          <Link to="/products" className="btn btn-primary btn-lg" id="empty-cart-shop-btn">
            Browse Products <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="site-wrapper" style={{ margin: '36px auto 60px' }} id="cart-page-container">
      <div className="page-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>Shopping Cart</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Review your {items.length} selected item(s) before checkout
          </p>
        </div>

        <button
          onClick={clearCart}
          className="btn btn-secondary btn-sm"
          style={{ color: 'var(--danger)' }}
          id="clear-cart-btn"
        >
          <Trash2 size={14} /> Clear Cart
        </button>
      </div>

      <div className="cart-layout">
        {/* Items List */}
        <div className="cart-items-card">
          {items.map((item) => {
            const unitPrice = item.discount_price ? Number(item.discount_price) : Number(item.price);
            const lineTotal = unitPrice * item.quantity;
            const isAtMaxStock = item.quantity >= item.stock;

            return (
              <div key={item.item_id} className="cart-item-row" id={`cart-row-${item.item_id}`}>
                {/* Thumbnail */}
                <Link to={`/products/${item.product_id}`} className="cart-item-thumb-link">
                  <img src={item.product_image} alt={item.name} className="cart-item-thumb" loading="lazy" decoding="async" />
                </Link>

                {/* Details */}
                <div className="cart-item-details">
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>
                    {item.brand}
                  </span>
                  <Link
                    to={`/products/${item.product_id}`}
                    style={{ display: 'block', fontWeight: 600, fontSize: '15px', color: 'var(--text-main)', marginBottom: '4px' }}
                  >
                    {item.name}
                  </Link>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    ${unitPrice.toFixed(2)} each
                    {item.discount_price && (
                      <span style={{ textDecoration: 'line-through', marginLeft: '6px', color: 'var(--text-light)', fontSize: '12px' }}>
                        ${Number(item.price).toFixed(2)}
                      </span>
                    )}
                  </div>
                  {isAtMaxStock && (
                    <span style={{ fontSize: '11px', color: 'var(--danger)', fontWeight: 600 }}>
                      Max stock reached ({item.stock} available)
                    </span>
                  )}
                </div>

                {/* Quantity Controls */}
                <div className="qty-counter">
                  <button
                    type="button"
                    className="qty-btn"
                    onClick={() => updateQuantity(item.item_id, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                    id={`cart-decrease-${item.item_id}`}
                  >
                    -
                  </button>
                  <span className="qty-val">{item.quantity}</span>
                  <button
                    type="button"
                    className="qty-btn"
                    onClick={() => updateQuantity(item.item_id, item.quantity + 1)}
                    disabled={isAtMaxStock}
                    id={`cart-increase-${item.item_id}`}
                  >
                    +
                  </button>
                </div>

                {/* Line Total */}
                <div className="cart-item-total" style={{ fontWeight: 700, fontSize: '16px', minWidth: '80px', textAlign: 'right' }}>
                  ${lineTotal.toFixed(2)}
                </div>

                {/* Delete Button */}
                <button
                  type="button"
                  className="cart-item-remove"
                  onClick={() => removeFromCart(item.item_id)}
                  style={{ color: 'var(--text-light)', padding: '6px' }}
                  title="Remove from cart"
                  id={`cart-remove-${item.item_id}`}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Order Summary Box */}
        <div className="order-summary-box">
          <h2 style={{ fontSize: '20px', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
            Order Summary
          </h2>

          <div className="summary-row">
            <span>Subtotal</span>
            <span>${totals.subtotal.toFixed(2)}</span>
          </div>

          {totals.discount > 0 && (
            <div className="summary-row" style={{ color: 'var(--success)' }}>
              <span>Promotional Savings</span>
              <span>-${totals.discount.toFixed(2)}</span>
            </div>
          )}

          {membership?.active && totals.membershipDiscount > 0 && (
            <div className="summary-row" style={{ color: 'var(--primary)', fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Crown size={14} /> VIP Pass Discount
              </span>
              <span>-${totals.membershipDiscount.toFixed(2)}</span>
            </div>
          )}

          <div className="summary-row">
            <span>Shipping</span>
            <span>{totals.shipping === 0 ? 'FREE' : `$${totals.shipping.toFixed(2)}`}</span>
          </div>

          <div className="summary-row total">
            <span>Estimated Total</span>
            <span style={{ color: 'var(--primary)' }}>${totals.total.toFixed(2)}</span>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '20px' }}
            onClick={() => navigate('/checkout')}
            id="proceed-to-checkout-btn"
          >
            Proceed to Checkout <ArrowRight size={18} />
          </button>

          <div
            style={{
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}
          >
            <ShieldCheck size={16} color="var(--success)" /> Stripe Sandbox 256-Bit Encryption
          </div>
        </div>
      </div>
    </div>
  );
};