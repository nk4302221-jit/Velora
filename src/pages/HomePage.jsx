import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Sparkles,
  Crown,
  TrendingUp,
  Headphones,
  Laptop,
  Watch,
  Camera,
  Layers,
  ChevronRight,
} from 'lucide-react';
import api from '../api/client';
import { ProductCard } from '../components/ProductCard';

export const HomePage = () => {
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [popularProducts, setPopularProducts] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadHomeProducts() {
      try {
        setLoading(true);

        // The three shelves are independent requests. They used to be awaited
        // one after another, so the last section could not paint until two
        // extra round trips had finished. Firing them together cuts the
        // critical path from three sequential requests to one.
        //
        // allSettled (not all) keeps the original behaviour: each shelf is
        // applied from its own successful response, and one failing endpoint
        // no longer prevents the other two from rendering.
        const [featuredRes, popularRes, newRes] = await Promise.allSettled([
          api.get('/products?limit=4&sort=rating'),
          api.get('/products?limit=4&sort=popular'),
          api.get('/products?limit=4&sort=newest'),
        ]);

        if (cancelled) return;

        if (featuredRes.status === 'fulfilled' && featuredRes.value.data.success) {
          setFeaturedProducts(featuredRes.value.data.products);
        }

        if (popularRes.status === 'fulfilled' && popularRes.value.data.success) {
          setPopularProducts(popularRes.value.data.products);
        }

        if (newRes.status === 'fulfilled' && newRes.value.data.success) {
          setNewArrivals(newRes.value.data.products);
        }

        const failed = [featuredRes, popularRes, newRes].filter(
          (r) => r.status === 'rejected'
        );

        if (failed.length > 0) {
          console.error('Failed to load some home products:', failed);
        }
      } catch (err) {
        console.error('Failed to load home products:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadHomeProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const categories = [
    { name: 'Electronics', icon: Laptop, count: '4 Items', color: '#3b82f6', bg: '#eff6ff' },
    { name: 'Audio & Sound', icon: Headphones, count: '3 Items', color: '#10b981', bg: '#ecfdf5' },
    { name: 'Fashion & Apparel', icon: Layers, count: '4 Items', color: '#8b5cf6', bg: '#f5f3ff' },
    { name: 'Fitness & Smart Gear', icon: Watch, count: '4 Items', color: '#f59e0b', bg: '#fef3c7' },
    { name: 'Home & Workspace', icon: Laptop, count: '4 Items', color: '#ec4899', bg: '#fdf2f8' },
    { name: 'Photography & Optic', icon: Camera, count: '3 Items', color: '#0ea5e9', bg: '#f0f9ff' },
  ];

  return (
    <div className="site-wrapper" id="home-page-container">
      {/* Hero Banner */}
      <section className="hero-banner" id="hero-banner">
        <div className="hero-grid">
          <div>
            <div className="hero-tag">
              <Sparkles size={14} /> Next-Gen Technology & Style
            </div>
            <h1 className="hero-title">
              Crafted for Precision.<br />Engineered for Life.
            </h1>
            <p className="hero-desc">
              Discover curated premium electronics, high-fidelity sound systems, and smart tech.
              Upgrade your lifestyle with instant member discounts and priority dispatch.
            </p>
            <div className="hero-actions">
              <Link to="/products" className="btn btn-primary btn-lg" id="hero-shop-btn">
                Shop Collection <ArrowRight size={18} />
              </Link>
              <Link to="/plans" className="btn btn-accent btn-lg" id="hero-vip-btn">
                <Crown size={18} /> Get VIP Savings Pass
              </Link>
            </div>
          </div>

          <div className="hero-image-wrap">
            <img
              src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80"
              alt="Premium Headphones"
              className="hero-img"
              /* Above the fold and the LCP element: fetch it first and decode
                 it off the main thread. Never lazy-load it. */
              fetchPriority="high"
              decoding="async"
            />
          </div>
        </div>
      </section>

      {/* Categories Horizontal Browser */}
      <section style={{ marginBottom: '48px' }} id="categories-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 className="section-title">Explore Categories</h2>
            <p className="section-subtitle">Find precisely what you need across our top departments</p>
          </div>
          <Link to="/products" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', fontWeight: 600, fontSize: '14px' }}>
            Browse All <ChevronRight size={16} />
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          {categories.map((cat, idx) => {
            const Icon = cat.icon;
            return (
              <Link
                key={idx}
                to={`/products?category=${encodeURIComponent(cat.name)}`}
                className="card"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  cursor: 'pointer',
                  border: '1px solid var(--border-color)',
                }}
                id={`cat-card-${cat.name.toLowerCase()}`}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: cat.bg,
                    color: cat.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '12px',
                  }}
                >
                  <Icon size={24} />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{cat.name}</h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{cat.count}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Featured Products */}
      <section style={{ marginBottom: '48px' }} id="featured-products-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={22} color="var(--primary)" /> Featured Products
            </h2>
            <p className="section-subtitle">Handpicked highest-rated items this week</p>
          </div>
          <Link to="/products?sort=rating" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', fontWeight: 600, fontSize: '14px' }}>
            View More <ChevronRight size={16} />
          </Link>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading products...</div>
        ) : (
          <div className="products-grid">
            {featuredProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* Membership Callout Promotional Banner */}
      <section
        style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
          borderRadius: 'var(--radius-lg)',
          padding: '36px',
          color: '#ffffff',
          marginBottom: '56px',
          boxShadow: 'var(--shadow-lg)',
        }}
        id="membership-promo-banner"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px' }}>
          <div>
            <span
              style={{
                background: 'rgba(255,255,255,0.2)',
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '12px',
              }}
            >
              <Crown size={14} color="#fef08a" /> Timed VIP Membership Passes
            </span>
            <h2 style={{ fontSize: '28px', color: '#ffffff', marginBottom: '8px' }}>
              Save Up to 12% on Every Order + Free Shipping
            </h2>
            <p style={{ color: '#e0f2fe', fontSize: '15px', maxWidth: '600px' }}>
              Activate a 1-hour Free Trial, 6-hour Silver Pass ($9.99), or 12-hour Gold VIP Pass ($19.99).
              Discounts are automatically deducted at checkout with automated time tracking!
            </p>
          </div>
          <Link to="/plans" className="btn btn-accent btn-lg" id="explore-plans-btn">
            View Membership Plans <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* Popular Products */}
      <section style={{ marginBottom: '48px' }} id="popular-products-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={22} color="var(--accent)" /> Most Popular
            </h2>
            <p className="section-subtitle">Customer favorites trending in the community</p>
          </div>
          <Link to="/products?sort=popular" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', fontWeight: 600, fontSize: '14px' }}>
            View All <ChevronRight size={16} />
          </Link>
        </div>

        <div className="products-grid">
          {popularProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* New Arrivals */}
      <section style={{ marginBottom: '60px' }} id="new-arrivals-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 className="section-title">New Arrivals</h2>
            <p className="section-subtitle">Just landed in our global warehouse catalog</p>
          </div>
          <Link to="/products?sort=newest" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary)', fontWeight: 600, fontSize: '14px' }}>
            View All <ChevronRight size={16} />
          </Link>
        </div>

        <div className="products-grid">
          {newArrivals.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
};