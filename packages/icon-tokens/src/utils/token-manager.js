const fs = require('fs');
const path = require('path');

class TokenManagerError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'TokenManagerError';
    this.code = code;
    this.details = details;
  }
}

class TokenManager {
  constructor(tokensDir = 'tokens') {
    this.tokensDir = path.resolve(tokensDir);
    this.tokensFile = path.join(this.tokensDir, 'icons.json');
    
    this.ensureTokensDirectory();
  }
  
  ensureTokensDirectory() {
    if (!fs.existsSync(this.tokensDir)) {
      fs.mkdirSync(this.tokensDir, { recursive: true });
    }
    
    if (!fs.existsSync(this.tokensFile)) {
      this.saveTokens({ icon: {} });
    }
  }
  
  loadTokens() {
    try {
      const content = fs.readFileSync(this.tokensFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { icon: {} };
      }
      throw new TokenManagerError(
        `Failed to load tokens: ${error.message}`,
        'LOAD_TOKENS_ERROR',
        { originalError: error }
      );
    }
  }
  
  saveTokens(tokens) {
    try {
      fs.writeFileSync(this.tokensFile, JSON.stringify(tokens, null, 2));
    } catch (error) {
      throw new TokenManagerError(
        `Failed to save tokens: ${error.message}`,
        'SAVE_TOKENS_ERROR',
        { originalError: error }
      );
    }
  }
  
  createTokenKey(brand, iconName) {
    if (!brand || !iconName) {
      throw new TokenManagerError(
        'Brand and icon name are required',
        'INVALID_TOKEN_PARAMS'
      );
    }
    
    return `${brand}-${iconName}`;
  }
  
  createTokenValue(brand, iconName, extension = 'svg') {
    return `${brand}/${iconName}.${extension}`;
  }
  
  addIconToken(brand, iconName, options = {}) {
    const tokens = this.loadTokens();
    const tokenKey = this.createTokenKey(brand, iconName);
    
    if (tokens.icon[tokenKey]) {
      throw new TokenManagerError(
        `Token already exists: ${tokenKey}`,
        'TOKEN_EXISTS'
      );
    }
    
    tokens.icon[tokenKey] = {
      value: this.createTokenValue(brand, iconName, options.extension),
      type: 'asset',
      description: options.description || `${iconName} icon for ${brand}`,
      brand: brand,
      name: iconName,
      originalName: options.originalName || iconName,
      ...options.metadata
    };
    
    this.saveTokens(tokens);
    
    return {
      key: tokenKey,
      token: tokens.icon[tokenKey],
      added: true
    };
  }
  
  updateIconToken(brand, iconName, updates = {}) {
    const tokens = this.loadTokens();
    const tokenKey = this.createTokenKey(brand, iconName);
    
    if (!tokens.icon[tokenKey]) {
      throw new TokenManagerError(
        `Token not found: ${tokenKey}`,
        'TOKEN_NOT_FOUND'
      );
    }
    
    const currentToken = tokens.icon[tokenKey];
    
    tokens.icon[tokenKey] = {
      ...currentToken,
      ...updates,
      // Always preserve core properties
      brand: brand,
      name: iconName,
      type: 'asset'
    };
    
    this.saveTokens(tokens);
    
    return {
      key: tokenKey,
      token: tokens.icon[tokenKey],
      updated: true
    };
  }
  
  removeIconToken(brand, iconName) {
    const tokens = this.loadTokens();
    const tokenKey = this.createTokenKey(brand, iconName);
    
    if (!tokens.icon[tokenKey]) {
      throw new TokenManagerError(
        `Token not found: ${tokenKey}`,
        'TOKEN_NOT_FOUND'
      );
    }
    
    const removedToken = tokens.icon[tokenKey];
    delete tokens.icon[tokenKey];
    
    this.saveTokens(tokens);
    
    return {
      key: tokenKey,
      token: removedToken,
      removed: true
    };
  }
  
  getIconToken(brand, iconName) {
    const tokens = this.loadTokens();
    const tokenKey = this.createTokenKey(brand, iconName);
    
    return tokens.icon[tokenKey] || null;
  }
  
  getTokensByBrand(brand) {
    const tokens = this.loadTokens();
    const brandTokens = {};
    
    Object.entries(tokens.icon).forEach(([key, token]) => {
      if (token.brand === brand) {
        brandTokens[key] = token;
      }
    });
    
    return brandTokens;
  }
  
  getAllBrands() {
    const tokens = this.loadTokens();
    const brands = new Set();
    
    Object.values(tokens.icon).forEach(token => {
      if (token.brand) {
        brands.add(token.brand);
      }
    });
    
    return Array.from(brands).sort();
  }
  
  getIconsForBrand(brand) {
    const brandTokens = this.getTokensByBrand(brand);
    
    return Object.values(brandTokens).map(token => ({
      name: token.name,
      originalName: token.originalName,
      description: token.description,
      value: token.value,
      key: this.createTokenKey(brand, token.name)
    }));
  }
  
  syncWithFileSystem(brandManager) {
    try {
      const tokens = this.loadTokens();
      const newTokens = { icon: {} };
      
      // Get all brand icons from file system
      const brandIcons = brandManager.getAllBrandIcons();
      
      Object.entries(brandIcons).forEach(([brand, icons]) => {
        icons.forEach(icon => {
          const tokenKey = this.createTokenKey(brand, icon.name);
          const existingToken = tokens.icon[tokenKey];
          
          newTokens.icon[tokenKey] = {
            value: this.createTokenValue(brand, icon.name, icon.format),
            type: 'asset',
            description: existingToken?.description || `${icon.name} icon for ${brand}`,
            brand: brand,
            name: icon.name,
            originalName: existingToken?.originalName || icon.name,
            lastModified: icon.modified,
            size: icon.size,
            format: icon.format
          };
        });
      });
      
      this.saveTokens(newTokens);
      
      return {
        success: true,
        totalTokens: Object.keys(newTokens.icon).length,
        brands: this.getAllBrands()
      };
      
    } catch (error) {
      throw new TokenManagerError(
        `Failed to sync with file system: ${error.message}`,
        'SYNC_ERROR',
        { originalError: error }
      );
    }
  }
  
  generateBrandTokens(brand, icons) {
    const brandTokens = { icon: {} };
    
    icons.forEach(icon => {
      const tokenKey = this.createTokenKey(brand, icon.name);
      
      brandTokens.icon[tokenKey] = {
        value: this.createTokenValue(brand, icon.name, icon.format),
        type: 'asset',
        description: `${icon.name} icon for ${brand}`,
        brand: brand,
        name: icon.name,
        originalName: icon.originalName || icon.name,
        filename: icon.filename,
        format: icon.format
      };
    });
    
    return brandTokens;
  }
  
  validateTokenStructure(tokens) {
    const errors = [];
    
    if (!tokens || typeof tokens !== 'object') {
      errors.push('Tokens must be an object');
      return errors;
    }
    
    if (!tokens.icon || typeof tokens.icon !== 'object') {
      errors.push('Tokens must have an "icon" property that is an object');
      return errors;
    }
    
    Object.entries(tokens.icon).forEach(([key, token]) => {
      if (!token.value) {
        errors.push(`Token "${key}" is missing required "value" property`);
      }
      
      if (!token.type) {
        errors.push(`Token "${key}" is missing required "type" property`);
      }
      
      if (!token.brand) {
        errors.push(`Token "${key}" is missing required "brand" property`);
      }
      
      if (!token.name) {
        errors.push(`Token "${key}" is missing required "name" property`);
      }
      
      // Validate key format
      const expectedKey = this.createTokenKey(token.brand, token.name);
      if (key !== expectedKey) {
        errors.push(`Token key "${key}" doesn't match expected format "${expectedKey}"`);
      }
    });
    
    return errors;
  }
  
  getBrandSummary() {
    const tokens = this.loadTokens();
    const summary = {
      totalTokens: Object.keys(tokens.icon).length,
      brands: {}
    };
    
    Object.values(tokens.icon).forEach(token => {
      if (!summary.brands[token.brand]) {
        summary.brands[token.brand] = {
          count: 0,
          icons: []
        };
      }
      
      summary.brands[token.brand].count++;
      summary.brands[token.brand].icons.push({
        name: token.name,
        originalName: token.originalName,
        value: token.value
      });
    });
    
    return summary;
  }
  
  exportBrandTokens(brand, outputPath) {
    const brandTokens = this.getTokensByBrand(brand);
    
    if (Object.keys(brandTokens).length === 0) {
      throw new TokenManagerError(
        `No tokens found for brand: ${brand}`,
        'NO_BRAND_TOKENS'
      );
    }
    
    const exportData = {
      brand: brand,
      generatedAt: new Date().toISOString(),
      tokenCount: Object.keys(brandTokens).length,
      tokens: { icon: brandTokens }
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
    
    return {
      brand: brand,
      outputPath: outputPath,
      tokenCount: Object.keys(brandTokens).length,
      exported: true
    };
  }
}

module.exports = { TokenManager, TokenManagerError };