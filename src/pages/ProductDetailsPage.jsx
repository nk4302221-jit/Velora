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
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  ImageOff,
} from 'lucide-react';

import api from '../api/client';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ProductCard } from '../components/ProductCard';
import { formatINR } from '../utils/currency';
import './ProductDetailsPage.css';

// =========================================================
// IMAGE GALLERY HELPERS
//
// The API may expose a single image column, several image
// fields, or an array of images/objects. Everything below
// is defensive so no shape of data can break the page.
// =========================================================
const PLACEHOLDER_IMAGE = '/placeholder-product.png';

const IMAGE_URL_KEYS = [
  'url',
  'image_url',
  'imageUrl',
  'src',
  'product_image',
  'image',
  'thumbnail',
  'thumbnail_url',
  'path',
  'link',
];

const normalizeImageUrl = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

// Pulls a usable URL out of a string, an object such as
// { url } / { image_url }, or a nested combination of both.
const extractImageUrl = (value, depth = 0) => {
  if (
    value === null ||
    value === undefined ||
    depth > 3
  ) {
    return '';
  }

  if (typeof value === 'string') {
    return normalizeImageUrl(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractImageUrl(item, depth + 1);

      if (found) return found;
    }

    return '';
  }

  if (typeof value === 'object') {
    for (const key of IMAGE_URL_KEYS) {
      const found = extractImageUrl(
        value[key],
        depth + 1
      );

      if (found) return found;
    }
  }

  return '';
};

// Expands one product image field into a list of URLs.
// Also understands a JSON array string or a comma
// separated list stored inside a single text column.
const expandImageValue = (value) => {
  const list = [];

  const push = (entry) => {
    const url = extractImageUrl(entry);

    if (url) list.push(url);
  };

  if (Array.isArray(value)) {
    value.forEach(push);
    return list;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) return list;

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);

        if (Array.isArray(parsed)) {
          parsed.forEach(push);
          return list;
        }
      } catch {
        /* not JSON, handled by the checks below */
      }
    }

    if (trimmed.includes(',')) {
      trimmed.split(',').forEach(push);
      return list;
    }

    push(trimmed);
    return list;
  }

  push(value);

  return list;
};

// Ordered, de-duplicated gallery for the current product.
const collectProductImages = (product) => {
  if (!product) {
    return [PLACEHOLDER_IMAGE];
  }

  const candidates = [
    product.images,
    product.product_images,
    product.gallery,
    product.image_gallery,
    product.product_image,
    product.image_url,
    product.image,
    product.thumbnail,
    product.thumbnail_url,
  ];

  const seen = new Set();
  const images = [];

  for (const candidate of candidates) {
    for (const url of expandImageValue(candidate)) {
      if (seen.has(url)) continue;

      seen.add(url);
      images.push(url);
    }
  }

  return images.length > 0 ? images : [PLACEHOLDER_IMAGE];
};

// Navigation always wraps around the gallery.
const wrapIndex = (index, total) => {
  if (!total || total < 1) return 0;

  return ((index % total) + total) % total;
};

// =========================================================
// PRODUCT IMAGE
//
// A failing image is retried once with the shared
// placeholder and then degrades to a neutral tile, so a
// broken source never renders a broken-image icon.
// =========================================================
const ProductImage = ({
  src,
  alt,
  className,
  loading,
}) => {
  const [fallbackStage, setFallbackStage] =
    useState(0);

  useEffect(() => {
    setFallbackStage(0);
  }, [src]);

  const handleError = (event) => {
    const failedSrc = event?.currentTarget?.getAttribute('src');

    // Re-requesting the same failing source would never fire a
    // second error event, so a failing placeholder goes
    // straight to the neutral tile.
    setFallbackStage((previous) =>
      previous === 0 && failedSrc !== PLACEHOLDER_IMAGE
        ? 1
        : 2
    );
  };

  if (fallbackStage === 2) {
    return (
      <div
        className={`velora-pdp-img-fallback ${
          className || ''
        }`}
        aria-hidden="true"
      >
        <ImageOff size={30} />

        <span>Image unavailable</span>
      </div>
    );
  }

  return (
    <img
      src={
        fallbackStage === 1
          ? PLACEHOLDER_IMAGE
          : src
      }
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={handleError}
    />
  );
};

// =========================================================
// GALLERY THUMBNAILS
// =========================================================
const ProductThumbs = ({
  images,
  activeIndex,
  productName,
  onSelect,
  className,
}) => (
  <div
    className={`velora-pdp-thumbs ${
      className || ''
    }`}
    role="group"
    aria-label="Product image thumbnails"
  >
    {images.map((image, index) => (
      <button
        key={`${image}-${index}`}
        type="button"
        className={`velora-pdp-thumb ${
          index === activeIndex ? 'is-active' : ''
        }`}
        aria-label={`View image ${index + 1} of ${
          images.length
        }`}
        aria-current={
          index === activeIndex ? 'true' : undefined
        }
        onClick={() => onSelect(index)}
      >
        <ProductImage
          src={image}
          alt={`${productName || 'Product'} image ${
            index + 1
          }`}
          className="velora-pdp-thumb-img"
          loading="lazy"
        />
      </button>
    ))}
  </div>
);

// =========================================================
// MAIN GALLERY
// =========================================================
const ProductGallery = ({
  images,
  activeIndex,
  productName,
  discountPercentage,
  isOutOfStock,
  onSelect,
  onPrevious,
  onNext,
  onOpenPreview,
}) => {
  const hasMultiple = images.length > 1;

  return (
    <div>
      <div className="velora-pdp-stage">
        <button
          type="button"
          className="velora-pdp-main-btn"
          aria-label={`Open a larger preview of ${
            productName || 'this product'
          }`}
          onClick={onOpenPreview}
        >
          <ProductImage
            src={images[activeIndex]}
            alt={productName || 'Product'}
            className="velora-pdp-main-img"
          />
        </button>

        {discountPercentage > 0 && (
          <div className="velora-pdp-stage-badge">
            {discountPercentage}% OFF
          </div>
        )}

        {isOutOfStock && (
          <div className="velora-pdp-stage-soldout">
            Out of Stock
          </div>
        )}

        {hasMultiple && (
          <>
            <button
              type="button"
              className="velora-pdp-nav velora-pdp-nav-prev"
              aria-label="Previous image"
              onClick={onPrevious}
            >
              <ChevronLeft size={20} />
            </button>

            <button
              type="button"
              className="velora-pdp-nav velora-pdp-nav-next"
              aria-label="Next image"
              onClick={onNext}
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        <span className="velora-pdp-zoom-hint">
          <ZoomIn size={14} />
          Click to zoom
        </span>
      </div>

      {hasMultiple && (
        <ProductThumbs
          images={images}
          activeIndex={activeIndex}
          productName={productName}
          onSelect={onSelect}
        />
      )}
    </div>
  );
};

// =========================================================
// LARGE IMAGE PREVIEW
// =========================================================
const ImagePreviewModal = ({
  images,
  activeIndex,
  productName,
  onClose,
  onSelect,
  onPrevious,
  onNext,
}) => {
  const hasMultiple = images.length > 1;

  // Only a click on the empty backdrop / panel padding
  // closes the preview, never a click on the image,
  // a thumbnail or a control inside it.
  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${productName || 'Product'} image preview`}
      onClick={handleBackdropClick}
    >
      <div
        className="velora-pdp-lightbox"
        onClick={handleBackdropClick}
      >
        <div className="velora-pdp-lightbox-header">
          <div>
            <div className="velora-pdp-lightbox-title">
              {productName || 'Product'}
            </div>

            {hasMultiple && (
              <div className="velora-pdp-lightbox-counter">
                Image {activeIndex + 1} of{' '}
                {images.length}
              </div>
            )}
          </div>

          <button
            type="button"
            className="velora-pdp-lightbox-close"
            aria-label="Close image preview"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div
          className="velora-pdp-lightbox-body"
          onClick={handleBackdropClick}
        >
          <ProductImage
            src={images[activeIndex]}
            alt={
              productName
                ? `${productName} preview`
                : 'Product preview'
            }
            className="velora-pdp-lightbox-img"
          />

          {hasMultiple && (
            <>
              <button
                type="button"
                className="velora-pdp-lightbox-nav velora-pdp-lightbox-nav-prev"
                aria-label="Previous image"
                onClick={onPrevious}
              >
                <ChevronLeft size={20} />
              </button>

              <button
                type="button"
                className="velora-pdp-lightbox-nav velora-pdp-lightbox-nav-next"
                aria-label="Next image"
                onClick={onNext}
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
        </div>

        {hasMultiple && (
          <ProductThumbs
            images={images}
            activeIndex={activeIndex}
            productName={productName}
            onSelect={onSelect}
            className="velora-pdp-lightbox-thumbs"
          />
        )}
      </div>
    </div>
  );
};

export const ProductDetailsPage = () => {
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
  // IMAGE GALLERY STATE
  // =========================================================
  const [activeImageIndex, setActiveImageIndex] =
    useState(0);
  const [isPreviewOpen, setIsPreviewOpen] =
    useState(false);

  const galleryImages = collectProductImages(product);

  const galleryLength = galleryImages.length;

  // Reset the gallery whenever a different product loads.
  useEffect(() => {
    setActiveImageIndex(0);
    setIsPreviewOpen(false);
  }, [product?.id, galleryLength]);

  // =========================================================
  // IMAGE PREVIEW: ESC CLOSE, ARROW NAVIGATION, SCROLL LOCK
  // =========================================================
  useEffect(() => {
    if (!isPreviewOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsPreviewOpen(false);
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveImageIndex((previous) =>
          wrapIndex(previous - 1, galleryLength)
        );
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveImageIndex((previous) =>
          wrapIndex(previous + 1, galleryLength)
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [isPreviewOpen, galleryLength]);

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

    // The list endpoint returns { success, products, pagination }.
    const toProductList = (data) => {
      const list =
        data?.products ||
        data?.data?.products ||
        data?.data;

      return Array.isArray(list) ? list : [];
    };

    const fetchRelatedProducts = async () => {
      try {
        setRelatedLoading(true);

        const currentCategory =
          product.category_name || product.category || '';

        const params = { limit: 8, page: 1 };

        if (currentCategory) {
          params.category = currentCategory;
        }

        const res = await api.get('/products', { params });

        if (!mounted) return;

        // Same-category products first (the preferred source),
        // always excluding the product currently being viewed.
        const sameCategory = toProductList(res.data).filter(
          (item) => String(item.id) !== String(product.id)
        );

        let related = sameCategory;

        // Categories in this catalog hold only a few products, which
        // would leave an almost-empty row. Top up with other real
        // products so the grid is populated; same-category items stay
        // first so the preference is preserved.
        if (sameCategory.length < 4) {
          const allRes = await api.get('/products', {
            params: { limit: 100, page: 1 },
          });

          if (!mounted) return;

          const seen = new Set(
            sameCategory.map((item) => String(item.id))
          );

          seen.add(String(product.id));

          const extras = toProductList(allRes.data).filter(
            (item) => !seen.has(String(item.id))
          );

          related = [...sameCategory, ...extras];
        }

        setRelatedProducts(related.slice(0, 8));
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
        className="site-wrapper"
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
        className="site-wrapper"
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

  const isLowStock = !isOutOfStock && stock <= 5;

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
      product.rating_count ||
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

  const formatPrice = (value) => formatINR(value);

  // =========================================================
  // SPECIFICATIONS
  //
  // The catalog exposes structured columns rather than a spec
  // blob, so the table is assembled from those columns and any
  // optional specifications/specs/attributes payload the API
  // may add later.
  // =========================================================
  const specifications = (() => {
    const rows = [];

    const add = (label, value, className) => {
      if (value === null || value === undefined) return;

      const text = String(value).trim();

      if (!text) return;

      rows.push({
        label,
        value: text,
        className: className || '',
      });
    };

    const raw =
      product.specifications ||
      product.specs ||
      product.attributes;

    const addFromObject = (source) => {
      Object.entries(source).forEach(([key, value]) => {
        if (value === null || value === undefined) return;

        if (typeof value === 'object') return;

        const label = key
          .replace(/[_-]+/g, ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase());

        add(label, value);
      });
    };

    if (Array.isArray(raw)) {
      raw.forEach((entry) => {
        if (entry && typeof entry === 'object') {
          add(
            entry.label || entry.name || entry.key,
            entry.value
          );
        } else {
          add('Detail', entry);
        }
      });
    } else if (raw && typeof raw === 'object') {
      addFromObject(raw);
    } else if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);

        if (parsed && typeof parsed === 'object') {
          addFromObject(parsed);
        } else {
          add('Specifications', raw);
        }
      } catch {
        add('Specifications', raw);
      }
    }

    add('Brand', brandName);
    add('Category', categoryName);
    add(
      'Item Code',
      product.sku || product.item_code || product.id
    );
    add('Rating', rating > 0 ? `${rating.toFixed(1)} / 5` : '');

    add(
      'Availability',
      isOutOfStock
        ? 'Out of Stock'
        : `In Stock (${stock} available)`,
      isOutOfStock
        ? 'velora-pdp-spec-outstock'
        : 'velora-pdp-spec-instock'
    );

    return rows;
  })();

  // Guard against a stale index if the image list shrinks.
  const selectedImageIndex = wrapIndex(
    activeImageIndex,
    galleryLength
  );

  // =========================================================
  // IMAGE GALLERY HANDLERS
  // =========================================================
  const moveImage = (direction) => {
    setActiveImageIndex((previous) =>
      wrapIndex(previous + direction, galleryLength)
    );
  };

  const showPreviousImage = () => moveImage(-1);

  const showNextImage = () => moveImage(1);

  const selectImage = (index) => {
    setActiveImageIndex(wrapIndex(index, galleryLength));
  };

  const openImagePreview = () => setIsPreviewOpen(true);

  const closeImagePreview = () => setIsPreviewOpen(false);

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

      await addToCart(productId, quantity);

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
      await addToCart(productId, quantity);

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
      await toggleWishlist(productId);
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
    <div className="velora-pdp site-wrapper">
      {/* =====================================================
          BACK BUTTON
      ====================================================== */}
      <button
        type="button"
        onClick={handleBack}
        className="btn btn-secondary btn-sm velora-pdp-back"
      >
        <ArrowLeft size={17} />
        Back to Products
      </button>

      {/* =====================================================
          BREADCRUMB
      ====================================================== */}
      <div className="velora-pdp-breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to="/products">Products</Link>
        <span>/</span>
        <span className="velora-pdp-breadcrumb-current">
          {product.name}
        </span>
      </div>

      {/* =====================================================
          MAIN PRODUCT SECTION - IMAGE LEFT, DETAILS RIGHT
      ====================================================== */}
      <div className="velora-pdp-layout">
        {/* ============ LEFT: IMAGE GALLERY ============ */}
        <div className="velora-pdp-gallery-col">
          <ProductGallery
            images={galleryImages}
            activeIndex={selectedImageIndex}
            productName={product.name}
            discountPercentage={discountPercentage}
            isOutOfStock={isOutOfStock}
            onSelect={selectImage}
            onPrevious={showPreviousImage}
            onNext={showNextImage}
            onOpenPreview={openImagePreview}
          />
        </div>

        {/* ============ CENTER: PRODUCT INFO ============ */}
        <div className="velora-pdp-info-col">
          {/* Brand / Category */}
          <div className="velora-pdp-brand-row">
            {brandName && (
              <span className="velora-pdp-brand">
                {brandName}
              </span>
            )}

            <span className="velora-pdp-category">
              {categoryName}
            </span>
          </div>

          {/* Product Name */}
          <h1 className="velora-pdp-title">
            {product.name}
          </h1>

          {/* Rating */}
          <div className="velora-pdp-rating">
            <span className="velora-pdp-rating-badge">
              <Star size={15} fill="currentColor" />
              {rating.toFixed(1)}
            </span>

            <span className="velora-pdp-rating-count">
              {reviewCount}{' '}
              {reviewCount === 1 ? 'rating' : 'ratings'}
            </span>
          </div>

          <hr className="velora-pdp-divider" />

          {/* Price */}
          <div className="velora-pdp-price-row">
            <span className="velora-pdp-price">
              {formatPrice(currentPrice)}
            </span>

            {discountAmount > 0 && (
              <>
                <span className="velora-pdp-mrp">
                  {formatPrice(originalPrice)}
                </span>

                <span className="velora-pdp-discount-tag">
                  -{discountPercentage}%
                </span>
              </>
            )}
          </div>

          {discountAmount > 0 && (
            <div className="velora-pdp-save">
              You save {formatPrice(discountAmount)}
            </div>
          )}

          <p className="velora-pdp-tax-note">
            Inclusive of all taxes
          </p>

          {/* VIP Membership */}
          {membership && (
            <div className="velora-pdp-vip">
              <Crown
                size={22}
                className="velora-pdp-vip-icon"
              />

              <div>
                <div className="velora-pdp-vip-title">
                  VIP Membership Benefits
                </div>

                <div className="velora-pdp-vip-text">
                  Your membership may provide
                  additional product benefits.
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          {product.description && (
            <section className="velora-pdp-section">
              <h3 className="velora-pdp-section-title">
                About this item
              </h3>

              <p className="velora-pdp-description">
                {product.description}
              </p>
            </section>
          )}

          {/* Specifications */}
          {specifications.length > 0 && (
            <section className="velora-pdp-section">
              <h3 className="velora-pdp-section-title">
                Specifications
              </h3>

              <div className="velora-pdp-specs">
                {specifications.map((spec) => (
                  <div
                    className="velora-pdp-spec-row"
                    key={spec.label}
                  >
                    <span className="velora-pdp-spec-label">
                      {spec.label}
                    </span>

                    <span
                      className={`velora-pdp-spec-value ${spec.className}`}
                    >
                      {spec.value}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Benefits */}
          <div className="velora-pdp-perks">
            <div className="velora-pdp-perk">
              <Truck
                size={20}
                className="velora-pdp-perk-icon"
              />

              <div className="velora-pdp-perk-title">
                Fast Delivery
              </div>

              <div className="velora-pdp-perk-text">
                Quick shipping
              </div>
            </div>

            <div className="velora-pdp-perk">
              <ShieldCheck
                size={20}
                className="velora-pdp-perk-icon"
              />

              <div className="velora-pdp-perk-title">
                Secure
              </div>

              <div className="velora-pdp-perk-text">
                Trusted purchase
              </div>
            </div>

            <div className="velora-pdp-perk">
              <RotateCcw
                size={20}
                className="velora-pdp-perk-icon"
              />

              <div className="velora-pdp-perk-title">
                Easy Returns
              </div>

              <div className="velora-pdp-perk-text">
                Hassle-free returns
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* =====================================================
          PURCHASE ACTIONS
          Placed on their own row directly below the main product
          container. Add to Cart and Buy Now are the exact same
          elements as before - same text, classes, and handlers -
          only their container moved.
      ====================================================== */}
      <section className="velora-pdp-purchase">
        <div className="velora-pdp-purchase-state">
          <div
            className={`velora-pdp-stock ${
              isOutOfStock
                ? 'is-out'
                : isLowStock
                  ? 'is-low'
                  : 'is-in'
            }`}
          >
            {isOutOfStock ? (
              <>
                <AlertCircle size={18} />
                Out of Stock
              </>
            ) : (
              <>
                <Check size={18} />
                {isLowStock
                  ? `Only ${stock} left in stock`
                  : 'In Stock'}
              </>
            )}
          </div>

          {!isOutOfStock && (
            <div className="velora-pdp-qty">
              <span className="velora-pdp-qty-label">
                Quantity
              </span>

              <div className="velora-pdp-qty-control">
                <button
                  type="button"
                  className="velora-pdp-qty-btn"
                  onClick={decreaseQuantity}
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                >
                  <Minus size={17} />
                </button>

                <span className="velora-pdp-qty-value">
                  {quantity}
                </span>

                <button
                  type="button"
                  className="velora-pdp-qty-btn"
                  onClick={increaseQuantity}
                  disabled={
                    stock > 0 && quantity >= stock
                  }
                  aria-label="Increase quantity"
                >
                  <Plus size={17} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="velora-pdp-actions">
          <button
            type="button"
            className={`velora-pdp-add ${
              justAdded ? 'is-added' : ''
            }`}
            onClick={handleAddToCart}
            disabled={isOutOfStock || isAdding}
          >
            <ShoppingCart size={18} />

            {isAdding
              ? 'Adding...'
              : justAdded
                ? 'Added to Cart'
                : 'Add to Cart'}
          </button>

          <button
            type="button"
            className="velora-pdp-buy"
            onClick={handleBuyNow}
            disabled={isOutOfStock}
          >
            Buy Now
          </button>
        </div>

        <button
          type="button"
          className={`velora-pdp-wish ${
            inWishlist ? 'is-active' : ''
          }`}
          onClick={handleWishlist}
          aria-label={
            inWishlist
              ? 'Remove from wishlist'
              : 'Add to wishlist'
          }
        >
          <Heart
            size={18}
            fill={inWishlist ? 'currentColor' : 'none'}
          />

          {inWishlist
            ? 'Added to Wishlist'
            : 'Add to Wishlist'}
        </button>
      </section>

      {/* =====================================================
          RELATED PRODUCTS
      ====================================================== */}
      <section className="velora-pdp-related">
        <div className="velora-pdp-related-head">
          <div>
            <h2 className="velora-pdp-related-title">
              Related Products
            </h2>

            <p className="velora-pdp-related-sub">
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
          <div className="velora-pdp-related-state">
            Loading related products...
          </div>
        ) : relatedProducts.length === 0 ? (
          <div className="card velora-pdp-related-empty">
            No related products found.
          </div>
        ) : (
          <div className="products-grid velora-pdp-related-grid">
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

      {/* =====================================================
          LARGE IMAGE PREVIEW
      ====================================================== */}
      {isPreviewOpen && (
        <ImagePreviewModal
          images={galleryImages}
          activeIndex={selectedImageIndex}
          productName={product.name}
          onClose={closeImagePreview}
          onSelect={selectImage}
          onPrevious={showPreviousImage}
          onNext={showNextImage}
        />
      )}
    </div>
  );
};

export default ProductDetailsPage;
