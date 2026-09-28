import React, { useEffect, useState } from 'react';

import { Link, useNavigate } from 'react-router-dom';

import {
  ArrowRight,
  AlertCircle,
  ArrowLeft,
  Mail,
  KeyRound,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

import api, { setStoredToken } from '../api/client';

import { useAuth } from '../context/AuthContext';

import { normalizeRole, roleHomePath } from '../utils/roles';

import { useToast } from '../context/ToastContext';

import { BrandLogo } from '../components/BrandLogo';

// Mirrors the server constants in backend/services/loginOtpService.js and
// backend/services/loginPinService.js. Both are the same 6 digits.
const OTP_LENGTH = 6;
const PIN_LENGTH = 6;
const DIGITS_ONLY = /^\d{6}$/;

// The server enforces this cooldown itself and answers 429 with the remaining
// seconds. Mirroring it here means the button is simply disabled instead of
// inviting a click that is guaranteed to fail.
const RESEND_COOLDOWN_SECONDS = 60;

const STEP_IDENTIFIER = 'identifier';
const STEP_METHOD = 'method';
const STEP_OTP = 'otp';
const STEP_PIN = 'pin';
const STEP_SET_PIN = 'set-pin';

const label = {
  [STEP_IDENTIFIER]: 'Email or Mobile Number',
  [STEP_METHOD]: 'Choose Login Method',
  [STEP_OTP]: 'Enter Sign-In Code',
  [STEP_PIN]: 'Enter PIN',
  [STEP_SET_PIN]: 'Create PIN',
};

const heading = {
  [STEP_IDENTIFIER]: 'Sign In to Velora',
  [STEP_METHOD]: 'Choose Login Method',
  [STEP_OTP]: 'Enter Sign-In Code',
  [STEP_PIN]: 'Enter PIN',
  [STEP_SET_PIN]: 'Create a PIN',
};

const subheading = {
  [STEP_IDENTIFIER]: 'Use a one-time code or a 6-digit PIN instead of a password.',
  [STEP_METHOD]: 'How would you like to sign in today?',
  [STEP_OTP]: 'We sent a 6-digit code to your {destination}.',
  [STEP_PIN]: 'Enter the 6-digit PIN you created for this account.',
  [STEP_SET_PIN]: 'Choose a 6-digit PIN for faster sign-in next time.',
};

/**
 * Optional OTP / PIN sign-in.
 *
 * This is a SEPARATE page rather than a mode inside LoginPage, which is why the
 * existing login form, its validation and its submit handler are untouched: the
 * only thing LoginPage gains is a link to get here.
 *
 * On success it stores the token exactly as AuthContext.login does and then
 * re-hydrates through AuthContext.refreshUser(), so every downstream consumer
 * (/api/auth/me, the axios interceptor, the route guards) is unchanged.
 */
export const OtpPinLoginPage = () => {
  const navigate = useNavigate();

  const { refreshUser } = useAuth();

  const { showToast } = useToast();

  const [step, setStep] = useState(STEP_IDENTIFIER);

  const [identifier, setIdentifier] = useState('');

  // What the server reported about the account, used to decide which buttons to
  // render and how to describe the destination.
  const [account, setAccount] = useState(null);

  const [secret, setSecret] = useState('');

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [cooldown, setCooldown] = useState(0);

  const [attemptsRemaining, setAttemptsRemaining] = useState(null);

  const [isBusy, setIsBusy] = useState(false);

  const [error, setError] = useState('');

  const [pinSetupToken, setPinSetupToken] = useState(null);

  // Digits only, and never more than 6, so the field cannot hold anything the
  // server would reject. `maxLength` alone still allows letters through.
  const handleSecretChange = (value) => {
    setSecret(String(value).replace(/\D/g, '').slice(0, OTP_LENGTH));
  };

  useEffect(() => {
    if (cooldown <= 0) return undefined;

    const timer = setInterval(() => {
      setCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  // Leaving this page must not leave a code sitting in state for the next visit.
  useEffect(() => {
    return () => {
      setSecret('');
      setPin('');
      setConfirmPin('');
      setPinSetupToken(null);
    };
  }, []);

  /**
   * Mirrors LoginPage.redirectByRole: the landing page comes from the role the
   * SERVER reported, never from client state. The role is read back from
   * /api/auth/me via refreshUser() rather than from the sign-in response, so it
   * is the live value.
   */
  const redirectByRole = (role) => {
    const target = roleHomePath(role);

    if (!target) {
      showToast('Your account role could not be verified.', 'error');

      return false;
    }

    navigate('/', { replace: true });

    return true;
  };

  /**
   * Adopts a session the way AuthContext.login does: persist the token, then let
   * AuthContext re-hydrate the user (and their membership) from the existing
   * /api/auth/me endpoint. Nothing about the session mechanism is new.
   */
  const completeSignIn = async (data) => {
    const token = data?.token;

    if (!token) {
      showToast('Sign-in response did not include a token', 'error');

      return false;
    }

    setStoredToken(token);

    const currentUser = await refreshUser();

    if (!currentUser) {
      showToast('Sign-in could not be completed. Please try again.', 'error');

      return false;
    }

    showToast('Welcome back! Logged in successfully.', 'success');

    return redirectByRole(normalizeRole(currentUser.role));
  };

  const validateIdentifier = () => {
    const trimmed = identifier.trim();

    if (!trimmed) {
      setError('Email address or mobile number is required.');

      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      const digits = trimmed.replace(/\D/g, '');

      if (digits.length < 10 || digits.length > 15) {
        setError('Enter a valid email address or mobile number.');

        return false;
      }
    }

    setError('');

    return true;
  };

  const handleIdentify = async (event) => {
    event.preventDefault();

    if (!validateIdentifier()) return;

    setIsBusy(true);

    try {
      const res = await api.post('/auth/otp-pin/identify', {
        identifier: identifier.trim(),
      });

      const data = res.data.data || {};

      setAccount(data);
      setIdentifier(identifier.trim());
      setSecret('');
      setError('');

      // Nothing to sign in with is a dead end, so say so up front rather than
      // letting the user pick a method that is guaranteed to fail.
      if (data.channel === 'sms' && data.smsConfigured === false) {
        setError(
          'SMS delivery is not configured on this server, so codes cannot be sent to a mobile number yet. Please use your email address.'
        );

        return;
      }

      setStep(STEP_METHOD);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          'We could not find an account for that email address or mobile number.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleSendOtp = async () => {
    setIsBusy(true);
    setError('');
    setAttemptsRemaining(null);

    try {
      const res = await api.post('/auth/otp-pin/send-otp', {
        identifier,
      });

      const data = res.data.data || {};

      setSecret('');
      setCooldown(Number(data.resendCooldownSeconds) || RESEND_COOLDOWN_SECONDS);

      if (data.destination) {
        setAccount((current) => ({ ...(current || {}), destination: data.destination }));
      }

      showToast(`A ${data.otpLength || OTP_LENGTH}-digit sign-in code has been sent.`, 'success');

      setStep(STEP_OTP);
    } catch (err) {
      // A 429 means the server's own cooldown is still running, so adopt the
      // remaining seconds it reported rather than leaving the button enabled.
      const retryAfter = Number(err.response?.data?.errors?.retryAfter);

      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        setCooldown(retryAfter);
      }

      setError(
        err.response?.data?.message ||
          'The sign-in code could not be sent. Please try again.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleVerifyOtp = async (event) => {
    event.preventDefault();

    if (!DIGITS_ONLY.test(secret)) {
      setError(`Please enter the ${OTP_LENGTH}-digit sign-in code.`);

      return;
    }

    setIsBusy(true);
    setError('');
    setAttemptsRemaining(null);

    try {
      const res = await api.post('/auth/otp-pin/verify-otp', {
        identifier,
        otp: secret,
      });

      const data = res.data.data || {};

      setSecret('');

      // A brand-new account gets one short-lived offer to set a PIN, because
      // that is the only moment a PIN may be created.
      if (data.pinSetup && data.pinSetupToken) {
        setPinSetupToken(data.pinSetupToken);
        setPin('');
        setConfirmPin('');
        setStep(STEP_SET_PIN);

        showToast('Signed in. You can now create a PIN for next time.', 'success');

        return;
      }

      await completeSignIn(data);
    } catch (err) {
      const remaining = Number(err.response?.data?.errors?.attemptsRemaining);

      if (Number.isFinite(remaining) && remaining >= 0) {
        setAttemptsRemaining(remaining);
      }

      setSecret('');

      setError(
        err.response?.data?.message ||
          'The sign-in code is incorrect or has expired.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleVerifyPin = async (event) => {
    event.preventDefault();

    if (!DIGITS_ONLY.test(secret)) {
      setError(`Please enter the ${PIN_LENGTH}-digit PIN.`);

      return;
    }

    setIsBusy(true);
    setError('');
    setAttemptsRemaining(null);

    try {
      const res = await api.post('/auth/otp-pin/verify-pin', {
        identifier,
        pin: secret,
      });

      setSecret('');

      await completeSignIn(res.data.data || {});
    } catch (err) {
      const remaining = Number(err.response?.data?.errors?.attemptsRemaining);

      if (Number.isFinite(remaining) && remaining >= 0) {
        setAttemptsRemaining(remaining);
      }

      setSecret('');

      setError(
        err.response?.data?.message || 'The PIN is incorrect. Please try again.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreatePin = async (event) => {
    event.preventDefault();

    if (!DIGITS_ONLY.test(pin)) {
      setError(`The PIN must be exactly ${PIN_LENGTH} digits.`);

      return;
    }

    if (pin !== confirmPin) {
      setError('The two PINs do not match.');

      return;
    }

    setIsBusy(true);
    setError('');

    try {
      const res = await api.put('/auth/otp-pin/pin', {
        pin,
        confirmPin,
        setupToken: pinSetupToken,
      });

      setPin('');
      setConfirmPin('');
      setPinSetupToken(null);

      showToast(
        res.data.message || 'PIN created successfully.',
        'success'
      );

      // The session was already established by the OTP verification, so this
      // re-hydrates through the same path and lands on the same page a normal
      // sign-in would.
      const currentUser = await refreshUser();

      if (currentUser) {
        redirectByRole(normalizeRole(currentUser.role));
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(
        err.response?.data?.message || 'The PIN could not be created.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const goBack = () => {
    setError('');
    setSecret('');

    if (step === STEP_SET_PIN) {
      // Skipping the offer is always allowed - the PIN is optional.
      setPinSetupToken(null);
      refreshUser().then((currentUser) => {
        if (currentUser) {
          redirectByRole(normalizeRole(currentUser.role));
        } else {
          navigate('/', { replace: true });
        }
      });

      return;
    }

    if (step === STEP_METHOD) {
      setStep(STEP_IDENTIFIER);

      return;
    }

    setStep(STEP_METHOD);
  };

  const isSms = account?.channel === 'sms';

  return (
    <div
      className="site-wrapper"
      style={{ margin: '48px auto 80px', maxWidth: '460px' }}
      id="otp-pin-login-page-container"
    >
      <div
        className="card"
        style={{ padding: '36px 32px' }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '28px',
            textAlign: 'center',
          }}
        >
          <BrandLogo
            size={48}
            showText={false}
          />

          <h1
            style={{
              fontSize: '24px',
              fontWeight: 800,
              color: 'var(--text-primary, #0f172a)',
              margin: '16px 0 6px',
            }}
          >
            {heading[step]}
          </h1>

          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-muted)',
              margin: 0,
            }}
          >
            {String(subheading[step]).replace(
              '{destination}',
              account?.destination || 'your contact details'
            )}
          </p>
        </div>

        {/* =================================================
            STEP 1 - IDENTIFIER
        ================================================= */}

        {step === STEP_IDENTIFIER && (
          <form
            onSubmit={handleIdentify}
            noValidate
          >
            <div
              className="form-group"
              style={{ marginBottom: '20px' }}
            >
              <label
                className="form-label"
                htmlFor="otp-pin-identifier"
              >
                {label[STEP_IDENTIFIER]}
              </label>

              <div style={{ position: 'relative' }}>
                <Mail
                  size={18}
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-light)',
                    pointerEvents: 'none',
                  }}
                />

                <input
                  id="otp-pin-identifier"
                  className="form-control"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter your email or mobile number"
                  disabled={isBusy}
                  style={{ paddingLeft: '44px' }}
                />
              </div>
            </div>

            {error && (
              <div
                id="otp-pin-error"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: '13px',
                  marginBottom: '20px',
                }}
              >
                <AlertCircle
                  size={16}
                  style={{ flexShrink: 0, marginTop: 1 }}
                />

                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              id="otp-pin-continue-btn"
              disabled={isBusy}
              style={{ width: '100%' }}
            >
              Continue

              <ArrowRight size={18} />
            </button>
          </form>
        )}

        {/* =================================================
            STEP 2 - CHOOSE A METHOD
        ================================================= */}

        {step === STEP_METHOD && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1d4ed8',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: '13px',
                marginBottom: '20px',
                wordBreak: 'break-all',
              }}
            >
              {isSms ? (
                <Smartphone
                  size={16}
                  style={{ flexShrink: 0 }}
                />
              ) : (
                <Mail
                  size={16}
                  style={{ flexShrink: 0 }}
                />
              )}

              <span>{account?.destination}</span>
            </div>

            {error && (
              <div
                id="otp-pin-error"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: '13px',
                  marginBottom: '20px',
                }}
              >
                <AlertCircle
                  size={16}
                  style={{ flexShrink: 0, marginTop: 1 }}
                />

                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary btn-lg"
              id="otp-pin-send-otp-btn"
              onClick={handleSendOtp}
              disabled={isBusy}
              style={{ width: '100%', marginBottom: '12px' }}
            >
              <Mail size={18} />

              Send OTP

              <ArrowRight size={18} />
            </button>

            {account?.pinAvailable ? (
              <button
                type="button"
                className="btn btn-secondary"
                id="otp-pin-use-pin-btn"
                onClick={() => {
                  setSecret('');
                  setError('');
                  setStep(STEP_PIN);
                }}
                disabled={isBusy}
                style={{ width: '100%' }}
              >
                <KeyRound size={18} />

                Use PIN
              </button>
            ) : (
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  margin: '4px 0 0',
                }}
              >
                You have not set a PIN yet. Verify a sign-in code and you can
                create one.
              </p>
            )}
          </div>
        )}

        {/* =================================================
            STEP 2a - ENTER THE CODE
        ================================================= */}

        {step === STEP_OTP && (
          <form
            onSubmit={handleVerifyOtp}
            noValidate
          >
            <div
              className="form-group"
              style={{ marginBottom: '20px' }}
            >
              <label
                className="form-label"
                htmlFor="otp-pin-code"
              >
                {label[STEP_OTP]}
              </label>

              <input
                id="otp-pin-code"
                className="form-control"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH}
                value={secret}
                onChange={(e) => handleSecretChange(e.target.value)}
                placeholder="000000"
                disabled={isBusy}
                style={{
                  letterSpacing: '10px',
                  fontSize: '20px',
                  textAlign: 'center',
                  fontWeight: 700,
                }}
              />
            </div>

            {attemptsRemaining !== null && (
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  margin: '-8px 0 16px',
                }}
              >
                {attemptsRemaining}{' '}
                {attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining
              </p>
            )}

            {error && (
              <div
                id="otp-pin-error"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: '13px',
                  marginBottom: '20px',
                }}
              >
                <AlertCircle
                  size={16}
                  style={{ flexShrink: 0, marginTop: 1 }}
                />

                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              id="otp-pin-verify-otp-btn"
              disabled={isBusy}
              style={{ width: '100%' }}
            >
              Verify and Sign In

              <ArrowRight size={18} />
            </button>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '16px',
                gap: '12px',
              }}
            >
              <button
                type="button"
                className="btn btn-sm"
                onClick={goBack}
                disabled={isBusy}
                style={{ background: 'transparent', border: 'none' }}
              >
                <ArrowLeft size={14} />

                Back
              </button>

              <button
                type="button"
                className="btn btn-sm"
                onClick={handleSendOtp}
                disabled={isBusy || cooldown > 0}
                style={{ background: 'transparent', border: 'none' }}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {/* =================================================
            STEP 2b - ENTER THE PIN
        ================================================= */}

        {step === STEP_PIN && (
          <form
            onSubmit={handleVerifyPin}
            noValidate
          >
            <div
              className="form-group"
              style={{ marginBottom: '20px' }}
            >
              <label
                className="form-label"
                htmlFor="otp-pin-pin"
              >
                {label[STEP_PIN]}
              </label>

              <input
                id="otp-pin-pin"
                className="form-control"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={PIN_LENGTH}
                value={secret}
                onChange={(e) => handleSecretChange(e.target.value)}
                placeholder="000000"
                disabled={isBusy}
                style={{
                  letterSpacing: '10px',
                  fontSize: '20px',
                  textAlign: 'center',
                  fontWeight: 700,
                }}
              />
            </div>

            {attemptsRemaining !== null && (
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  margin: '-8px 0 16px',
                }}
              >
                {attemptsRemaining}{' '}
                {attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining
              </p>
            )}

            {error && (
              <div
                id="otp-pin-error"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: '13px',
                  marginBottom: '20px',
                }}
              >
                <AlertCircle
                  size={16}
                  style={{ flexShrink: 0, marginTop: 1 }}
                />

                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              id="otp-pin-verify-pin-btn"
              disabled={isBusy}
              style={{ width: '100%' }}
            >
              Sign In with PIN

              <ArrowRight size={18} />
            </button>

            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={goBack}
                disabled={isBusy}
                style={{ background: 'transparent', border: 'none' }}
              >
                <ArrowLeft size={14} />

                Back
              </button>
            </div>
          </form>
        )}

        {/* =================================================
            OFFER - CREATE A PIN (only offered right after a
            verified sign-in code, and always skippable)
        ================================================= */}

        {step === STEP_SET_PIN && (
          <form
            onSubmit={handleCreatePin}
            noValidate
          >
            <div
              className="form-group"
              style={{ marginBottom: '16px' }}
            >
              <label
                className="form-label"
                htmlFor="otp-pin-new-pin"
              >
                New PIN
              </label>

              <input
                id="otp-pin-new-pin"
                className="form-control"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={PIN_LENGTH}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
                placeholder="000000"
                disabled={isBusy}
                style={{
                  letterSpacing: '10px',
                  fontSize: '18px',
                  textAlign: 'center',
                  fontWeight: 700,
                }}
              />
            </div>

            <div
              className="form-group"
              style={{ marginBottom: '20px' }}
            >
              <label
                className="form-label"
                htmlFor="otp-pin-confirm-pin"
              >
                Confirm PIN
              </label>

              <input
                id="otp-pin-confirm-pin"
                className="form-control"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={PIN_LENGTH}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
                placeholder="000000"
                disabled={isBusy}
                style={{
                  letterSpacing: '10px',
                  fontSize: '18px',
                  textAlign: 'center',
                  fontWeight: 700,
                }}
              />
            </div>

            {error && (
              <div
                id="otp-pin-error"
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: '13px',
                  marginBottom: '20px',
                }}
              >
                <AlertCircle
                  size={16}
                  style={{ flexShrink: 0, marginTop: 1 }}
                />

                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              id="otp-pin-create-btn"
              disabled={isBusy}
              style={{ width: '100%' }}
            >
              Create PIN

              <ArrowRight size={18} />
            </button>

            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={goBack}
                disabled={isBusy}
                style={{ background: 'transparent', border: 'none' }}
              >
                Skip for now
              </button>
            </div>
          </form>
        )}

        {/* =================================================
            SHARED FOOTER
        ================================================= */}

        {step !== STEP_SET_PIN && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                marginTop: '24px',
                fontSize: '12px',
                color: 'var(--text-light)',
              }}
            >
              <ShieldCheck size={14} />

              <span>Your sign-in information is securely protected.</span>
            </div>

            <div
              style={{
                textAlign: 'center',
                marginTop: '20px',
                paddingTop: '20px',
                borderTop: '1px solid var(--border-color)',
                fontSize: '14px',
                color: 'var(--text-muted)',
              }}
            >
              <Link
                to="/login"
                id="otp-pin-back-to-login-link"
                style={{
                  color: 'var(--primary)',
                  fontWeight: 700,
                }}
              >
                Sign in with a password
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
