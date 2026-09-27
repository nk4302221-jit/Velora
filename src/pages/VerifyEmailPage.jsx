import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { MailCheck, ArrowRight, RotateCcw } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const OTP_LENGTH = 6;
const OTP_PATTERN = /^\d{6}$/;

// The server enforces this cooldown on POST /auth/resend-verification and
// answers 429 with the remaining seconds. Mirroring it here means the button
// simply stays disabled instead of inviting a click that is guaranteed to fail.
const RESEND_COOLDOWN_SECONDS = 60;

export const VerifyEmailPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { updateUser, user } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState(
    String(location.state?.email || user?.email || '').trim()
  );
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  // Seconds left before another code may be requested. Starts at the cooldown
  // because arriving here always means a code was just emailed by registration.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  const address = String(email || '').trim().toLowerCase();

  useEffect(() => {
    if (cooldown <= 0) return undefined;

    const timer = setInterval(() => {
      setCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  // Digits only, and never more than 6, so the field cannot hold anything the
  // server would reject. `maxLength` alone still allows letters through.
  const handleOtpChange = (value) => {
    setOtp(String(value).replace(/\D/g, '').slice(0, OTP_LENGTH));
  };

  const handleVerify = async (e) => {
    e.preventDefault();

    if (!address) {
      showToast('Please enter your registered email address', 'error');
      return;
    }

    if (!OTP_PATTERN.test(otp)) {
      showToast(`Please enter the ${OTP_LENGTH}-digit verification code`, 'error');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await api.post('/auth/verify-email', { email: address, otp });
      if (res.data.success) {
        showToast('Email verified successfully! Welcome to Velora.', 'success');
        if (user) {
          updateUser({ ...user, email_verified: true });
        }
        navigate('/');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Verification code is invalid or expired', 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!address) {
      showToast('Please enter your registered email address', 'error');
      return;
    }

    setIsResending(true);
    try {
      const res = await api.post('/auth/resend-verification', { email: address });

      // The server now answers 502 when the mail could not be delivered, so a
      // failure lands in the catch block below rather than being reported as a
      // dispatched code.
      if (res.data.success) {
        const data = res.data.data || {};

        showToast('A new verification code has been dispatched to your email!', 'success');

        setEmail(data.email || address);

        // The resend generated a completely new code, so whatever was typed
        // against the previous one can no longer succeed.
        setOtp('');

        setCooldown(Number(data.resendCooldownSeconds) || RESEND_COOLDOWN_SECONDS);
      }
    } catch (err) {
      // A 429 means the server's own cooldown is still running, so adopt the
      // remaining seconds it reported rather than leaving the button enabled.
      const retryAfter = Number(err.response?.data?.errors?.retryAfter);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        setCooldown(retryAfter);
      }

      showToast(
        err.response?.data?.message ||
          'Verification email could not be sent. Please try again.',
        'error'
      );
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="site-wrapper" style={{ margin: '60px auto 80px', maxWidth: '460px' }} id="verify-email-container">
      <div className="card" style={{ padding: '36px 32px', textAlign: 'center' }}>
        <div
          style={{
            width: '60px',
            height: '60px',
            background: 'var(--primary-light)',
            color: 'var(--primary)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <MailCheck size={30} />
        </div>

        <h1 style={{ fontSize: '24px', marginBottom: '8px' }}>Verify Your Email</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
          Please enter the 6-digit verification code sent to <strong>{email || 'your email'}</strong>
        </p>

        <form onSubmit={handleVerify} style={{ textAlign: 'left' }}>
          {!user && (
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-control"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                id="verify-email-address-input"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Verification Code</label>
            <input
              type="text"
              className="form-control"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={OTP_LENGTH}
              placeholder="e.g. 123456"
              value={otp}
              onChange={(e) => handleOtpChange(e.target.value)}
              style={{ letterSpacing: '6px' }}
              id="verification-token-input"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={isVerifying}
            id="submit-verify-btn"
          >
            {isVerifying ? 'Verifying...' : 'Verify Email'} <ArrowRight size={18} />
          </button>
        </form>

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleResend}
            disabled={isResending || cooldown > 0}
            id="resend-code-btn"
          >
            <RotateCcw size={14} />
            {isResending
              ? 'Resending...'
              : cooldown > 0
                ? `Resend Code (${cooldown}s)`
                : 'Resend Code'}
          </button>
        </div>

        {cooldown > 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '10px' }}>
            You can request a new code in {cooldown} second{cooldown === 1 ? '' : 's'}.
          </p>
        )}

        <div style={{ marginTop: '20px', fontSize: '13px' }}>
          <Link to="/" style={{ color: 'var(--text-muted)' }}>Return to Home</Link>
        </div>
      </div>
    </div>
  );
};