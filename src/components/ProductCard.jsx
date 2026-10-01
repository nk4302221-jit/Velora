import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Heart,
  Star,
  ShoppingCart,
  Check,
} from 'lucide-react';

import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';

export const ProductCard = ({ product }) => {
  const navigate = useNavigate();

  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();

  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  // ---------------------------------------------------------
  // SAFETY
  // ---------------------------------------------------------
  if (!product) {
    return null;
  }

  const productId = product.id;

  const productUrl = `/products/${productId}`;

  const inWishlist = isInWishlist(productId);

  const stock = Number(product.stock || 0);

  const isOutOfStock = stock <= 0;

  const price = Number(product.price || 0);

  const discountPrice = Number(
    product.discount_price || 0
  );

  const discountAmount =
    discountPrice > 0
      ? price - discountPrice
      : 0;

  const displayPrice =
    discountPrice > 0
      ? discountPrice
      : price;

  const rating = Number(product.rating || 0);

  const ratingCount =
    product.rating_count ?? 48;

  const productImage =
    product.product_image ||
    product.image_url ||
    product.image ||
    product.thumbnail ||
    '/placeholder-product.png';

  // ---------------------------------------------------------
  // OPEN PRODUCT DETAILS
  // ---------------------------------------------------------
  const handleCardClick = () => {
    navigate(productUrl);
  };

  // ---------------------------------------------------------
  // KEYBOARD ACCESSIBILITY
  // ---------------------------------------------------------
  const handleCardKeyDown = (event) => {
    if (
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      navigate(productUrl);
    }
  };

  // ---------------------------------------------------------
  // ADD TO CART
  // ---------------------------------------------------------
  const handleAddToCart = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (isOutOfStock || isAdding) {
      return;
    }

    try {
      setIsAdding(true);

      const ok = await addToCart(
        productId,
        1
      );

      if (ok) {
        setJustAdded(true);

        setTimeout(() => {
          setJustAdded(false);
        }, 1800);
      }
    } catch (error) {
      console.error(
        'Failed to add product to cart:',
        error
      );
    } finally {
      setIsAdding(false);
    }
  };

  // ---------------------------------------------------------
  // WISHLIST
  // ---------------------------------------------------------
  const handleWishlistToggle = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      await toggleWishlist(productId);
    } catch (error) {
      console.error(
        'Failed to update wishlist:',
        error
      );
    }
  };

  return (
    <div
      className="product-card"
      id={`product-card-${productId}`}
      role="link"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      style={{
        cursor: 'pointer',
      }}
    >
      {/* =====================================================
          PRODUCT IMAGE
      ====================================================== */}
      <div className="product-card-img-wrap">
        <Link
          to={productUrl}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <img
            src={productImage}
            alt={product.name || 'Product'}
            className="product-card-img"
            loading="lazy"
            decoding="async"
            onError={(event) => {
              event.currentTarget.src =
                '/placeholder-product.png';
            }}
          />
        </Link>

        {/* Discount */}
        {discountAmount > 0 && (
          <span className="product-card-discount-badge">
            Save ${discountAmount.toFixed(0)}
          </span>
        )}

        {/* Wishlist */}
        <button
          type="button"
          className={`product-card-wishlist-btn ${
            inWishlist ? 'active' : ''
          }`}
          onClick={handleWishlistToggle}
          title={
            inWishlist
              ? 'Remove from wishlist'
              : 'Save to wishlist'
          }
          id={`wishlist-btn-${productId}`}
        >
          <Heart
            size={18}
            fill={
              inWishlist
                ? '#ef4444'
                : 'none'
            }
            color={
              inWishlist
                ? '#ef4444'
                : 'currentColor'
            }
          />
        </button>
      </div>

      {/* =====================================================
          PRODUCT CONTENT
      ====================================================== */}
      <div className="product-card-content">
        {/* Brand + Stock */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '4px',
            gap: '8px',
          }}
        >
          <span className="product-card-brand">
            {product.brand}
          </span>

          {isOutOfStock ? (
            <span
              className="badge badge-danger"
              style={{
                fontSize: '10px',
              }}
            >
              Out of Stock
            </span>
          ) : stock <= 5 ? (
            <span
              className="badge badge-warning"
              style={{
                fontSize: '10px',
              }}
            >
              Only {stock} left
            </span>
          ) : (
            <span
              className="badge badge-success"
              style={{
                fontSize: '10px',
              }}
            >
              In Stock
            </span>
          )}
        </div>

        {/* Product Title */}
        <Link
          to={productUrl}
          className="product-card-title"
          title={product.name}
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {product.name}
        </Link>

        {/* ===================================================
            RATING
        ==================================================== */}
        <div className="product-card-rating">
          <Star
            size={14}
            className="star-icon"
          />

          <span
            style={{
              fontWeight: 600,
              color: 'var(--text-main)',
            }}
          >
            {rating.toFixed(1)}
          </span>

          <span>
            ({ratingCount})
          </span>
        </div>

        {/* ===================================================
            FOOTER
        ==================================================== */}
        <div className="product-card-footer">
          {/* Price */}
          <div className="product-card-price-wrap">
            <span className="product-card-price">
              ${displayPrice.toFixed(2)}
            </span>

            {discountPrice > 0 && (
              <span className="product-card-original-price">
                ${price.toFixed(2)}
              </span>
            )}
          </div>

          {/* Add To Cart */}
          <button
            type="button"
            className={`btn btn-sm ${
              justAdded
                ? 'btn-success'
                : 'btn-primary'
            }`}
            onClick={handleAddToCart}
            disabled={
              isOutOfStock || isAdding
            }
            id={`add-to-cart-${productId}`}
          >
            {justAdded ? (
              <>
                <Check size={14} />
                Added
              </>
            ) : isOutOfStock ? (
              'Sold Out'
            ) : isAdding ? (
              'Adding...'
            ) : (
              <>
                <ShoppingCart size={14} />
                Add
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};