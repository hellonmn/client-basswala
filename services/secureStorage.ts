import * as SecureStore from 'expo-secure-store';

/**
 * Secure Storage Service
 * Uses expo-secure-store for encrypted storage of sensitive data
 */

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_ID: 'user_id',
  USER_EMAIL: 'user_email',
} as const;

class SecureStorageService {
  /**
   * Save data securely
   */
  async save(key: string, value: any): Promise<void> {
    if (value === null || value === undefined) {
      console.warn(`SecureStore: refusing to save null/undefined for key ${key}`);
      return;
    }

    let stringValue: string;

    if (typeof value === 'string') {
      stringValue = value;
    } else {
      try {
        stringValue = JSON.stringify(value);
        console.warn(`SecureStore: auto-stringified non-string value for key ${key}`);
      } catch (err) {
        console.error(`SecureStore: cannot stringify value for key ${key}`, value, err);
        throw new Error(`Cannot save non-serializable value for key: ${key}`);
      }
    }

    try {
      await SecureStore.setItemAsync(key, stringValue);
    } catch (error) {
      console.error('SecureStore save error:', { key, error });
      throw error;
    }
  }

  /**
   * Retrieve data securely
   */
  async get(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error('Error reading from secure storage:', error);
      return null;
    }
  }

  /**
   * Delete data securely
   */
  async delete(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('Error deleting from secure storage:', error);
      throw new Error('Failed to delete data');
    }
  }

  /**
   * Save authentication tokens
   */
  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await this.save(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
    await this.save(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
  }

  /**
   * Get access token
   */
  async getAccessToken(): Promise<string | null> {
    return await this.get(STORAGE_KEYS.ACCESS_TOKEN);
  }

  /**
   * Get refresh token
   */
  async getRefreshToken(): Promise<string | null> {
    return await this.get(STORAGE_KEYS.REFRESH_TOKEN);
  }

  /**
   * Clear all authentication data
   */
  async clearAuth(): Promise<void> {
    await this.delete(STORAGE_KEYS.ACCESS_TOKEN);
    await this.delete(STORAGE_KEYS.REFRESH_TOKEN);
    await this.delete(STORAGE_KEYS.USER_ID);
    await this.delete(STORAGE_KEYS.USER_EMAIL);
  }

  /**
   * Save user data
   */
  async saveUserData(userId: string, email: string): Promise<void> {
    await this.save(STORAGE_KEYS.USER_ID, userId);
    await this.save(STORAGE_KEYS.USER_EMAIL, email);
  }

  /**
   * Get user ID
   */
  async getUserId(): Promise<string | null> {
    return await this.get(STORAGE_KEYS.USER_ID);
  }

  /**
   * Get user email
   */
  async getUserEmail(): Promise<string | null> {
    return await this.get(STORAGE_KEYS.USER_EMAIL);
  }
}

export const secureStorage = new SecureStorageService();
export { STORAGE_KEYS };