import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';

import api, {
  getStoredToken,
  setStoredToken,
  clearStoredToken,
} from '../api/client';

import { normalizeRole } from '../utils/roles';

const AuthContext = createContext(undefined);

/**
 * Normalize a user object coming from the API.
 * `role` is ALWAYS preserved (never dropped, never blanked) so that
 * admin / super_admin survive hydration and route guards.
 */
const hydrateUser = (rawUser) => {
  if (!rawUser || typeof rawUser !== 'object') return null;

  const role = normalizeRole(rawUser.role);

  console.log('[Auth] user hydrated', {
    id: rawUser.id,
    email: rawUser.email,
    role,
  });

  return {
    ...rawUser,
    id: rawUser.id,
    email: rawUser.email,
    role,
    email_verified: Boolean(rawUser.email_verified),
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  const [token, setToken] = useState(getStoredToken());

  const [membership, setMembership] = useState(null);

  const [loading, setLoading] = useState(true);


  // =====================================================
  // MEMBERSHIP
  // =====================================================

  const refreshMembership = useCallback(async () => {
    try {
      const res = await api.get('/plans/my-status');

      if (res.data.success) {
        setMembership(res.data.data);

        return res.data.data;
      }

      setMembership(null);

      return null;
    } catch (error) {
      setMembership(null);

      return null;
    }
  }, []);

  // =====================================================
  // REFRESH CURRENT USER
  // =====================================================

  const refreshUser = useCallback(async () => {
    // Mark the session as hydrating for the WHOLE round trip so route guards
    // (AdminRoute / ProtectedRoute) render their loading state instead of
    // evaluating a stale `user` - or worse, rendering 403 - while
    // /api/auth/me is still in flight.
    setLoading(true);

    const storedToken = getStoredToken();

    if (!storedToken) {
      setToken(null);
      setUser(null);
      setMembership(null);
      setLoading(false);

      return null;
    }

    try {
      const res = await api.get('/auth/me');

      if (res.data.success) {
        const currentUser = hydrateUser(res.data.data?.user);

        if (!currentUser) {
          clearStoredToken();
          setToken(null);
          setUser(null);
          setMembership(null);

          return null;
        }

        setToken(storedToken);
        setUser(currentUser);

        console.log('[Auth] /api/auth/me ok', {
          id: currentUser.id,
          role: currentUser.role,
        });

        await refreshMembership();

        return currentUser;
      }

      clearStoredToken();

      setToken(null);
      setUser(null);
      setMembership(null);

      return null;
    } catch (err) {
      const status = err.response?.status;

      console.error('[Auth] verification failed', {
        status: status ?? 'network-error',
        message: err.response?.data?.message || err.message,
      });

      // Only discard the session when the token itself is rejected.
      // A 403 (e.g. unverified email) or a network blip must NOT log the
      // user out, otherwise a valid admin gets bounced off /admin.
      if (status === 401 || !err.response) {
        clearStoredToken();

        setToken(null);
        setUser(null);
        setMembership(null);
      }

      return null;
    } finally {
      setLoading(false);
    }
  }, [refreshMembership]);

  // =====================================================
  // INITIAL AUTH CHECK
  // =====================================================

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // =====================================================
  // REAL EMAIL/PASSWORD LOGIN
  // =====================================================

  /**
   * `identifier` may be an email address or a mobile number. The backend
   * decides which query to run, so the client does not have to know the format
   * of the account it is signing into.
   */
  const login = async (identifier, password) => {
    try {
      const res = await api.post('/auth/login', {
        identifier,
        password,
      });

      if (res.data.success) {
        const {
          token: receivedToken,
          user: receivedUser,
        } = res.data.data || {};

        if (!receivedToken) {
          return {
            success: false,
            message: 'Login response did not include a token',
          };
        }

        // Preserve the role exactly as the server reported it.
        const hydratedUser = hydrateUser(receivedUser);

        // Save real JWT
        setStoredToken(receivedToken);

        // Save authentication state
        setToken(receivedToken);
        setUser(hydratedUser);

        console.log('[Auth] login success', {
          id: hydratedUser?.id,
          email: hydratedUser?.email,
          role: hydratedUser?.role,
        });

        // Load membership for the logged-in user
        await refreshMembership();

        return {
          success: true,
          message:
            res.data.message ||
            'Login successful',
          user: hydratedUser,
          role: hydratedUser?.role || null,
          token: receivedToken,
        };
      }

      return {
        success: false,
        message:
          res.data.message ||
          'Login failed',
      };
    } catch (err) {
      const status = err.response?.status;

      console.error('[Auth] login error', {
        status: status ?? 'network-error',
        message: err.response?.data?.message || err.message,
      });

      return {
        success: false,
        message:
          err.response?.data?.message ||
          'Login error occurred',

        requiresVerification:
          err.response?.data
            ?.requiresVerification || false,
      };
    }
  };

  // =====================================================
  // REGISTER
  // =====================================================

  const register = async (
    nameOrData,
    email,
    password
  ) => {
    try {
      const payload =
        typeof nameOrData === 'object'
          ? nameOrData
          : {
              fullName: nameOrData,
              email,
              password,
              confirmPassword: password,
            };

      const res = await api.post(
        '/auth/register',
        payload
      );

      const data = res.data?.data || {};

      return {
        success: true,
        message: res.data.message,
        verificationLink: data.verifyLink,
        // The backend reports whether the verification email actually left the
        // server. When it did not, the account exists but no code is coming, so
        // the caller must tell the user instead of parking them on a page
        // waiting for mail that will never arrive.
        emailSent: data.emailSent !== false,
        emailDelivery: data.emailDelivery || null,
        // Always use the address the server normalized and actually used for
        // delivery, never the raw text the user typed.
        email: data.email || payload.email || '',
      };
    } catch (err) {
      return {
        success: false,
        message:
          err.response?.data?.message ||
          'Registration failed',
      };
    }
  };

  // =====================================================
  // UPDATE USER
  // Merges instead of replacing so fields the API omits
  // (role, email_verified, status) are never lost.
  // =====================================================

  const updateUser = (updatedUser) => {
    setUser((previous) => {
      if (!updatedUser) return previous;
      if (!previous) return hydrateUser(updatedUser);

      return {
        ...previous,
        ...updatedUser,
        role: normalizeRole(
          updatedUser.role ?? previous.role
        ),
      };
    });
  };

  // =====================================================
  // GOOGLE OAUTH
  // =====================================================

  const socialLogin = async (provider) => {
    try {
      if (provider === 'google') {
        /*
         * Real Google OAuth.
         *
         * Backend will authenticate the Google account,
         * create/find the real user, generate JWT,
         * and redirect back to LoginPage with ?token=...
         */

        const backendUrl =
          import.meta.env.VITE_API_URL ||
          'http://localhost:5000';

        window.location.href =
          `${backendUrl}/api/auth/google`;

        return {
          success: true,
          message: 'Redirecting to Google...',
        };
      }

      if (provider === 'facebook') {
        return {
          success: false,
          message:
            'Facebook login is not configured yet.',
        };
      }

      return {
        success: false,
        message:
          'Unsupported social login provider',
      };
    } catch (err) {
      return {
        success: false,
        message:
          err.response?.data?.message ||
          'Social login failed',
      };
    }
  };

  // =====================================================
  // LOGOUT
  //
  // Notifies the server first so the sign-out is audited and any server-side
  // session state is released, then clears the local token. A failure here must
  // never trap the user in a half-signed-in state, so the local teardown runs
  // in a finally block.
  // =====================================================

  const logout = async () => {
    try {
      if (getStoredToken()) {
        await api.post('/auth/logout');
      }
    } catch (err) {
      // 401 just means the token already expired - the local session is
      // still cleared below.
      console.warn(
        '[Auth] server logout failed, clearing local session anyway',
        err.response?.status ?? err.message
      );
    } finally {
      clearStoredToken();

      setToken(null);
      setUser(null);
      setMembership(null);
    }
  };

  // =====================================================
  // PROVIDER
  // =====================================================

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        membership,

        // Normalized role of the current user ('' when logged out).
        role: normalizeRole(user?.role),

        login,
        register,
        socialLogin,
        logout,

        updateUser,

        refreshUser,
        refreshMembership,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// =====================================================
// useAuth
// =====================================================

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used within an AuthProvider'
    );
  }

  return context;
}