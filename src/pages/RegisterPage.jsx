import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BrandLogo } from '../components/BrandLogo';

export const RegisterPage = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { showToast } = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setIsSubmitting(true);
    const result = await register(fullName, email, password);
    setIsSubmitting(false);

    if (!result.success) {
      showToast(result.message || 'Registration failed', 'error');
      return;
    }

    // Always carry the address the server actually used. It is lowercased and
    // trimmed there, so echoing the raw input can show an address on this page
    // that differs from the one the verification mail went to.
    const verifiedEmail = result.email || email;

    if (result.emailSent === false) {
      // The account was created but no code was sent. Say so plainly instead of
      // silently continuing to the verification page, then still route there so
      // "Resend Code" is one click away.
      showToast('Verification email could not be sent. Please try again.', 'error');
      navigate('/verify-email', { state: { email: verifiedEmail } });
      return;
    }

    showToast('Account registered! Please verify your email code.', 'success');
    navigate('/verify-email', { state: { email: verifiedEmail } });
  };

  return (
    <div className="site-wrapper" style={{ margin: '40px auto 80px', maxWidth: '480px' }} id="register-page-container">
      <div className="card" style={{ padding: '36px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', marginBottom: '14px' }}>
            <BrandLogo size={48} showText={false} />
          </div>
          <h1 style={{ fontSize: '26px', marginBottom: '8px' }}>Create an Account</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Join Velora for member pricing and express checkout
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-control"
                required
                placeholder=""
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={{ paddingLeft: '38px' }}
                id="register-name-input"
              />
              <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                className="form-control"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: '38px' }}
                id="register-email-input"
              />
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="form-control"
                required
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: '38px' }}
                id="register-password-input"
              />
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                className="form-control"
                required
                placeholder="Re-type password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ paddingLeft: '38px' }}
                id="register-confirm-password-input"
              />
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '16px' }}
            disabled={isSubmitting}
            id="register-submit-btn"
          >
            {isSubmitting ? 'Creating Account...' : 'Create Account'} <ArrowRight size={18} />
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 700 }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};