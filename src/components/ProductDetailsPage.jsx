import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Star,
  Heart,
  ShoppingCart,
  ShieldCheck,
  Truck,
  RotateCcw,
  Check,
  AlertCircle,
  ArrowLeft,
  Crown,
  Plus,
  Minus,
} from 'lucide-react';

import api from '../api/client';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ProductCard } from '../components/ProductCard';

const ProductDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { membership } = useAuth();
  const { showToast } = useToast();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const [relatedProducts, setRelatedProducts] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // =========================================================
  // FETCH PRODUCT DETAILS
  // =========================================================
  useEffect(() => {
    let mounted = true;

    const fetchProduct = async () => {
      try {
        setLoading(true);
        setProduct(null);
        setQuantity(1);

        const res = await api.get(`/products/${id}`);

        if (!mounted) return;

        if (res.data?.success) {
          const productData =
            res.data?.data?.product ||
            res.data?.product ||
            res.data?.data;

          setProduct(productData || null);
        } else {
          setProduct(null);
        }
      } catch (error) {
        console.error('Failed to load product details:', error);

        if (mounted) {
          setProduct(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchProduct();

    return () => {
      mounted = false;
    };
  }, [id]);

  // =========================================================
  // FETCH RELATED PRODUCTS
  // =========================================================
  useEffect(() => {
    if (!product) {
      setRelatedProducts([]);
      return;
    }

    let mounted = true;

    const fetchRelatedProducts = async () => {
      try {
        setRelatedLoading(true);

        const params = {
          limit: 8,
          page: 1,
        };

        if (product.category_name) {
          params.category = product.category_name;
        } else if (product.category) {
          params.category = product.category;
        }

        const res = await api.get('/products', {
          params,
        });

        if (!mounted) return;

        if (res.data?.success) {
          const items =
            res.data?.products ||
            res.data?.data?.products ||
            res.data?.data ||
            [];

          const filtered = items
            .filter(
              (item) =>
                String(item.id) !== String(product.id)
            )
            .slice(0, 8);

          setRelatedProducts(filtered);
        } else {
          setRelatedProducts([]);
        }
      } catch (error) {
        console.error(
          'Failed to load related products:',
          error
        );

        if (mounted) {
          setRelatedProducts([]);
        }
      } finally {
        if (mounted) {
          setRelatedLoading(false);
        }
      }
    };

    fetchRelatedProducts();

    return () => {
      mounted = false;
    };
  }, [product]);

  // =========================================================
  // LOADING STATE
  // =========================================================
  if (loading) {
    return (
      <div
        className="container"
        style={{
          padding: '80px 20px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '18px',
            color: 'var(--text-muted)',
          }}
        >
          Loading product details...
        </div>
      </div>
    );
  }

  // =========================================================
  // PRODUCT NOT FOUND
  // =========================================================
  if (!product) {
    return (
      <div
        className="container"
        style={{
          padding: '80px 20px',
          textAlign: 'center',
        }}
      >
        <AlertCircle
          size={48}
          style={{
            marginBottom: '16px',
            opacity: 0.7,
          }}
        />

        <h2 style={{ marginBottom: '10px' }}>
          Product Not Found
        </h2>

        <p
          style={{
            color: 'var(--text-muted)',
            marginBottom: '24px',
          }}
        >
          The product you are looking for does not exist
          or is no longer available.
        </p>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => navigate('/products')}
        >
          <ArrowLeft size={18} />
          Back to Products
        </button>
      </div>
    );
  }

  // =========================================================
  // DERIVED VALUES
  // =========================================================
  const productId = product.id;

  const inWishlist = isInWishlist(productId);

  const stock = Number(product.stock || 0);

  const isOutOfStock = stock <= 0;

  const originalPrice = Number(product.price || 0);

  const discountedPrice = Number(
    product.discount_price || 0
  );

  const currentPrice =
    discountedPrice > 0
      ? discountedPrice
      : originalPrice;

  const discountAmount =
    discountedPrice > 0
      ? originalPrice - discountedPrice
      : 0;

  const discountPercentage =
    originalPrice > 0 && discountAmount > 0
      ? Math.round(
          (discountAmount / originalPrice) * 100
        )
      : 0;

  const rating = Number(
    product.rating ||
      product.average_rating ||
      0
  );

  const reviewCount = Number(
    product.review_count ||
      product.reviews_count ||
      0
  );

  const categoryName =
    product.category_name ||
    product.category ||
    'Product';

  const brandName =
    product.brand_name ||
    product.brand ||
    '';

  const productImage =
    product.image_url ||
    product.image ||
    product.thumbnail ||
    '/placeholder-product.png';

  // =========================================================
  // QUANTITY
  // =========================================================
  const decreaseQuantity = () => {
    setQuantity((previous) =>
      Math.max(1, previous - 1)
    );
  };

  const increaseQuantity = () => {
    setQuantity((previous) => {
      if (stock > 0) {
        return Math.min(previous + 1, stock);
      }

      return previous + 1;
    });
  };

  // =========================================================
  // ADD TO CART
  // =========================================================
  const handleAddToCart = async () => {
    if (isOutOfStock) {
      showToast?.(
        'This product is out of stock.',
        'error'
      );
      return;
    }

    try {
      setIsAdding(true);

      await addToCart(product, quantity);

      setJustAdded(true);

      showToast?.(
        `${product.name || 'Product'} added to cart.`,
        'success'
      );

      setTimeout(() => {
        setJustAdded(false);
      }, 2000);
    } catch (error) {
      console.error(
        'Failed to add product to cart:',
        error
      );

      showToast?.(
        'Failed to add product to cart.',
        'error'
      );
    } finally {
      setIsAdding(false);
    }
  };

  // =========================================================
  // BUY NOW
  // =========================================================
  const handleBuyNow = async () => {
    if (isOutOfStock) {
      showToast?.(
        'This product is out of stock.',
        'error'
      );
      return;
    }

    try {
      await addToCart(product, quantity);

      navigate('/checkout');
    } catch (error) {
      console.error(
        'Failed to process Buy Now:',
        error
      );

      showToast?.(
        'Unable to continue to checkout.',
        'error'
      );
    }
  };

  // =========================================================
  // WISHLIST
  // =========================================================
  const handleWishlist = async () => {
    try {
      await toggleWishlist(product);
    } catch (error) {
      console.error(
        'Wishlist action failed:',
        error
      );

      showToast?.(
        'Unable to update wishlist.',
        'error'
      );
    }
  };

  // =========================================================
  // BACK
  // =========================================================
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/products');
    }
  };

  return (
    <div
      className="container"
      style={{
        paddingTop: '32px',
        paddingBottom: '80px',
      }}
    >
      {/* =====================================================
          BACK BUTTON
      ====================================================== */}
      <button
        type="button"
        onClick={handleBack}
        className="btn btn-secondary btn-sm"
        style={{
          marginBottom: '28px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <ArrowLeft size={17} />
        Back to Products
      </button>

      {/* =====================================================
          BREADCRUMB
      ====================================================== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '28px',
          color: 'var(--text-muted)',
          fontSize: '14px',
        }}
      >
        <Link
          to="/"
          style={{
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          Home
        </Link>

        <span>/</span>

        <Link
          to="/products"
          style={{
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          Products
        </Link>

        <span>/</span>

        <span
          style={{
            color: 'var(--text-color)',
          }}
        >
          {product.name}
        </span>
      </div>

      {/* =====================================================
          PRODUCT DETAILS
      ====================================================== */}
      <div
        className="card"
        style={{
          padding: '32px',
          marginBottom: '56px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(300px, 1fr) minmax(320px, 1fr)',
            gap: '48px',
            alignItems: 'start',
          }}
        >
          {/* =================================================
              PRODUCT IMAGE
          ================================================== */}
          <div>
            <div
              style={{
                position: 'relative',
                borderRadius: '18px',
                overflow: 'hidden',
                background:
                  'var(--bg-secondary, #f8f8f8)',
                minHeight: '420px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={productImage}
                alt={product.name || 'Product'}
                style={{
                  width: '100%',
                  height: '420px',
                  objectFit: 'contain',
                  display: 'block',
                }}
                onError={(event) => {
                  event.currentTarget.src =
                    '/placeholder-product.png';
                }}
              />

              {discountPercentage > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '16px',
                    left: '16px',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    background: 'var(--primary-color)',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 700,
                  }}
                >
                  {discountPercentage}% OFF
                </div>
              )}

              {isOutOfStock && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background:
                      'rgba(0, 0, 0, 0.45)',
                    color: '#fff',
                    fontSize: '20px',
                    fontWeight: 700,
                  }}
                >
                  Out of Stock
                </div>
              )}
            </div>
          </div>

          {/* =================================================
              PRODUCT INFORMATION
          ================================================== */}
          <div>
            {/* Brand / Category */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
                marginBottom: '12px',
              }}
            >
              {brandName && (
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--primary-color)',
                  }}
                >
                  {brandName}
                </span>
              )}

              <span
                style={{
                  fontSize: '14px',
                  color: 'var(--text-muted)',
                }}
              >
                {categoryName}
              </span>
            </div>

            {/* Product Name */}
            <h1
              style={{
                fontSize: '32px',
                lineHeight: 1.25,
                margin: '0 0 16px',
              }}
            >
              {product.name}
            </h1>

            {/* Rating */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '20px',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '6px 10px',
                  borderRadius: '7px',
                  background:
                    'var(--primary-color)',
                  color: '#fff',
                  fontWeight: 700,
                }}
              >
                <Star
                  size={15}
                  fill="currentColor"
                />
                {rating.toFixed(1)}
              </div>

              <span
                style={{
                  color: 'var(--text-muted)',
                  fontSize: '14px',
                }}
              >
                {reviewCount} reviews
              </span>
            </div>

            {/* Price */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                marginBottom: '20px',
              }}
            >
              <span
                style={{
                  fontSize: '32px',
                  fontWeight: 800,
                }}
              >
                ₹{currentPrice.toLocaleString('en-IN')}
              </span>

              {discountAmount > 0 && (
                <>
                  <span
                    style={{
                      textDecoration: 'line-through',
                      color: 'var(--text-muted)',
                      fontSize: '18px',
                    }}
                  >
                    ₹{originalPrice.toLocaleString(
                      'en-IN'
                    )}
                  </span>

                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: 'var(--success-color, #16a34a)',
                    }}
                  >
                    Save ₹
                    {discountAmount.toLocaleString(
                      'en-IN'
                    )}
                  </span>
                </>
              )}
            </div>

            {/* VIP Membership */}
            {membership && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  marginBottom: '20px',
                  border:
                    '1px solid rgba(108, 92, 231, 0.25)',
                  background:
                    'rgba(108, 92, 231, 0.08)',
                }}
              >
                <Crown
                  size={20}
                  style={{
                    color: 'var(--primary-color)',
                  }}
                />

                <div>
                  <strong>
                    VIP Membership Benefits
                  </strong>

                  <div
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-muted)',
                      marginTop: '3px',
                    }}
                  >
                    Your membership may provide
                    additional product benefits.
                  </div>
                </div>
              </div>
            )}

            {/* Stock */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '20px',
                fontSize: '14px',
              }}
            >
              {isOutOfStock ? (
                <>
                  <AlertCircle
                    size={18}
                    style={{
                      color:
                        'var(--danger-color, #dc2626)',
                    }}
                  />

                  <span
                    style={{
                      color:
                        'var(--danger-color, #dc2626)',
                      fontWeight: 600,
                    }}
                  >
                    Out of stock
                  </span>
                </>
              ) : (
                <>
                  <Check
                    size={18}
                    style={{
                      color:
                        'var(--success-color, #16a34a)',
                    }}
                  />

                  <span
                    style={{
                      color:
                        'var(--success-color, #16a34a)',
                      fontWeight: 600,
                    }}
                  >
                    {stock} items available
                  </span>
                </>
              )}
            </div>

            {/* Description */}
            {product.description && (
              <div
                style={{
                  marginBottom: '24px',
                }}
              >
                <h3
                  style={{
                    fontSize: '18px',
                    marginBottom: '10px',
                  }}
                >
                  Description
                </h3>

                <p
                  style={{
                    color: 'var(--text-muted)',
                    lineHeight: 1.7,
                    margin: 0,
                    whiteSpace: 'pre-line',
                  }}
                >
                  {product.description}
                </p>
              </div>
            )}

            {/* Quantity */}
            {!isOutOfStock && (
              <div
                style={{
                  marginBottom: '20px',
                }}
              >
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    marginBottom: '9px',
                  }}
                >
                  Quantity
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    border:
                      '1px solid var(--border-color)',
                    borderRadius: '9px',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={decreaseQuantity}
                    disabled={quantity <= 1}
                    style={{
                      width: '42px',
                      height: '42px',
                      border: 0,
                      background: 'transparent',
                      cursor:
                        quantity <= 1
                          ? 'not-allowed'
                          : 'pointer',
                      opacity:
                        quantity <= 1 ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Minus size={17} />
                  </button>

                  <span
                    style={{
                      width: '45px',
                      textAlign: 'center',
                      fontWeight: 700,
                    }}
                  >
                    {quantity}
                  </span>

                  <button
                    type="button"
                    onClick={increaseQuantity}
                    disabled={
                      stock > 0 &&
                      quantity >= stock
                    }
                    style={{
                      width: '42px',
                      height: '42px',
                      border: 0,
                      background: 'transparent',
                      cursor:
                        stock > 0 &&
                        quantity >= stock
                          ? 'not-allowed'
                          : 'pointer',
                      opacity:
                        stock > 0 &&
                        quantity >= stock
                          ? 0.5
                          : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Plus size={17} />
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                marginBottom: '28px',
              }}
            >
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAddToCart}
                disabled={
                  isOutOfStock || isAdding
                }
                style={{
                  flex: '1 1 180px',
                  minHeight: '48px',
                }}
              >
                <ShoppingCart size={19} />

                {isAdding
                  ? 'Adding...'
                  : justAdded
                    ? 'Added to Cart'
                    : 'Add to Cart'}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBuyNow}
                disabled={isOutOfStock}
                style={{
                  flex: '1 1 140px',
                  minHeight: '48px',
                }}
              >
                Buy Now
              </button>

              <button
                type="button"
                onClick={handleWishlist}
                aria-label={
                  inWishlist
                    ? 'Remove from wishlist'
                    : 'Add to wishlist'
                }
                className="btn btn-secondary"
                style={{
                  width: '50px',
                  minHeight: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Heart
                  size={20}
                  fill={
                    inWishlist
                      ? 'currentColor'
                      : 'none'
                  }
                />
              </button>
            </div>

            {/* Benefits */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(3, minmax(0, 1fr))',
                gap: '12px',
              }}
            >
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background:
                    'var(--bg-secondary, #f8f8f8)',
                }}
              >
                <Truck
                  size={20}
                  style={{
                    marginBottom: '8px',
                  }}
                />

                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '13px',
                  }}
                >
                  Fast Delivery
                </div>

                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    marginTop: '3px',
                  }}
                >
                  Quick shipping
                </div>
              </div>

              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background:
                    'var(--bg-secondary, #f8f8f8)',
                }}
              >
                <ShieldCheck
                  size={20}
                  style={{
                    marginBottom: '8px',
                  }}
                />

                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '13px',
                  }}
                >
                  Secure
                </div>

                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    marginTop: '3px',
                  }}
                >
                  Trusted purchase
                </div>
              </div>

              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background:
                    'var(--bg-secondary, #f8f8f8)',
                }}
              >
                <RotateCcw
                  size={20}
                  style={{
                    marginBottom: '8px',
                  }}
                />

                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '13px',
                  }}
                >
                  Easy Returns
                </div>

                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    marginTop: '3px',
                  }}
                >
                  Hassle-free returns
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          RELATED PRODUCTS
      ====================================================== */}
      <section
        id="related-products-section"
        style={{
          marginTop: '56px',
          paddingTop: '32px',
          borderTop:
            '1px solid var(--border-color)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2
              style={{
                fontSize: '24px',
                marginBottom: '6px',
              }}
            >
              Related Products
            </h2>

            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '14px',
                margin: 0,
              }}
            >
              Similar products you may like
            </p>
          </div>

          <Link
            to={`/products?category=${encodeURIComponent(
              categoryName
            )}`}
            className="btn btn-secondary btn-sm"
          >
            View More
          </Link>
        </div>

        {relatedLoading ? (
          <div
            style={{
              textAlign: 'center',
              padding: '50px 0',
              color: 'var(--text-muted)',
            }}
          >
            Loading related products...
          </div>
        ) : relatedProducts.length === 0 ? (
          <div
            className="card"
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            No related products found.
          </div>
        ) : (
          <div className="products-grid">
            {relatedProducts.map(
              (relatedProduct) => (
                <ProductCard
                  key={relatedProduct.id}
                  product={relatedProduct}
                />
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
};

import ProductDetailsPage from './pages/ProductDetailsPage';