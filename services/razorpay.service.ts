import RazorpayCheckout from 'react-native-razorpay';
import { RAZORPAY_CONFIG } from './razorpay.config';
import { apiService } from './api';

/**
 * Razorpay Payment Service
 * Handles payment processing, verification, and error handling
 */

export interface PaymentOptions {
  amount: number;           // Amount in rupees (will be converted to paise)
  email: string;
  contact: string;
  description: string;
  orderId?: string;         // Optional order ID from backend
  notes?: Record<string, any>;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  orderId?: string;
  signature?: string;
  error?: string;
}

class RazorpayServiceClass {
  /**
   * Process a payment using Razorpay
   */
  async processPayment(options: PaymentOptions): Promise<PaymentResult> {
    try {
      // Step 1: Create order on backend (if orderId not provided)
      let orderId = options.orderId;
      
      if (!orderId) {
        const orderResponse = await this.createOrder(
          options.amount,
          options.description
        );
        orderId = orderResponse.orderId;
      }

      // Step 2: Prepare Razorpay options
      const razorpayOptions = {
        description: options.description,
        image: RAZORPAY_CONFIG.IMAGE,
        currency: RAZORPAY_CONFIG.CURRENCY,
        key: RAZORPAY_CONFIG.KEY_ID,
        amount: options.amount * 100, // Convert to paise
        name: RAZORPAY_CONFIG.NAME,
        order_id: orderId,
        prefill: {
          email: options.email,
          contact: options.contact,
          method: RAZORPAY_CONFIG.PREFILL.method,
        },
        theme: {
          color: RAZORPAY_CONFIG.THEME_COLOR,
        },
        notes: options.notes || {},
        retry: RAZORPAY_CONFIG.RETRY,
      };

      // Step 3: Open Razorpay checkout
      const data = await RazorpayCheckout.open(razorpayOptions);

      console.log('Razorpay payment success:', data);

      // Step 4: Verify payment signature on backend
      const verified = await this.verifyPayment({
        orderId: data.razorpay_order_id,
        paymentId: data.razorpay_payment_id,
        signature: data.razorpay_signature,
      });

      if (!verified) {
        throw new Error('Payment verification failed');
      }

      return {
        success: true,
        paymentId: data.razorpay_payment_id,
        orderId: data.razorpay_order_id,
        signature: data.razorpay_signature,
      };
    } catch (error: any) {
      console.error('Razorpay payment error:', error);

      // Handle different error codes
      const errorMessage = this.getErrorMessage(error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Create an order on backend
   */
  private async createOrder(
    amount: number,
    description: string
  ): Promise<{ orderId: string; amount: number }> {
    try {
      // Call your backend API to create Razorpay order
      const response = await apiService.createPaymentOrder({
        amount: amount * 100, // Convert to paise
        currency: RAZORPAY_CONFIG.CURRENCY,
        receipt: `receipt_${Date.now()}`,
        notes: {
          description,
        },
      });

      return {
        orderId: response.orderId || response.id,
        amount: response.amount,
      };
    } catch (error: any) {
      console.error('Create order error:', error);
      throw new Error('Failed to create payment order');
    }
  }

  /**
   * Verify payment signature on backend
   */
  private async verifyPayment(data: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<boolean> {
    try {
      // Call your backend API to verify signature
      const response = await apiService.verifyPayment(data);
      return response.verified === true || response.success === true;
    } catch (error: any) {
      console.error('Payment verification error:', error);
      return false;
    }
  }

  /**
   * Get user-friendly error message
   */
  private getErrorMessage(error: any): string {
    // Razorpay error codes
    const errorCode = error.code;
    const description = error.description;

    // Map error codes to user-friendly messages
    const errorMessages: Record<string, string> = {
      0: 'Payment cancelled by user',
      1: 'Network error. Please check your internet connection',
      2: 'Payment processing failed. Please try again',
      BAD_REQUEST_ERROR: 'Invalid payment request',
      GATEWAY_ERROR: 'Payment gateway error. Please try again',
      SERVER_ERROR: 'Server error. Please try again later',
      PAYMENT_CANCELLED: 'Payment was cancelled',
      PAYMENT_FAILED: 'Payment failed. Please try again',
    };

    // Return specific error message or generic fallback
    if (errorCode && errorMessages[errorCode]) {
      return errorMessages[errorCode];
    }

    if (description) {
      return description;
    }

    return error.message || 'Payment failed. Please try again';
  }

  /**
   * Check if Razorpay is configured
   */
  isConfigured(): boolean {
    return (
      RAZORPAY_CONFIG.KEY_ID !== 'rzp_test_XXXXXXXXXXXXXXX' &&
      RAZORPAY_CONFIG.KEY_ID.length > 0
    );
  }

  /**
   * Get payment methods available
   */
  getAvailablePaymentMethods() {
    return {
      upi: true,
      card: true,
      netbanking: true,
      wallet: true,
      emi: false, // Enable if needed
      cardless_emi: false, // Enable if needed
      paylater: false, // Enable if needed
    };
  }
}

export const RazorpayService = new RazorpayServiceClass();