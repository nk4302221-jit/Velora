/**
 * Shared Razorpay Checkout SDK helper used by both the Checkout and Membership
 * pages. Loads the official checkout script once and opens the payment modal.
 */

const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const RAZORPAY_SCRIPT_ID = 'razorpay-checkout-script';

let scriptPromise = null;

/**
 * Ensures the Razorpay Checkout script is loaded exactly once and resolves with
 * the Razorpay constructor when window.Razorpay is ready.
 */
export function loadRazorpayCheckout() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout requires a browser environment'));
  }

  if (window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const done = () => {
      if (window.Razorpay) {
        resolve(window.Razorpay);
      } else {
        scriptPromise = null;
        reject(new Error('Razorpay SDK loaded but window.Razorpay is unavailable'));
      }
    };

    let script = document.getElementById(RAZORPAY_SCRIPT_ID);
    if (!script) {
      script = document.createElement('script');
      script.id = RAZORPAY_SCRIPT_ID;
      script.src = RAZORPAY_SCRIPT_SRC;
      script.async = true;
      script.onload = done;
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Failed to load the Razorpay Checkout script. Please check your connection and try again.'));
      };
      document.body.appendChild(script);
    } else if (window.Razorpay || (script.readyState && script.readyState === 'complete')) {
      done();
    } else {
      script.onload = done;
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Failed to load the Razorpay Checkout script. Please check your connection and try again.'));
      };
    }
  });

  return scriptPromise;
}

/**
 * Opens the Razorpay Checkout modal with the configured order details.
 *
 * Returns the Razorpay instance so callers can attach to gateway events.
 */
export function openRazorpayCheckout({
  keyId,
  razorpayOrderId,
  amount,
  currency = 'INR',
  name = 'Velora',
  description = '',
  prefill = {},
  theme = { color: '#2563eb' },
  onSuccess,
  onFailure,
  onDismiss,
}) {
  const options = {
    key: keyId,
    order_id: razorpayOrderId,
    amount,
    currency,
    name,
    description,
    prefill,
    theme,
    handler: async (response) => {
      if (typeof onSuccess === 'function') {
        await onSuccess(response);
      }
    },
    modal: {
      ondismiss: () => {
        if (typeof onDismiss === 'function') {
          onDismiss();
        }
      },
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', (resp) => {
    if (typeof onFailure === 'function') {
      onFailure(resp);
    }
  });
  rzp.open();
  return rzp;
}

export default {
  loadRazorpayCheckout,
  openRazorpayCheckout,
};