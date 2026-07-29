/**
 * MOCK AUTH SERVICE - FOR TESTING WITHOUT BACKEND
 * 
 * This file provides mock authentication that works without a real backend.
 * Replace services/api.ts with this for testing, or keep both and switch as needed.
 */

import { secureStorage } from './secureStorage';

// Simulate network delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock user database (in-memory, resets on app restart)
const mockUsers: any[] = [];

/**
 * Mock API Service - Works without backend
 */
class MockApiService {
  
  // ========== AUTH ENDPOINTS ==========

  async register(email: string, password: string, name: string) {
    await delay(1000); // Simulate network delay
    
    // Check if user already exists
    const existingUser = mockUsers.find(u => u.email === email);
    if (existingUser) {
      throw new Error('Email already registered');
    }
    
    // Create new user
    const newUser = {
      id: `user_${Date.now()}`,
      email,
      name,
      createdAt: new Date().toISOString(),
    };
    
    mockUsers.push(newUser);
    
    // Generate mock tokens
    const accessToken = `mock_access_${Date.now()}`;
    const refreshToken = `mock_refresh_${Date.now()}`;
    
    return {
      user: newUser,
      accessToken,
      refreshToken,
    };
  }

  async login(email: string, password: string) {
    await delay(1000);
    
    // Find user
    const user = mockUsers.find(u => u.email === email);
    
    // For testing: accept any password if user exists, or create demo user
    if (!user) {
      // Create demo user on first login
      if (email === 'demo@example.com' || mockUsers.length === 0) {
        return this.register(email, password, 'Demo User');
      }
      throw new Error('User not found. Please register first.');
    }
    
    // Generate mock tokens
    const accessToken = `mock_access_${Date.now()}`;
    const refreshToken = `mock_refresh_${Date.now()}`;
    
    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  async logout() {
    await delay(500);
    await secureStorage.clearAuth();
    return { message: 'Logged out successfully' };
  }

  async resetPassword(email: string) {
    await delay(1000);
    
    const user = mockUsers.find(u => u.email === email);
    if (!user) {
      throw new Error('Email not found');
    }
    
    return {
      message: 'Password reset email sent (mock)',
    };
  }

  async verifyEmail(token: string) {
    await delay(500);
    return {
      message: 'Email verified (mock)',
    };
  }

  // ========== USER ENDPOINTS ==========

  async getProfile() {
    await delay(500);
    
    const userId = await secureStorage.getUserId();
    const user = mockUsers.find(u => u.id === userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return user;
  }

  async updateProfile(data: any) {
    await delay(500);
    
    const userId = await secureStorage.getUserId();
    const userIndex = mockUsers.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      throw new Error('User not found');
    }
    
    mockUsers[userIndex] = {
      ...mockUsers[userIndex],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    
    return mockUsers[userIndex];
  }

  // ========== DJ EQUIPMENT ENDPOINTS (Mock Data) ==========

  async getEquipment(params?: { category?: string; search?: string }) {
    await delay(800);
    
    const mockEquipment = [
      {
        id: '1',
        name: 'Pioneer DDJ-1000',
        category: 'DJ Controller',
        price: 150,
        image: 'https://via.placeholder.com/300x200',
        available: true,
      },
      {
        id: '2',
        name: 'Technics SL-1200',
        category: 'Turntable',
        price: 100,
        image: 'https://via.placeholder.com/300x200',
        available: true,
      },
      {
        id: '3',
        name: 'JBL EON615',
        category: 'Speaker',
        price: 80,
        image: 'https://via.placeholder.com/300x200',
        available: true,
      },
    ];
    
    return mockEquipment;
  }

  async getEquipmentById(id: string) {
    await delay(500);
    
    const equipment = {
      id,
      name: 'Pioneer DDJ-1000',
      category: 'DJ Controller',
      price: 150,
      description: '4-channel professional DJ controller',
      image: 'https://via.placeholder.com/600x400',
      available: true,
      specifications: {
        channels: 4,
        effects: 'Beat FX',
        connectivity: 'USB',
      },
    };
    
    return equipment;
  }

  // ========== RENTAL ENDPOINTS ==========

  async createRental(data: {
    equipmentId: string;
    startDate: string;
    endDate: string;
    deliveryAddress?: string;
  }) {
    await delay(1000);
    
    const rental = {
      id: `rental_${Date.now()}`,
      ...data,
      status: 'pending',
      createdAt: new Date().toISOString(),
      totalPrice: 450, // Mock calculation
    };
    
    return rental;
  }

  async getRentals(params?: { status?: string }) {
    await delay(500);
    
    const mockRentals = [
      {
        id: 'rental_1',
        equipmentId: '1',
        equipmentName: 'Pioneer DDJ-1000',
        startDate: '2024-03-01',
        endDate: '2024-03-03',
        status: 'active',
        totalPrice: 450,
      },
    ];
    
    return mockRentals;
  }

  async getRentalById(id: string) {
    await delay(500);
    
    const rental = {
      id,
      equipmentId: '1',
      equipmentName: 'Pioneer DDJ-1000',
      startDate: '2024-03-01',
      endDate: '2024-03-03',
      status: 'active',
      totalPrice: 450,
      deliveryAddress: '123 Main St',
    };
    
    return rental;
  }

  async cancelRental(id: string) {
    await delay(500);
    
    return {
      message: 'Rental cancelled successfully (mock)',
    };
  }

  // ========== PAYMENT ENDPOINTS ==========

  async createPaymentIntent(rentalId: string) {
    await delay(1000);
    
    return {
      paymentIntentId: `pi_mock_${Date.now()}`,
      clientSecret: 'mock_secret',
      amount: 450,
    };
  }

  async confirmPayment(paymentIntentId: string) {
    await delay(1000);
    
    return {
      status: 'succeeded',
      message: 'Payment successful (mock)',
    };
  }
}

export const mockApiService = new MockApiService();

// Export as apiService for easy replacement
export const apiService = mockApiService;