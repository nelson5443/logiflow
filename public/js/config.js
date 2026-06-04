// Environment configuration
const config = {
    API_BASE_URL: 'http://localhost:3001',
    FRONTEND_URL: 'http://localhost:3000',
    // Add retry logic for API calls
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000
};

// Make config available globally
window.APP_CONFIG = config;

// Helper function for API calls with retry logic
window.apiCall = async function(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : config.API_BASE_URL + url;
    
    for (let i = 0; i < config.MAX_RETRIES; i++) {
        try {
            const response = await fetch(fullUrl, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            return response;
        } catch (error) {
            console.log(`API call attempt ${i + 1} failed:`, error.message);
            if (i === config.MAX_RETRIES - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, config.RETRY_DELAY));
        }
    }
};