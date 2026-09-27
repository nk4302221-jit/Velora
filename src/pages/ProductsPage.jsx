import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Filter,
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';

import api from '../api/client';
import { ProductCard } from '../components/ProductCard';

export const ProductsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // =====================================================
  // QUERY STATE
  // =====================================================
  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || 'all';
  const brand = searchParams.get('brand') || 'all';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const rating = searchParams.get('rating') || '';
  const inStock = searchParams.get('inStock') === 'true';
  const sort = searchParams.get('sort') || 'newest';

  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '12', 10);

  // =====================================================
  // STATE
  // =====================================================
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(search);

  // =====================================================
  // SYNC SEARCH INPUT WITH URL
  // =====================================================
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // =====================================================
  // LOAD CATEGORIES
  // =====================================================
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const res = await api.get('/products/categories');

        if (res.data?.success) {
          setCategories(res.data.data?.categories || []);
        }
      } catch (err) {
        console.error('Failed to load categories:', err);
        setCategories([]);
      }
    };

    loadCategories();
  }, []);

  // =====================================================
  // FETCH PRODUCTS
  // =====================================================
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);

        const params = {
          page,
          limit,
          sort,
        };

        if (search) {
          params.search = search;
        }

        if (category && category !== 'all') {
          params.category = category;
        }

        if (brand && brand !== 'all') {
          params.brand = brand;
        }

        if (minPrice) {
          params.minPrice = minPrice;
        }

        if (maxPrice) {
          params.maxPrice = maxPrice;
        }

        if (rating) {
          params.rating = rating;
        }

        if (inStock) {
          params.inStock = 'true';
        }

        const res = await api.get('/products', { params });

        if (res.data?.success) {
          setProducts(res.data.products || []);

          setTotalPages(
            res.data.pagination?.totalPages || 1
          );

          setTotalProducts(
            res.data.pagination?.total || 0
          );
        } else {
          setProducts([]);
          setTotalPages(1);
          setTotalProducts(0);
        }
      } catch (err) {
        console.error('Failed to load products:', err);

        setProducts([]);
        setTotalPages(1);
        setTotalProducts(0);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [
    search,
    category,
    brand,
    minPrice,
    maxPrice,
    rating,
    inStock,
    sort,
    page,
    limit,
  ]);

  // =====================================================
  // UPDATE URL PARAMETER
  // =====================================================
  const updateParam = (key, value) => {
    const newParams = new URLSearchParams(searchParams);

    if (
      value === null ||
      value === '' ||
      value === 'all'
    ) {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }

    // Reset page when filter changes
    if (key !== 'page') {
      newParams.set('page', '1');
    }

    setSearchParams(newParams);
  };

  // =====================================================
  // SEARCH
  // =====================================================
  const handleSearchSubmit = (e) => {
    e.preventDefault();

    updateParam(
      'search',
      searchInput.trim() || null
    );
  };

  // =====================================================
  // RESET FILTERS
  // =====================================================
  const handleResetFilters = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  };

  // =====================================================
  // BRANDS
  // =====================================================
  const brandsList = [
    'Sony',
    'Apple',
    'Bose',
    'Samsung',
    'Dell',
    'Canon',
    'Logitech',
    'Anker',
  ];

  return (
    <div
      className="site-wrapper"
      style={{ margin: '32px auto' }}
      id="products-page-container"
    >
      {/* =====================================================
          PAGE HEADER
      ===================================================== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '28px',
              marginBottom: '4px',
            }}
          >
            Product Catalog
          </h1>

          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '14px',
            }}
          >
            Showing {products.length} of {totalProducts}{' '}
            verified products
          </p>
        </div>

        {/* SEARCH */}
        <form
          onSubmit={handleSearchSubmit}
          style={{
            display: 'flex',
            gap: '8px',
            maxWidth: '400px',
            width: '100%',
          }}
        >
          <div
            style={{
              position: 'relative',
              flex: 1,
            }}
          >
            <input
              type="text"
              className="form-control"
              placeholder="Search catalog by name or brand..."
              value={searchInput}
              onChange={(e) =>
                setSearchInput(e.target.value)
              }
              id="catalog-search-input"
            />

            <Search
              size={16}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            id="catalog-search-btn"
          >
            Search
          </button>
        </form>
      </div>

      {/* =====================================================
          MAIN CONTENT
      ===================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '260px 1fr',
          gap: '32px',
          alignItems: 'flex-start',
        }}
      >
        {/* =====================================================
            FILTER SIDEBAR
        ===================================================== */}
        <aside
          className="card"
          style={{
            padding: '20px',
            position: 'sticky',
            top: '90px',
          }}
          id="catalog-filter-sidebar"
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
            }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <SlidersHorizontal size={18} />
              Filters
            </span>

            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                fontSize: '12px',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 600,
              }}
              id="reset-filters-btn"
            >
              <RotateCcw size={12} />
              Reset
            </button>
          </div>

          {/* CATEGORY */}
          <div className="form-group">
            <label
              className="form-label"
              htmlFor="category-filter-select"
            >
              Category
            </label>

            <select
              className="form-control"
              value={category}
              onChange={(e) =>
                updateParam(
                  'category',
                  e.target.value
                )
              }
              id="category-filter-select"
            >
              <option value="all">
                All Categories
              </option>

              {categories.map((c) => (
                <option
                  key={c.id}
                  value={c.name}
                >
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* BRAND */}
          <div className="form-group">
            <label
              className="form-label"
              htmlFor="brand-filter-select"
            >
              Brand
            </label>

            <select
              className="form-control"
              value={brand}
              onChange={(e) =>
                updateParam(
                  'brand',
                  e.target.value
                )
              }
              id="brand-filter-select"
            >
              <option value="all">
                All Brands
              </option>

              {brandsList.map((b) => (
                <option
                  key={b}
                  value={b}
                >
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* PRICE RANGE */}
          <div className="form-group">
            <label className="form-label">
              Price Range ($)
            </label>

            <div
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'center',
              }}
            >
              <input
                type="number"
                className="form-control"
                placeholder="Min"
                value={minPrice}
                onChange={(e) =>
                  updateParam(
                    'minPrice',
                    e.target.value
                  )
                }
                style={{ padding: '8px' }}
                id="min-price-input"
                min="0"
              />

              <span
                style={{
                  color: 'var(--text-muted)',
                }}
              >
                -
              </span>

              <input
                type="number"
                className="form-control"
                placeholder="Max"
                value={maxPrice}
                onChange={(e) =>
                  updateParam(
                    'maxPrice',
                    e.target.value
                  )
                }
                style={{ padding: '8px' }}
                id="max-price-input"
                min="0"
              />
            </div>
          </div>

          {/* RATING */}
          <div className="form-group">
            <label
              className="form-label"
              htmlFor="rating-filter-select"
            >
              Minimum Rating
            </label>

            <select
              className="form-control"
              value={rating}
              onChange={(e) =>
                updateParam(
                  'rating',
                  e.target.value
                )
              }
              id="rating-filter-select"
            >
              <option value="">
                Any Rating
              </option>

              <option value="4.5">
                ★ 4.5 & Above
              </option>

              <option value="4.0">
                ★ 4.0 & Above
              </option>

              <option value="3.5">
                ★ 3.5 & Above
              </option>
            </select>
          </div>

          {/* IN STOCK */}
          <div
            style={{
              marginTop: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <input
              type="checkbox"
              id="in-stock-checkbox"
              checked={inStock}
              onChange={(e) =>
                updateParam(
                  'inStock',
                  e.target.checked
                    ? 'true'
                    : null
                )
              }
              style={{
                width: '16px',
                height: '16px',
                cursor: 'pointer',
              }}
            />

            <label
              htmlFor="in-stock-checkbox"
              style={{
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              In Stock Only
            </label>
          </div>
        </aside>

        {/* =====================================================
            PRODUCTS SECTION
        ===================================================== */}
        <main>
          {/* SORTING & LIMIT */}
          <div
            style={{
              background: '#ffffff',
              border:
                '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <span
              style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
              }}
            >
              Page {page} of {totalPages}
            </span>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                flexWrap: 'wrap',
              }}
            >
              {/* SORT */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  Sort by:
                </span>

                <select
                  className="form-control"
                  style={{
                    width: 'auto',
                    padding: '6px 12px',
                    fontSize: '13px',
                  }}
                  value={sort}
                  onChange={(e) =>
                    updateParam(
                      'sort',
                      e.target.value
                    )
                  }
                  id="sort-select"
                >
                  <option value="newest">
                    Newest Arrivals
                  </option>

                  <option value="price-low">
                    Price: Low to High
                  </option>

                  <option value="price-high">
                    Price: High to Low
                  </option>

                  <option value="rating">
                    Highest Rated
                  </option>

                  <option value="popular">
                    Most Popular
                  </option>
                </select>
              </div>

              {/* LIMIT */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  Show:
                </span>

                <select
                  className="form-control"
                  style={{
                    width: 'auto',
                    padding: '6px 12px',
                    fontSize: '13px',
                  }}
                  value={limit}
                  onChange={(e) =>
                    updateParam(
                      'limit',
                      e.target.value
                    )
                  }
                  id="limit-select"
                >
                  <option value="8">8</option>
                  <option value="12">12</option>
                  <option value="24">24</option>
                </select>
              </div>
            </div>
          </div>

          {/* =====================================================
              PRODUCT GRID
          ===================================================== */}
          {loading ? (
            <div
              style={{
                textAlign: 'center',
                padding: '80px 0',
                color: 'var(--text-muted)',
              }}
            >
              Loading products...
            </div>
          ) : products.length === 0 ? (
            <div
              className="card"
              style={{
                textAlign: 'center',
                padding: '60px 20px',
              }}
            >
              <Filter
                size={40}
                style={{
                  margin: '0 auto 16px',
                  color: 'var(--text-muted)',
                }}
              />

              <h3
                style={{
                  fontSize: '20px',
                  marginBottom: '8px',
                }}
              >
                No products match your criteria
              </h3>

              <p
                style={{
                  color: 'var(--text-muted)',
                  marginBottom: '20px',
                }}
              >
                Try adjusting your search terms,
                price boundaries, or clearing
                category filters.
              </p>

              <button
                type="button"
                onClick={handleResetFilters}
                className="btn btn-primary"
                style={{ margin: '0 auto' }}
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <div className="products-grid">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                />
              ))}
            </div>
          )}

          {/* =====================================================
              PAGINATION
          ===================================================== */}
          {totalPages > 1 && (
            <div
              className="pagination-wrap"
              id="catalog-pagination"
            >
              <span
                style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                }}
              >
                Showing page {page} of {totalPages} (
                {totalProducts} total items)
              </span>

              <div className="pagination-pages">
                {/* PREVIOUS */}
                <button
                  type="button"
                  className="page-btn"
                  disabled={page <= 1}
                  onClick={() =>
                    updateParam(
                      'page',
                      String(page - 1)
                    )
                  }
                  title="Previous Page"
                  id="prev-page-btn"
                >
                  <ChevronLeft size={16} />
                </button>

                {/* PAGE NUMBERS */}
                {Array.from(
                  { length: totalPages },
                  (_, index) => index + 1
                ).map((pageNumber) => (
                  <button
                    type="button"
                    key={pageNumber}
                    className={`page-btn ${
                      pageNumber === page
                        ? 'active'
                        : ''
                    }`}
                    onClick={() =>
                      updateParam(
                        'page',
                        String(pageNumber)
                      )
                    }
                    id={`page-btn-${pageNumber}`}
                  >
                    {pageNumber}
                  </button>
                ))}

                {/* NEXT */}
                <button
                  type="button"
                  className="page-btn"
                  disabled={page >= totalPages}
                  onClick={() =>
                    updateParam(
                      'page',
                      String(page + 1)
                    )
                  }
                  title="Next Page"
                  id="next-page-btn"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ProductsPage;