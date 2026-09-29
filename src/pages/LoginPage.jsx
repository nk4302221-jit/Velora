import React, { useState, useEffect } from 'react';

import { Link, useNavigate, useLocation } from 'react-router-dom';

import {
  Mail,
  Lock,
  LogIn,
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertCircle,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';

import { setStoredToken } from '../api/client';

import { normalizeRole, roleHomePath } from '../utils/roles';

import { useToast } from '../context/ToastContext';

import { BrandLogo } from '../components/BrandLogo';

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    login,
    socialLogin,
    refreshUser,
  } = useAuth();

  const { showToast } = useToast();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // =====================================================
  // ROLE BASED REDIRECT
  //
  // The landing page comes from the role the SERVER reported. The role is
  // never taken from a query string, localStorage or a JWT claim, so this
  // cannot be used to reach another role's portal.
  //
  //   super_admin -> /super-admin/dashboard
  //   admin       -> /admin/dashboard
  //   customer    -> /customer/dashboard
  // =====================================================

  const getRole = (result) => {
    return normalizeRole(
      result?.user?.role ??
        result?.data?.user?.role ??
        result?.data?.role ??
        result?.role ??
        null
    );
  };

  const redirectByRole = (role) => {
    const target = roleHomePath(role);

    console.log('[Auth] redirectByRole', { role, target });

    // An unknown / blank role must never receive a privileged landing page.
    if (!target) {
      showToast(
        'Your account role could not be verified.',
        'error'
      );

      return false;
    }

    navigate('/', {
      replace: true,
    });

    return true;
  };

  const validateForm = () => {
    const errors = {};

    // Accepts an email address OR a mobile number - the API resolves either
    // through POST /api/auth/login { identifier, password }.
    const trimmed = identifier.trim();

    if (!trimmed) {
      errors.identifier = 'Email address or mobile number is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      const digits = trimmed.replace(/\D/g, '');

      if (digits.length < 10 || digits.length > 15) {
        errors.identifier =
          'Enter a valid email address or mobile number.';
      }
    }

    if (!password) {
      errors.password = 'Password is required.';
    }

    setFieldErrors(errors);

    return Object.keys(errors).length === 0;
  };

  // =====================================================
  // GOOGLE OAUTH CALLBACK
  // =====================================================

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const oauthToken = params.get('token');

    if (oauthToken) {
      setStoredToken(oauthToken);

      // Strip the token from the URL immediately so a refresh does not
      // replay the OAuth branch.
      window.history.replaceState(
        {},
        '',
        window.location.pathname
      );

        (async () => {
          try {
            const user = await refreshUser();

            const role = normalizeRole(user?.role);

            showToast(
              'Signed in with Google successfully!',
              'success'
            );

            // Same role-based redirect as password login.
            redirectByRole(role);
          } catch (error) {
          console.error(
            'OAuth refreshUser error:',
            error
          );

          showToast(
            'Google sign-in completed, but user session could not be loaded.',
            'error'
          );
        }
      })();

      return;
    }

    if (params.get('error')) {
      showToast(
        'Google sign-in failed. Please try again.',
        'error'
      );

      navigate('/login', {
        replace: true,
      });
    }
  }, [
    location.search,
    refreshUser,
    navigate,
    showToast,
  ]);

  // =====================================================
  // NORMAL LOGIN
  // =====================================================

  const performLogin = async (
    loginEmail,
    loginPassword
  ) => {
    setIsSubmitting(true);
    setFormError('');

    try {
      const result = await login(
        loginEmail,
        loginPassword
      );

      if (result?.success) {
        const role = getRole(result);

        showToast(
          'Welcome back! Logged in successfully.',
          'success'
        );

        redirectByRole(role);
      } else {
        const message =
          result?.message ||
          'Login failed. Please check your credentials.';

        setFormError(message);

        showToast(message, 'error');
      }
    } catch (error) {
      console.error(
        'Login error:',
        error
      );

      setFormError(
        'Something went wrong while signing in.'
      );

      showToast(
        'Something went wrong while signing in.',
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // =====================================================
  // LOGIN FORM SUBMIT
  // =====================================================

  const handleSubmit = async (e) => {
    e.preventDefault();

    setFormError('');

    if (!validateForm()) {
      return;
    }

    await performLogin(
      identifier.trim(),
      password
    );
  };

  // =====================================================
  // REAL SOCIAL LOGIN
  // =====================================================

  const handleSocialLogin = async (
    provider
  ) => {
    setIsSubmitting(true);

    try {
      /*
       * IMPORTANT:
       * Do not create fake/demo profile data here.
       *
       * Google OAuth is handled by the backend OAuth
       * flow and returns to this page with a JWT token.
       */

      if (provider === 'google') {
        const backendUrl =
          import.meta.env.VITE_API_URL ||
          'https://velora-production-9955.up.railway.app';

        window.location.href =
          `${backendUrl}/api/auth/google`;

        return;
      }

      showToast(
        `${provider} login is not configured yet.`,
        'info'
      );
    } catch (error) {
      console.error(
        'Social login error:',
        error
      );

      showToast(
        'Social login failed. Please try again.',
        'error'
      );

      setIsSubmitting(false);
    }
  };

  // =====================================================
  // UI
  // =====================================================

  return (
    <div
      className="site-wrapper"
      style={{
        margin: '48px auto 80px',
        maxWidth: '460px',
      }}
      id="login-page-container"
    >
      <div
        className="card"
        style={{
          padding: '36px 32px',
        }}
      >
        {/* =================================================
            BRAND HEADER
        ================================================= */}

        <div
          style={{
            textAlign: 'center',
            marginBottom: '28px',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              marginBottom: '14px',
            }}
          >
            <BrandLogo
              size={48}
              showText={false}
            />
          </div>

          <h1
            style={{
              fontSize: '26px',
              marginBottom: '8px',
            }}
          >
            Sign In to Velora
          </h1>

          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '14px',
            }}
          >
            Access your orders, saved wishlist,
            and member discounts
          </p>
        </div>

        {/* =================================================
            LOGIN FORM
        ================================================= */}

        <form
          onSubmit={handleSubmit}
          noValidate
        >
          {/* Email or mobile number */}

          <div
            style={{
              marginBottom: '16px',
            }}
          >
            <label
              htmlFor="login-identifier"
              style={{
                display: 'block',
                marginBottom: '7px',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              Email or Mobile Number
            </label>

            <div
              style={{
                position: 'relative',
              }}
            >
              <Mail
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform:
                    'translateY(-50%)',
                  color:
                    'var(--text-muted)',
                }}
              />

              <input
                id="login-identifier"
                type="text"
                inputMode="email"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);

                  if (fieldErrors.identifier) {
                    setFieldErrors((prev) => ({ ...prev, identifier: '' }));
                  }
                }}
                placeholder="Enter your email or mobile number"
                autoComplete="username"
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.identifier)}
                aria-describedby={
                  fieldErrors.identifier ? 'login-identifier-error' : undefined
                }
                style={{
                  width: '100%',
                  padding:
                    '12px 12px 12px 40px',
                  borderColor: fieldErrors.identifier ? '#dc2626' : undefined,
                }}
              />
            </div>

            {fieldErrors.identifier && (
              <p
                id="login-identifier-error"
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '7px',
                  fontSize: '12px',
                  color: '#dc2626',
                }}
              >
                <AlertCircle size={13} />
                {fieldErrors.identifier}
              </p>
            )}
          </div>

          {/* Password */}

          <div
            style={{
              marginBottom: '8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '7px',
                gap: '8px',
              }}
            >
              <label
                htmlFor="login-password"
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                Password
              </label>

              <Link
                to="/forgot-password"
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--primary)',
                }}
                id="login-forgot-password-link"
              >
                Forgot Password?
              </Link>
            </div>

            <div
              style={{
                position: 'relative',
              }}
            >
              <Lock
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform:
                    'translateY(-50%)',
                  color:
                    'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />

              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);

                  if (fieldErrors.password) {
                    setFieldErrors((prev) => ({ ...prev, password: '' }));
                  }
                }}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                style={{
                  width: '100%',
                  padding:
                    '12px 42px 12px 40px',
                  borderColor: fieldErrors.password ? '#dc2626' : undefined,
                }}
              />

              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={isSubmitting}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                title={showPassword ? 'Hide password' : 'Show password'}
                id="login-toggle-password"
                style={{
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  borderRadius: '6px',
                }}
              >
                {showPassword ? (
                  <EyeOff size={17} />
                ) : (
                  <Eye size={17} />
                )}
              </button>
            </div>

            {fieldErrors.password && (
              <p
                id="login-password-error"
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '7px',
                  fontSize: '12px',
                  color: '#dc2626',
                }}
              >
                <AlertCircle size={13} />
                {fieldErrors.password}
              </p>
            )}
          </div>

          {/* Server-side error (bad credentials, locked account, ...) */}

          {formError && (
            <div
              role="alert"
              id="login-form-error"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '10px 12px',
                marginBottom: '14px',
                fontSize: '13px',
                color: '#991b1b',
                background: '#fee2e2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
              }}
            >
              <AlertCircle
                size={16}
                style={{ flexShrink: 0, marginTop: 1 }}
              />
              <span>{formError}</span>
            </div>
          )}

          {/* Security Info */}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--text-muted)',
              fontSize: '12px',
              marginBottom: '14px',
            }}
          >
            <ShieldCheck size={15} />

            <span>
              Your login information is securely
              protected.
            </span>
          </div>

          {/* Submit */}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{
              width: '100%',
              marginTop: '12px',
            }}
            disabled={isSubmitting}
            id="login-submit-btn"
          >
            <LogIn size={18} />

            {isSubmitting
              ? 'Signing In...'
              : 'Sign In'}

            <ArrowRight size={18} />
          </button>
        </form>

        {/* =================================================
            SOCIAL LOGIN DIVIDER
        ================================================= */}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            margin: '24px 0',
            color: 'var(--text-light)',
            fontSize: '13px',
          }}
        >
          <div
            style={{
              flex: 1,
              height: '1px',
              background:
                'var(--border-color)',
            }}
          />

          <span
            style={{
              padding: '0 12px',
            }}
          >
            or continue with
          </span>

          <div
            style={{
              flex: 1,
              height: '1px',
              background:
                'var(--border-color)',
            }}
          />
        </div>

        {/* =================================================
            GOOGLE LOGIN
        ================================================= */}

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            handleSocialLogin('google')
          }
          disabled={isSubmitting}
          style={{
            width: '100%',
            fontSize: '13px',
          }}
          id="login-google-btn"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fill="#EA4335"
              d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
            />

            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
            />

            <path
              fill="#FBBC05"
              d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.2s.7 5.5 1.9 7.9l3.7-2.9z"
            />

            <path
              fill="#34A853"
              d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16.5C3.7 20.2 7.5 23.5 12 23.5z"
            />
          </svg>

          Continue with Google
        </button>

        {/* =================================================
            OPTIONAL OTP / PIN SIGN-IN
            A single link out to a separate page. Deliberately placed OUTSIDE
            the <form> above (which closes before the Google button) and
            deliberately importing nothing new, so the existing password form,
            its validation, its submit handler and its error states cannot be
            affected in any way.
        ================================================= */}

        <Link
          to="/login-otp"
          id="login-otp-pin-link"
          className="btn btn-secondary"
          style={{
            width: '100%',
            fontSize: '13px',
            marginTop: '12px',
            textAlign: 'center',
            textDecoration: 'none',
          }}
        >
          Login with OTP / PIN
        </Link>

        {/* =================================================
            REGISTER LINK
        ================================================= */}

        <div
          style={{
            textAlign: 'center',
            marginTop: '24px',
            fontSize: '14px',
            color: 'var(--text-muted)',
          }}
        >
          Don't have an account?{' '}

          <Link
            to="/register"
            style={{
              color: 'var(--primary)',
              fontWeight: 700,
            }}
          >
            Sign up now
          </Link>
        </div>
      </div>
    </div>
  );
};