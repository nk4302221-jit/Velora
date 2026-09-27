import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  ShoppingCart,
  Heart,
  Search,
  User as UserIcon,
  ShieldCheck,
  Crown,
  LogOut,
  Package,
  MapPin,
  Clock,
  LayoutDashboard,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { BrandLogo } from './BrandLogo';
import {
  isAdminRole,
  isCustomerRole,
  isSuperAdminRole,
  roleHomePath,
  roleLabel,
} from '../utils/roles';

export const Navbar = () => {
  const { user, membership, logout } = useAuth();
  const { cartCount } = useCart();
  const { wishlistCount } = useWishlist();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  // Live countdown timer for active membership plan
  useEffect(() => {
    if (!membership?.active || !membership.membership?.expiry_time) {
      setTimeLeft('');
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const expiry = new Date(membership.membership.expiry_time).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeLeft('Expired');
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [membership]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/products');
    }
  };

  return (
    <header className="navbar" id="site-header">
      {/* Top Banner if Active Membership */}
      {membership?.active && membership.membership && (
        <div
          style={{
            background: 'linear-gradient(90deg, #1e3a8a, #2563eb)',
            color: '#fff',
            fontSize: '12px',
            padding: '6px 20px',
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            fontWeight: 600,
          }}
          id="active-membership-bar"
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Crown size={14} color="#f59e0b" />
            {membership.membership.plan_name} Active
          </span>
          <span
            style={{
              background: 'rgba(255,255,255,0.2)',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontFamily: 'monospace',
              fontSize: '11px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Clock size={11} /> {timeLeft} left
          </span>
          <Link to="/plans" style={{ textDecoration: 'underline', color: '#fef08a' }}>
            Upgrade / Extend
          </Link>
        </div>
      )}

      {/* Main Navbar Top */}
      <div className="navbar-top">
        <div className="site-wrapper">
          <div className="navbar-inner">
            {/* Logo */}
            <Link to="/" className="brand-logo" id="brand-logo-link">
              <BrandLogo size={36} />
            </Link>

            {/* Search Bar */}
            <form className="nav-search" onSubmit={handleSearchSubmit} id="nav-search-form">
              <input
                type="text"
                className="nav-search-input"
                placeholder="Search products, brands, electronics, apparel..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                id="search-input"
              />
              <button type="submit" className="nav-search-btn" title="Search" id="search-submit-btn">
                <Search size={16} />
              </button>
            </form>

            {/* Nav Actions */}
            <div className="nav-actions">
              <Link to="/plans" className="nav-action-btn" id="nav-plans-link" style={{ color: '#d97706', fontWeight: 600 }}>
                <Crown size={18} />
                <span>Plans</span>
              </Link>

              <Link to="/wishlist" className="nav-action-btn" id="nav-wishlist-link" title="Wishlist">
                <Heart size={20} />
                {wishlistCount > 0 && <span className="nav-badge-count" id="wishlist-badge">{wishlistCount}</span>}
              </Link>

              <Link to="/cart" className="nav-action-btn" id="nav-cart-link" title="Cart">
                <ShoppingCart size={20} />
                {cartCount > 0 && <span className="nav-badge-count" id="cart-badge">{cartCount}</span>}
              </Link>

              {/* User Account / Auth Dropdown */}
              {user ? (
                <div style={{ position: 'relative' }}>
                  <button
                    className="nav-action-btn"
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    id="user-menu-btn"
                    style={{ background: 'var(--bg-surface)' }}
                  >
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.name || user.full_name || 'User'}
                        style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <UserIcon size={18} />
                    )}
                    <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(user.name || user.full_name || 'User').split(' ')[0]}
                    </span>
                  </button>

                  {userDropdownOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '100%',
                        marginTop: '8px',
                        background: '#ffffff',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-xl)',
                        width: '220px',
                        zIndex: 1000,
                        padding: '8px 0',
                      }}
                      id="user-dropdown-menu"
                    >
                      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>{user.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {user.email}
                        </div>
                        {isAdminRole(user.role) && (
                          <span className="badge badge-primary" style={{ marginTop: '6px', fontSize: '10px' }}>
                            {roleLabel(user.role)}
                          </span>
                        )}
                      </div>

                      {isAdminRole(user.role) && (
                        <Link
                          to={roleHomePath(user.role) || '/admin'}
                          onClick={() => setUserDropdownOpen(false)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 16px',
                            fontSize: '13px',
                            color: 'var(--primary)',
                            fontWeight: 600,
                          }}
                          id="dropdown-admin-link"
                        >
                          <ShieldCheck size={16} />
                          {isSuperAdminRole(user.role)
                            ? 'Super Admin Console'
                            : 'Admin Portal'}
                        </Link>
                      )}

                      {isCustomerRole(user.role) && (
                        <Link
                          to={roleHomePath(user.role) || '/customer/dashboard'}
                          onClick={() => setUserDropdownOpen(false)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 16px',
                            fontSize: '13px',
                            color: 'var(--primary)',
                            fontWeight: 600,
                          }}
                          id="dropdown-account-link"
                        >
                          <LayoutDashboard size={16} /> My Account
                        </Link>
                      )}

                      <Link
                        to="/profile"
                        onClick={() => setUserDropdownOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 16px',
                          fontSize: '13px',
                          color: 'var(--text-main)',
                        }}
                        id="dropdown-profile-link"
                      >
                        <UserIcon size={16} /> My Profile
                      </Link>

                      <Link
                        to="/orders"
                        onClick={() => setUserDropdownOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 16px',
                          fontSize: '13px',
                          color: 'var(--text-main)',
                        }}
                        id="dropdown-orders-link"
                      >
                        <Package size={16} /> My Orders
                      </Link>

                      <Link
                        to="/profile/addresses"
                        onClick={() => setUserDropdownOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 16px',
                          fontSize: '13px',
                          color: 'var(--text-main)',
                        }}
                        id="dropdown-addresses-link"
                      >
                        <MapPin size={16} /> Addresses
                      </Link>

                      <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />

                      <button
                        onClick={() => {
                          setUserDropdownOpen(false);
                          logout();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 16px',
                          fontSize: '13px',
                          color: 'var(--danger)',
                          width: '100%',
                          textAlign: 'left',
                        }}
                        id="dropdown-logout-btn"
                      >
                        <LogOut size={16} /> Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Link to="/login" className="btn btn-secondary btn-sm" id="nav-login-btn">
                    Sign In
                  </Link>
                  <Link to="/register" className="btn btn-primary btn-sm" id="nav-register-btn">
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Categories Row */}
      <div className="navbar-bottom">
        <div className="site-wrapper">
          <nav className="nav-categories" id="nav-categories-bar">
            <Link to="/products" className="nav-category-link">All Products</Link>
            <Link to={`/products?category=${encodeURIComponent('Electronics')}`} className="nav-category-link">Electronics</Link>
            <Link to={`/products?category=${encodeURIComponent('Audio & Sound')}`} className="nav-category-link">Audio & Sound</Link>
            <Link to={`/products?category=${encodeURIComponent('Fashion & Apparel')}`} className="nav-category-link">Fashion & Apparel</Link>
            <Link to={`/products?category=${encodeURIComponent('Fitness & Smart Gear')}`} className="nav-category-link">Fitness & Smart Gear</Link>
            <Link to={`/products?category=${encodeURIComponent('Home & Workspace')}`} className="nav-category-link">Home & Workspace</Link>
            <Link to={`/products?category=${encodeURIComponent('Photography & Optic')}`} className="nav-category-link">Photography & Optic</Link>
          </nav>
        </div>
      </div>
    </header>
  );
};