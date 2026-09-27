import axios from 'axios';

const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const TOKEN_STORAGE_KEY = 'shopvanguard_token';

export const getStoredToken = () => {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setStoredToken = (token) => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    /* storage unavailable (private mode) - fail closed */
  }
};

export const clearStoredToken = () => setStoredToken(null);

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Routes that must always carry a valid Authorization header.
const isAdminApiPath = (url = '') =>
  String(url).includes('/admin');

const isAuthApiPath = (url = '') =>
  String(url).includes('/auth') ||
  String(url).includes('/plans/my-status');

// Request interceptor: inject the JWT on EVERY request so no admin call
// can ever be sent without `Authorization: Bearer <JWT>`.
api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();

    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    } else if (isAdminApiPath(config.url)) {
      // Fail loudly in the console instead of silently producing a 401.
      console.error(
        '[AdminAPI] request BLOCKED - no JWT in localStorage for',
        config.method?.toUpperCase(),
        config.url
      );
    }

    if (isAdminApiPath(config.url)) {
      console.log('[AdminAPI] request', {
        method: (config.method || 'get').toUpperCase(),
        url: config.url,
        hasAuthHeader: Boolean(config.headers?.Authorization),
      });
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: log admin responses and surface auth failures.
api.interceptors.response.use(
  (response) => {
    if (isAdminApiPath(response.config?.url)) {
      console.log('[AdminAPI] response', {
        status: response.status,
        method: (response.config?.method || 'get').toUpperCase(),
        url: response.config?.url,
        success: response.data?.success,
      });
    }

    return response;
  },
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url;

    if (isAdminApiPath(url) || isAuthApiPath(url)) {
      console.error('[AdminAPI] response', {
        status: status ?? 'network-error',
        method: (error.config?.method || 'get').toUpperCase(),
        url,
        message: error.response?.data?.message || error.message,
      });
    }

    if (status === 401) {
      // The token is missing, expired or invalid. Drop it so AuthContext
      // re-hydrates from scratch instead of replaying a dead token.
      clearStoredToken();
      console.warn('[AdminAPI] 401 Unauthorized - clearing stored JWT for', url);
    }

    return Promise.reject(error);
  }
);

export default api;
