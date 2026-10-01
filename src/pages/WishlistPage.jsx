import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, Trash2, ArrowRight } from 'lucide-react';
import { useWishlist } from '../context/WishlistContext';

export const WishlistPage = () => {
  const { items, removeFromWishlist, moveToCart } = useWishlist();

  if (items.length === 0) {
    return (
      <div className="site-wrapper" style={{ margin: '80px auto', maxWidth: '540px', textAlign: 'center' }} id="empty-wishlist-view">
        <div className="card" style={{ padding: '48px 32px' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              background: '#fee2e2',
              color: '#ef4444',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <Heart size={36} />
          </div>
          <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Your Wishlist is Empty</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            Save items you love by tapping the heart icon on any product card or details page.
          </p>
          <Link to="/products" className="btn btn-primary btn-lg" id="browse-from-wishlist-btn">
            Browse Products <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="site-wrapper" style={{ margin: '36px auto 60px' }} id="wishlist-page-container">
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '4px' }}>My Saved Wishlist</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          You have {items.length} saved product(s) ready to transfer to your cart
        </p>
      </div>

      <div className="products-grid">
        {items.map((item) => {
          const isOutOfStock = item.stock <= 0;
          const displayPrice = item.discount_price || item.price;

          return (
            <div key={item.wishlist_item_id} className="product-card" id={`wishlist-card-${item.product_id}`}>
              <div className="product-card-img-wrap">
                <Link to={`/products/${item.product_id}`}>
                  <img src={item.product_image} alt={item.name} className="product-card-img" loading="lazy" decoding="async" />
                </Link>
                <button
                  type="button"
                  className="product-card-wishlist-btn active"
                  onClick={() => removeFromWishlist(item.product_id)}
                  title="Remove from wishlist"
                  id={`remove-wishlist-btn-${item.product_id}`}
                >
                  <Trash2 size={16} color="#ef4444" />
                </button>
              </div>

              <div className="product-card-content">
                <span className="product-card-brand">{item.brand}</span>
                <Link to={`/products/${item.product_id}`} className="product-card-title">
                  {item.name}
                </Link>

                <div className="product-card-footer">
                  <div className="product-card-price-wrap">
                    <span className="product-card-price">${Number(displayPrice).toFixed(2)}</span>
                    {item.discount_price && (
                      <span className="product-card-original-price">${Number(item.price).toFixed(2)}</span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => moveToCart(item.product_id)}
                    disabled={isOutOfStock}
                    id={`move-to-cart-btn-${item.product_id}`}
                  >
                    {isOutOfStock ? (
                      'Out of Stock'
                    ) : (
                      <>
                        <ShoppingCart size={14} /> Move to Cart
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};