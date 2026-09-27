import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { roleLabel, hasPermission } from '../utils/roles';

/**
 * Chrome shared by all three portals (Super Admin console, Admin portal,
 * Customer dashboard).
 *
 * It renders the sidebar from a `navItems` list and filters that list through
 * `hasPermission`, so an Admin never sees a Super-Admin-only entry. This is
 * purely cosmetic: the API re-checks every one of these capabilities, and the
 * route itself is already wrapped in the matching RoleRoute guard.
 */
export const PortalLayout = ({
  portalTitle,
  portalSubtitle,
  accentColor = '#1e3a8a',
  navItems,
  homePath,
  children,
}) => {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Hide entries the signed-in role does not hold.
  const visibleItems = navItems.filter(
    (item) => !item.permission || hasPermission(user?.role, item.permission)
  );

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      // AuthContext.logout() revokes the session server-side first.
      await logout();

      showToast('You have been signed out.', 'success');

      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="admin-layout" data-testid="portal-layout">
      {/* ---------- Sidebar ---------- */}
      <aside
        className="admin-sidebar"
        style={{
          borderRight: `3px solid ${accentColor}`,
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div
            className="badge"
            style={{
              background: accentColor,
              color: '#fff',
              marginBottom: 10,
              display: 'inline-block',
            }}
          >
            {roleLabel(user?.role)}
          </div>

          <h2
            style={{
              color: '#fff',
              fontSize: '17px',
              fontWeight: 800,
              marginBottom: 4,
            }}
          >
            {portalTitle}
          </h2>

          <p style={{ color: '#94a3b8', fontSize: 12 }}>{portalSubtitle}</p>

          <p
            style={{
              color: '#64748b',
              fontSize: 11,
              marginTop: 10,
              wordBreak: 'break-all',
            }}
          >
            {user?.email}
          </p>
        </div>

        <button
          type="button"
          className="admin-nav-link"
          onClick={() => setMobileNavOpen((prev) => !prev)}
          style={{
            background: '#1e293b',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            display: 'none',
          }}
          aria-expanded={mobileNavOpen}
          aria-label="Toggle portal navigation"
        >
          {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
          Menu
        </button>

        <nav
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            marginTop: 8,
          }}
        >
          {visibleItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.to}
                to={item.to}
                end={item.end}
                className="admin-nav-link"
                onClick={() => setMobileNavOpen(false)}
              >
                {Icon ? <Icon size={18} /> : null}
                {item.label}
                {item.badge ? (
                  <span className="nav-badge-count">{item.badge}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div
          style={{
            marginTop: 'auto',
            paddingTop: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <Link
            to="/"
            className="admin-nav-link"
            style={{ fontSize: 13 }}
          >
            <ExternalLink size={16} />
            View Storefront
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="admin-nav-link"
            style={{
              background: 'none',
              border: 'none',
              cursor: loggingOut ? 'not-allowed' : 'pointer',
              color: '#f87171',
              fontSize: 14,
              textAlign: 'left',
            }}
            data-testid="portal-logout-btn"
          >
            <LogOut size={18} />
            {loggingOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* ---------- Content ---------- */}
      <main className="admin-content" style={{ minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
};
