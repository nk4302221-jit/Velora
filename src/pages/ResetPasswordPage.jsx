import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

export const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const token = searchParams.get('token') || '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      showToast('Reset token is missing from the URL', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/auth/reset-password', {
        token,
        newPassword,
      });

      if (res.data.success) {
        setIsSuccess(true);
        showToast('Password updated! You can now sign in with your new password.', 'success');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Password reset token is invalid or expired', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="site-wrapper" style={{ margin: '60px auto 80px', maxWidth: '460px' }} id="reset-password-container">
      <div className="card" style={{ padding: '36px 32px' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '8px', textAlign: 'center' }}>Set New Password</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
          Enter and confirm your new secure account password
        </p>

        {isSuccess ? (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle2 size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>Password Successfully Changed!</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
              Your password has been re-hashed and stored.
            </p>
            <Link to="/login" className="btn btn-primary">Sign In Now</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  className="form-control"
                  required
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ paddingLeft: '38px' }}
                  id="reset-new-password"
                />
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  className="form-control"
                  required
                  placeholder="Re-type password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{ paddingLeft: '38px' }}
                  id="reset-confirm-password"
                />
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '8px' }}
              disabled={isSubmitting}
              id="submit-reset-password-btn"
            >
              {isSubmitting ? 'Updating...' : 'Update Password'} <ArrowRight size={18} />
            </button>
          </form>
        )}
      </div>
    </div>
  );
};