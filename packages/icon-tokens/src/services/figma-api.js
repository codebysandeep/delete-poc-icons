const axios = require('axios');
const fs = require('fs');
const path = require('path');

class FigmaApiError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'FigmaApiError';
    this.code = code;
    this.details = details;
  }
}

class FigmaApiService {
  constructor(options = {}) {
    this.accessToken = options.accessToken || process.env.FIGMA_ACCESS_TOKEN;
    this.baseUrl = 'https://api.figma.com/v1';
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.rateLimit = options.rateLimit || 100; // requests per minute
    this.requestQueue = [];
    this.lastRequestTime = 0;
    
    if (!this.accessToken) {
      throw new FigmaApiError('Figma access token is required', 'MISSING_TOKEN');
    }
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'X-Figma-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    
    this.setupInterceptors();
  }
  
  setupInterceptors() {
    // Request interceptor for rate limiting
    this.client.interceptors.request.use(
      async (config) => {
        await this.rateLimitRequest();
        return config;
      },
      (error) => Promise.reject(error)
    );
    
    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          throw new FigmaApiError(
            `Figma API error: ${data.err || data.message || 'Unknown error'}`,
            `HTTP_${status}`,
            { status, data }
          );
        } else if (error.request) {
          throw new FigmaApiError(
            'Network error: Unable to reach Figma API',
            'NETWORK_ERROR',
            { originalError: error.message }
          );
        } else {
          throw new FigmaApiError(
            'Request configuration error',
            'CONFIG_ERROR',
            { originalError: error.message }
          );
        }
      }
    );
  }
  
  async rateLimitRequest() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 60000 / this.rateLimit; // milliseconds between requests
    
    if (timeSinceLastRequest < minInterval) {
      const delay = minInterval - timeSinceLastRequest;
      await this.sleep(delay);
    }
    
    this.lastRequestTime = Date.now();
  }
  
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async retryRequest(requestFn, attempts = this.retryAttempts) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await requestFn();
      } catch (error) {
        if (i === attempts - 1) throw error;
        
        // Don't retry on authentication errors
        if (error.code === 'HTTP_401' || error.code === 'HTTP_403') {
          throw error;
        }
        
        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, i);
        console.log(`Request failed (attempt ${i + 1}/${attempts}), retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }
  }
  
  validateFileKey(fileKey) {
    if (!fileKey || typeof fileKey !== 'string') {
      throw new FigmaApiError('File key must be a non-empty string', 'INVALID_FILE_KEY');
    }
    
    // Basic validation for Figma file key format
    if (!/^[a-zA-Z0-9]{22}$/.test(fileKey)) {
      throw new FigmaApiError('Invalid Figma file key format', 'INVALID_FILE_KEY_FORMAT');
    }
    
    return fileKey;
  }
  
  async getFile(fileKey) {
    this.validateFileKey(fileKey);
    
    return this.retryRequest(async () => {
      const response = await this.client.get(`/files/${fileKey}`);
      return response.data;
    });
  }
  
  async getFileNodes(fileKey, nodeIds) {
    this.validateFileKey(fileKey);
    
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
      throw new FigmaApiError('Node IDs must be a non-empty array', 'INVALID_NODE_IDS');
    }
    
    const ids = nodeIds.join(',');
    
    return this.retryRequest(async () => {
      const response = await this.client.get(`/files/${fileKey}/nodes`, {
        params: { ids }
      });
      return response.data;
    });
  }
  
  async getFileComponents(fileKey) {
    this.validateFileKey(fileKey);
    
    return this.retryRequest(async () => {
      const response = await this.client.get(`/files/${fileKey}/components`);
      return response.data;
    });
  }
  
  async exportNodes(fileKey, nodeIds, format = 'svg', options = {}) {
    this.validateFileKey(fileKey);
    
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
      throw new FigmaApiError('Node IDs must be a non-empty array', 'INVALID_NODE_IDS');
    }
    
    const validFormats = ['svg', 'png', 'jpg', 'pdf'];
    if (!validFormats.includes(format)) {
      throw new FigmaApiError(`Invalid format. Must be one of: ${validFormats.join(', ')}`, 'INVALID_FORMAT');
    }
    
    const params = {
      ids: nodeIds.join(','),
      format,
      ...options
    };
    
    return this.retryRequest(async () => {
      const response = await this.client.get(`/images/${fileKey}`, { params });
      return response.data;
    });
  }
  
  async downloadSvg(url, filename) {
    if (!url || !filename) {
      throw new FigmaApiError('URL and filename are required for SVG download', 'MISSING_DOWNLOAD_PARAMS');
    }
    
    return this.retryRequest(async () => {
      const response = await axios.get(url, {
        timeout: 30000,
        responseType: 'text'
      });
      
      // Basic SVG validation
      if (!response.data.includes('<svg')) {
        throw new FigmaApiError('Downloaded content is not a valid SVG', 'INVALID_SVG_CONTENT');
      }
      
      return response.data;
    });
  }
  
  async getIconsByBrand(fileKey) {
    try {
      const file = await this.getFile(fileKey);
      const components = await this.getFileComponents(fileKey);
      
      const brandIcons = {};
      
      // Process each page as a brand
      for (const page of file.document.children) {
        const brandName = this.sanitizeBrandName(page.name);
        brandIcons[brandName] = [];
        
        // Find components on this page
        const pageComponents = Object.values(components.meta.components)
          .filter(component => {
            // Check if component is on this page by traversing the node tree
            return this.isComponentOnPage(component, page, file.document);
          });
        
        // Process each component
        for (const component of pageComponents) {
          const iconName = this.sanitizeIconName(component.name);
          
          brandIcons[brandName].push({
            id: component.node_id,
            name: iconName,
            description: component.description || '',
            componentId: component.key,
            originalName: component.name
          });
        }
      }
      
      return brandIcons;
    } catch (error) {
      throw new FigmaApiError(
        `Failed to get icons by brand: ${error.message}`,
        'GET_ICONS_BY_BRAND_ERROR',
        { originalError: error }
      );
    }
  }
  
  isComponentOnPage(component, page, document) {
    // Simple check - in a real implementation, you'd want to traverse the tree
    // For now, we'll use a basic approach
    return true; // Placeholder - implement proper page detection
  }
  
  sanitizeBrandName(name) {
    return name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  
  sanitizeIconName(name) {
    return name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  
  async downloadIconsByBrand(fileKey, outputDir = 'assets') {
    try {
      const brandIcons = await this.getIconsByBrand(fileKey);
      const downloadResults = {};
      
      for (const [brandName, icons] of Object.entries(brandIcons)) {
        const brandDir = path.join(outputDir, brandName);
        
        // Create brand directory
        if (!fs.existsSync(brandDir)) {
          fs.mkdirSync(brandDir, { recursive: true });
        }
        
        downloadResults[brandName] = {
          success: [],
          errors: []
        };
        
        // Export all icons for this brand
        if (icons.length > 0) {
          const nodeIds = icons.map(icon => icon.id);
          
          try {
            const exportResult = await this.exportNodes(fileKey, nodeIds, 'svg');
            
            // Download each exported SVG
            for (const icon of icons) {
              const exportUrl = exportResult.images[icon.id];
              
              if (exportUrl) {
                try {
                  const svgContent = await this.downloadSvg(exportUrl, icon.name);
                  const filePath = path.join(brandDir, `${icon.name}.svg`);
                  
                  fs.writeFileSync(filePath, svgContent);
                  
                  downloadResults[brandName].success.push({
                    name: icon.name,
                    path: filePath,
                    originalName: icon.originalName
                  });
                } catch (downloadError) {
                  downloadResults[brandName].errors.push({
                    name: icon.name,
                    error: downloadError.message
                  });
                }
              } else {
                downloadResults[brandName].errors.push({
                  name: icon.name,
                  error: 'No export URL provided by Figma'
                });
              }
            }
          } catch (exportError) {
            downloadResults[brandName].errors.push({
              brand: brandName,
              error: `Failed to export icons: ${exportError.message}`
            });
          }
        }
      }
      
      return downloadResults;
    } catch (error) {
      throw new FigmaApiError(
        `Failed to download icons by brand: ${error.message}`,
        'DOWNLOAD_ICONS_ERROR',
        { originalError: error }
      );
    }
  }
}

module.exports = { FigmaApiService, FigmaApiError };