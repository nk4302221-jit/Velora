import React from 'react';
import { Navigate, Link, useLocation } from 'react-router-dom';
import { MailCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <div style={{ fontSize: '16px', color: 'var(--text-muted)' }}>Verifying credentials...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // If user hasn't verified their email address
  if (!user.email_verified) {
    return (
      <div className="site-wrapper" style={{ margin: '60px auto', maxWidth: '640px' }}>
        <div className="card" style={{ textAlign: 'center', padding: '40px 32px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              background: '#fef3c7',
              color: '#d97706',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <AlertTriangle size={32} />
          </div>
          <h2 style={{ fontSize: '24px', marginBottom: '12px' }}>Email Verification Required</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.6 }}>
            For your security and order protection, please verify your email address (
            <strong>{user.email}</strong>) before proceeding to checkout and account management.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px' }}>
            <Link to="/verify-email" className="btn btn-primary" id="verify-now-btn">
              <MailCheck size={18} /> Enter Verification Code
            </Link>
            <Link to="/" className="btn btn-secondary">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};