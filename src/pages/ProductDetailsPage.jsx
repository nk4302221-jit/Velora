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
          IMAGE GALLERY STYLES

          Scoped to this page only, and kept here so the
          gallery can collapse to a single column on mobile
          without touching the global stylesheet.
      ====================================================== */}
      <style>{`
        .velora-pdp-gallery {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 48px;
          align-items: start;
        }

        .velora-pdp-stage {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 420px;
          border-radius: 18px;
          overflow: hidden;
          background: var(--bg-surface, #f1f5f9);
        }

        .velora-pdp-main-btn {
          display: block;
          width: 100%;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: zoom-in;
        }

        .velora-pdp-main-img {
          display: block;
          width: 100%;
          height: 420px;
          object-fit: contain;
        }

        .velora-pdp-stage-badge {
          position: absolute;
          top: 16px;
          left: 16px;
          z-index: 2;
          padding: 7px 12px;
          border-radius: 8px;
          background: var(--primary-color);
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          pointer-events: none;
        }

        .velora-pdp-stage-soldout {
          position: absolute;
          inset: 0;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.45);
          color: #fff;
          font-size: 20px;
          font-weight: 700;
          pointer-events: none;
        }

        .velora-pdp-nav {
          position: absolute;
          top: 50%;
          z-index: 3;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1px solid var(--border-color);
          background: #fff;
          color: var(--text-main, #0f172a);
          box-shadow: var(--shadow-md, 0 4px 6px rgba(0, 0, 0, 0.1));
          transform: translateY(-50%);
          transition: all 0.15s ease;
        }

        .velora-pdp-nav:hover {
          background: var(--primary, #2563eb);
          border-color: var(--primary, #2563eb);
          color: #fff;
        }

        .velora-pdp-nav-prev { left: 12px; }
        .velora-pdp-nav-next { right: 12px; }

        .velora-pdp-zoom-hint {
          position: absolute;
          right: 12px;
          bottom: 12px;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.92);
          color: var(--text-muted, #64748b);
          font-size: 12px;
          font-weight: 600;
          pointer-events: none;
        }

        .velora-pdp-thumbs {
          display: flex;
          gap: 10px;
          margin-top: 14px;
          padding-bottom: 4px;
          overflow-x: auto;
        }

        .velora-pdp-thumb {
          flex: 0 0 auto;
          width: 68px;
          height: 68px;
          padding: 0;
          border: 2px solid var(--border-color);
          border-radius: 10px;
          background: #fff;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .velora-pdp-thumb:hover {
          border-color: var(--border-dark, #cbd5e1);
        }

        .velora-pdp-thumb.is-active {
          border-color: var(--primary, #2563eb);
          box-shadow: 0 0 0 2px var(--primary-light, #eff6ff);
        }

        .velora-pdp-thumb-img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .velora-pdp-lightbox {
          display: flex;
          flex-direction: column;
          width: 100%;
          max-width: 820px;
          max-height: 92vh;
          background: #fff;
          border: 1px solid var(--border-color);
          border-radius: 14px;
          box-shadow: var(--shadow-xl, 0 20px 25px rgba(0, 0, 0, 0.1));
          overflow: hidden;
        }

        .velora-pdp-lightbox-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--border-color);
        }

        .velora-pdp-lightbox-title {
          color: var(--text-main, #0f172a);
          font-size: 15px;
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .velora-pdp-lightbox-counter {
          margin-top: 2px;
          color: var(--text-muted, #64748b);
          font-size: 12px;
        }

        .velora-pdp-lightbox-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border: 1px solid var(--border-color);
          border-radius: 50%;
          background: #fff;
          color: var(--text-muted, #64748b);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .velora-pdp-lightbox-close:hover {
          background: var(--bg-surface, #f1f5f9);
          color: var(--text-main, #0f172a);
        }

        .velora-pdp-lightbox-body {
          position: relative;
          display: flex;
          flex: 1 1 auto;
          align-items: center;
          justify-content: center;
          min-height: 0;
          padding: 20px;
          background: var(--bg-surface, #f1f5f9);
          overflow: hidden;
        }

        .velora-pdp-lightbox-img {
          display: block;
          width: auto;
          max-width: 100%;
          max-height: 60vh;
          object-fit: contain;
        }

        .velora-pdp-lightbox-nav {
          position: absolute;
          top: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border: 1px solid var(--border-color);
          border-radius: 50%;
          background: #fff;
          color: var(--text-main, #0f172a);
          box-shadow: var(--shadow-md, 0 4px 6px rgba(0, 0, 0, 0.1));
          transform: translateY(-50%);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .velora-pdp-lightbox-nav:hover {
          background: var(--primary, #2563eb);
          border-color: var(--primary, #2563eb);
          color: #fff;
        }

        .velora-pdp-lightbox-nav-prev { left: 12px; }
        .velora-pdp-lightbox-nav-next { right: 12px; }

        .velora-pdp-lightbox-thumbs {
          justify-content: center;
          flex-wrap: wrap;
          padding: 12px 16px;
          border-top: 1px solid var(--border-color);
          overflow-x: visible;
        }

        .velora-pdp-img-fallback {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px;
          background: var(--bg-surface, #f1f5f9);
          color: var(--text-muted, #64748b);
          font-size: 12px;
          text-align: center;
          overflow: hidden;
        }

        @media (max-width: 900px) {
          .velora-pdp-gallery {
            grid-template-columns: minmax(0, 1fr);
            gap: 28px;
          }

          .velora-pdp-stage {
            min-height: 0;
          }

          .velora-pdp-main-img {
            height: auto;
            aspect-ratio: 1 / 1;
          }
        }

        @media (max-width: 480px) {
          .velora-pdp-nav { width: 34px; height: 34px; }
          .velora-pdp-thumb { width: 58px; height: 58px; }
          .velora-pdp-zoom-hint { display: none; }
        }
      `}</style>

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
        <div className="velora-pdp-gallery">
          {/* =================================================
              PRODUCT IMAGE GALLERY
          ================================================== */}
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
