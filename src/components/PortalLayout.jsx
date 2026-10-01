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

  // Hide entries the signed-in role does not hold. For an `admin` account this
  // uses the permissions assigned to it in the database, so the sidebar matches
  // exactly what the API will allow.
  const visibleItems = navItems.filter(
    (item) =>
      !item.permission || hasPermission(user?.role, item.permission, user?.permissions)
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
        }}
      >
        <div className="portal-sidebar-head">
          <div
            className="badge"
            style={{
              background: accentColor,
              color: '#fff',
              marginBottom: '10px',
            }}
          >
            {roleLabel(user?.role)}
          </div>

          <h2 className="portal-sidebar-title">
            {portalTitle}
          </h2>

          <p className="portal-sidebar-subtitle">
            {portalSubtitle}
          </p>

          <p className="portal-sidebar-email">
            {user?.email}
          </p>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="admin-nav-link portal-mobile-toggle"
          onClick={() =>
            setMobileNavOpen((prev) => !prev)
          }
          aria-expanded={mobileNavOpen}
          aria-label="Toggle portal navigation"
        >
          {mobileNavOpen ? (
            <X size={18} />
          ) : (
            <Menu size={18} />
          )}

          <span>
            {mobileNavOpen ? 'Close Menu' : 'Menu'}
          </span>
        </button>

        {/* Navigation */}
        <nav
          className={`portal-nav${
            mobileNavOpen ? ' is-open' : ''
          }`}
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

                <span>{item.label}</span>

                {item.badge ? (
                  <span className="nav-badge-count">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="portal-sidebar-foot">
          <Link
            to={homePath || '/'}
            className="admin-nav-link portal-nav-link-sm"
          >
            <ExternalLink size={16} />
            <span>View Storefront</span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="admin-nav-link portal-logout"
            data-testid="portal-logout-btn"
          >
            <LogOut size={18} />

            <span>
              {loggingOut
                ? 'Signing out...'
                : 'Sign Out'}
            </span>
          </button>
        </div>
      </aside>

      {/* ---------- Content ---------- */}
      <main
        className="admin-content"
        style={{ minWidth: 0 }}
      >
        {children}
      </main>
    </div>
  );
};