/**
 * API Service Selector
 * 
 * Automatically switches between mock and real API
 * Set USE_MOCK_API = true for testing without backend
 * Set USE_MOCK_API = false when backend is ready
 */

// ⚙️ CONFIGURATION - Change this to switch between mock and real API
const USE_MOCK_API = true; // Set to false when backend is ready

let apiService;

if (USE_MOCK_API) {
  // Use mock API for testing (no backend required)
  const { mockApiService } = require('./mockApi');
  apiService = mockApiService;
  
  if (__DEV__) {
    console.log('🔧 Using Mock API - No backend required');
    console.log('💡 To use real API: Set USE_MOCK_API = false in services/index.ts');
  }
} else {
  // Use real API
  const { apiService: realApiService } = require('./api');
  apiService = realApiService;
  
  if (__DEV__) {
    console.log('🌐 Using Real API');
    console.log('⚠️  Make sure your backend is running!');
  }
}

export { apiService };