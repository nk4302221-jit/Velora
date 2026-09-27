import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { roleLabel } from '../utils/roles';

/**
 * Generic role gate for the VELORA portals.
 *
 * This is a UX affordance only. Every route it protects is independently
 * enforced by the backend (authenticate -> authorizeAdmin/authorizeSuperAdmin/
 * authorizeCustomer), so bypassing this component in the browser gains nothing.
 *
 * `allowedRoles` is matched against the role returned by /api/auth/me, which
 * the backend re-reads from the database on every request - the role is never
 * taken from client storage or a JWT claim.
 */
export const RoleRoute = ({ allowedRoles, children, portalName }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '12px',
          minHeight: '50vh',
        }}
      >
        <Loader2 size={28} className="spin" aria-hidden="true" />
        <div style={{ fontSize: '16px', color: 'var(--text-muted)' }}>
          Verifying your access&hellip;
        </div>
      </div>
    );
  }

  // No session at all -> send them to sign in, remembering where they wanted to go.
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const role = String(user.role || '').trim().toLowerCase();

  if (!allowedRoles.includes(role)) {
    const required = allowedRoles.map(roleLabel).join(' or ');

    return (
      <div
        className="site-wrapper"
        style={{ margin: '80px auto', maxWidth: '580px', textAlign: 'center' }}
      >
        <div className="card" style={{ padding: '48px 32px' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              background: '#fee2e2',
              color: '#dc2626',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}
          >
            <ShieldAlert size={36} />
          </div>

          <span className="badge badge-danger" style={{ marginBottom: '12px', fontSize: '13px' }}>
            Access Denied
          </span>

          <h1 style={{ fontSize: '28px', marginBottom: '12px' }}>
            {portalName || 'This area'} is restricted
          </h1>

          <p
            style={{ color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.6 }}
          >
            You are signed in as <strong>{roleLabel(role)}</strong>. This page
            requires a <strong>{required}</strong> account.
          </p>

          <p
            style={{ color: 'var(--text-muted)', marginBottom: '28px', lineHeight: 1.6 }}
          >
            Your role is <code>{role || 'unknown'}</code>. This decision is
            enforced on the server too, so changing the URL or the stored
            session cannot grant access.
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <Link to="/" className="btn btn-primary" id="return-home-btn">
              <ArrowLeft size={16} /> Return to Store
            </Link>
            <Link to="/profile" className="btn btn-secondary">
              Go to My Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
