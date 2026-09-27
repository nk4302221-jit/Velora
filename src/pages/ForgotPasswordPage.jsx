import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

export const ForgotPasswordPage = () => {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [demoToken, setDemoToken] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      if (res.data.success) {
        setIsSent(true);
        if (res.data.data?.demoToken) {
          setDemoToken(res.data.data.demoToken);
        }
        showToast('Password reset link generated!', 'success');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to process request', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="site-wrapper" style={{ margin: '60px auto 80px', maxWidth: '460px' }} id="forgot-password-container">
      <div className="card" style={{ padding: '36px 32px' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '8px', textAlign: 'center' }}>Reset Your Password</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
          Enter your email address and we'll generate a secure reset link.
        </p>

        {isSent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--success)', marginBottom: '16px' }}>
              <CheckCircle2 size={48} style={{ margin: '0 auto' }} />
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-main)', marginBottom: '20px' }}>
              A password reset link has been dispatched to <strong>{email}</strong>.
            </p>
            {demoToken && (
              <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>Direct Reset Link:</div>
                <Link to={`/reset-password?token=${demoToken}`} className="btn btn-primary btn-sm">
                  Click to Reset Password
                </Link>
              </div>
            )}
            <Link to="/login" className="btn btn-secondary btn-sm">Return to Login</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Registered Email</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  className="form-control"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ paddingLeft: '38px' }}
                  id="forgot-email-input"
                />
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '8px' }}
              disabled={isSubmitting}
              id="send-reset-link-btn"
            >
              {isSubmitting ? 'Sending...' : 'Send Reset Link'} <ArrowRight size={18} />
            </button>

            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px' }}>
              <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                Remember your password? Sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};