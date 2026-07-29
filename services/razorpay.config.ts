/**
 * Razorpay Configuration
 *
 * Set EXPO_PUBLIC_RAZORPAY_KEY_ID in app.json `extra` or .env to override.
 * The fallback value is the TEST key — replace it with rzp_live_... before
 * publishing to the Play Store.
 */

export const RAZORPAY_CONFIG = {
  // Read from env so prod builds get the live key without a code change.
  KEY_ID: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_SNBCOOU6Zp2Ng2',
  
  // Company details
  NAME: 'BASSWALA DJ Rental',
  DESCRIPTION: 'Professional DJ Equipment Rental',
  IMAGE: 'https://your-logo-url.com/logo.png', // Replace with your logo
  CURRENCY: 'INR',
  
  // Theming
  THEME_COLOR: '#02023E',
  
  // Prefill options
  PREFILL: {
    method: 'upi', // upi, card, netbanking, wallet
  },
  
  // Modal settings
  MODAL: {
    ondismiss: () => {
      console.log('Razorpay modal dismissed');
    },
    escape: true,
    backdropclose: false,
  },
  
  // Retry settings
  RETRY: {
    enabled: true,
    max_count: 3,
  },
};

// Test credentials
export const TEST_CREDENTIALS = {
  CARDS: {
    SUCCESS: {
      number: '4111111111111111',
      cvv: '123',
      expiry: '12/28',
      name: 'Test User',
    },
    FAILURE: {
      number: '4000000000000002',
      cvv: '123',
      expiry: '12/28',
      name: 'Test User',
    },
  },
  UPI: {
    SUCCESS: 'success@razorpay',
    FAILURE: 'failure@razorpay',
  },
};