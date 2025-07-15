const fs = require('fs');
const path = require('path');

class BrandManagerError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'BrandManagerError';
    this.code = code;
    this.details = details;
  }
}

class BrandManager {
  constructor(assetsDir = 'assets') {
    this.assetsDir = path.resolve(assetsDir);
    this.supportedFormats = ['.svg', '.png', '.jpg', '.jpeg'];
    
    this.validateAssetsDirectory();
  }
  
  validateAssetsDirectory() {
    if (!fs.existsSync(this.assetsDir)) {
      throw new BrandManagerError(
        `Assets directory does not exist: ${this.assetsDir}`,
        'ASSETS_DIR_NOT_FOUND'
      );
    }
    
    if (!fs.statSync(this.assetsDir).isDirectory()) {
      throw new BrandManagerError(
        `Assets path is not a directory: ${this.assetsDir}`,
        'ASSETS_PATH_NOT_DIRECTORY'
      );
    }
  }
  
  sanitizeBrandName(name) {
    if (!name || typeof name !== 'string') {
      throw new BrandManagerError('Brand name must be a non-empty string', 'INVALID_BRAND_NAME');
    }
    
    return name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  
  sanitizeIconName(name) {
    if (!name || typeof name !== 'string') {
      throw new BrandManagerError('Icon name must be a non-empty string', 'INVALID_ICON_NAME');
    }
    
    return name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }
  
  getBrandDirectory(brandName) {
    const sanitizedBrand = this.sanitizeBrandName(brandName);
    return path.join(this.assetsDir, sanitizedBrand);
  }
  
  getAllBrands() {
    try {
      const items = fs.readdirSync(this.assetsDir);
      const brands = [];
      
      for (const item of items) {
        const itemPath = path.join(this.assetsDir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          brands.push({
            name: item,
            path: itemPath,
            iconCount: this.getIconCount(item)
          });
        }
      }
      
      return brands;
    } catch (error) {
      throw new BrandManagerError(
        `Failed to read brands: ${error.message}`,
        'READ_BRANDS_ERROR',
        { originalError: error }
      );
    }
  }
  
  createBrand(brandName) {
    const sanitizedBrand = this.sanitizeBrandName(brandName);
    const brandDir = this.getBrandDirectory(sanitizedBrand);
    
    if (fs.existsSync(brandDir)) {
      throw new BrandManagerError(
        `Brand directory already exists: ${brandDir}`,
        'BRAND_EXISTS'
      );
    }
    
    try {
      fs.mkdirSync(brandDir, { recursive: true });
      
      console.log(`✅ Created brand directory: ${brandDir}`);
      return {
        name: sanitizedBrand,
        path: brandDir,
        created: true
      };
    } catch (error) {
      throw new BrandManagerError(
        `Failed to create brand directory: ${error.message}`,
        'CREATE_BRAND_ERROR',
        { originalError: error }
      );
    }
  }
  
  removeBrand(brandName) {
    const sanitizedBrand = this.sanitizeBrandName(brandName);
    const brandDir = this.getBrandDirectory(sanitizedBrand);
    
    if (!fs.existsSync(brandDir)) {
      throw new BrandManagerError(
        `Brand directory does not exist: ${brandDir}`,
        'BRAND_NOT_FOUND'
      );
    }
    
    try {
      const icons = this.getIconsForBrand(sanitizedBrand);
      
      if (icons.length > 0) {
        console.log(`⚠️  Warning: Removing brand '${sanitizedBrand}' with ${icons.length} icons`);
      }
      
      fs.rmSync(brandDir, { recursive: true });
      
      console.log(`✅ Removed brand directory: ${brandDir}`);
      return {
        name: sanitizedBrand,
        path: brandDir,
        removed: true,
        iconCount: icons.length
      };
    } catch (error) {
      throw new BrandManagerError(
        `Failed to remove brand directory: ${error.message}`,
        'REMOVE_BRAND_ERROR',
        { originalError: error }
      );
    }
  }
  
  getIconsForBrand(brandName) {
    const sanitizedBrand = this.sanitizeBrandName(brandName);
    const brandDir = this.getBrandDirectory(sanitizedBrand);
    
    if (!fs.existsSync(brandDir)) {
      throw new BrandManagerError(
        `Brand directory does not exist: ${brandDir}`,
        'BRAND_NOT_FOUND'
      );
    }
    
    try {
      const items = fs.readdirSync(brandDir);
      const icons = [];
      
      for (const item of items) {
        const itemPath = path.join(brandDir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isFile()) {
          const ext = path.extname(item).toLowerCase();
          
          if (this.supportedFormats.includes(ext)) {
            icons.push({
              name: path.basename(item, ext),
              filename: item,
              path: itemPath,
              format: ext.slice(1),
              size: stat.size,
              modified: stat.mtime
            });
          }
        }
      }
      
      return icons.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      throw new BrandManagerError(
        `Failed to read icons for brand '${sanitizedBrand}': ${error.message}`,
        'READ_ICONS_ERROR',
        { originalError: error }
      );
    }
  }
  
  getIconCount(brandName) {
    try {
      const icons = this.getIconsForBrand(brandName);
      return icons.length;
    } catch (error) {
      return 0;
    }
  }
  
  addIconToBrand(brandName, iconName, content, format = 'svg') {
    const sanitizedBrand = this.sanitizeBrandName(brandName);
    const sanitizedIcon = this.sanitizeIconName(iconName);
    const brandDir = this.getBrandDirectory(sanitizedBrand);
    
    if (!fs.existsSync(brandDir)) {
      this.createBrand(sanitizedBrand);
    }
    
    const filename = `${sanitizedIcon}.${format}`;
    const iconPath = path.join(brandDir, filename);
    
    if (fs.existsSync(iconPath)) {
      throw new BrandManagerError(
        `Icon already exists: ${iconPath}`,
        'ICON_EXISTS'
      );
    }
    
    try {
      // Validate SVG content if format is svg
      if (format === 'svg' && !content.includes('<svg')) {
        throw new BrandManagerError(
          'Invalid SVG content',
          'INVALID_SVG_CONTENT'
        );
      }
      
      fs.writeFileSync(iconPath, content);
      
      console.log(`✅ Added icon: ${iconPath}`);
      return {
        brand: sanitizedBrand,
        name: sanitizedIcon,
        filename,
        path: iconPath,
        format,
        added: true
      };
    } catch (error) {
      throw new BrandManagerError(
        `Failed to add icon: ${error.message}`,
        'ADD_ICON_ERROR',
        { originalError: error }
      );
    }
  }
  
  removeIconFromBrand(brandName, iconName) {
    const sanitizedBrand = this.sanitizeBrandName(brandName);
    const sanitizedIcon = this.sanitizeIconName(iconName);
    const brandDir = this.getBrandDirectory(sanitizedBrand);
    
    if (!fs.existsSync(brandDir)) {
      throw new BrandManagerError(
        `Brand directory does not exist: ${brandDir}`,
        'BRAND_NOT_FOUND'
      );
    }
    
    // Find the icon file (check all supported formats)
    let iconPath = null;
    let format = null;
    
    for (const ext of this.supportedFormats) {
      const testPath = path.join(brandDir, `${sanitizedIcon}${ext}`);
      if (fs.existsSync(testPath)) {
        iconPath = testPath;
        format = ext.slice(1);
        break;
      }
    }
    
    if (!iconPath) {
      throw new BrandManagerError(
        `Icon not found: ${sanitizedIcon} in brand '${sanitizedBrand}'`,
        'ICON_NOT_FOUND'
      );
    }
    
    try {
      fs.unlinkSync(iconPath);
      
      console.log(`✅ Removed icon: ${iconPath}`);
      return {
        brand: sanitizedBrand,
        name: sanitizedIcon,
        path: iconPath,
        format,
        removed: true
      };
    } catch (error) {
      throw new BrandManagerError(
        `Failed to remove icon: ${error.message}`,
        'REMOVE_ICON_ERROR',
        { originalError: error }
      );
    }
  }
  
  getAllBrandIcons() {
    try {
      const brands = this.getAllBrands();
      const result = {};
      
      for (const brand of brands) {
        result[brand.name] = this.getIconsForBrand(brand.name);
      }
      
      return result;
    } catch (error) {
      throw new BrandManagerError(
        `Failed to get all brand icons: ${error.message}`,
        'GET_ALL_ICONS_ERROR',
        { originalError: error }
      );
    }
  }
  
  generateBrandSummary() {
    try {
      const brands = this.getAllBrands();
      const summary = {
        totalBrands: brands.length,
        totalIcons: 0,
        brands: {}
      };
      
      for (const brand of brands) {
        const icons = this.getIconsForBrand(brand.name);
        summary.totalIcons += icons.length;
        
        summary.brands[brand.name] = {
          iconCount: icons.length,
          path: brand.path,
          icons: icons.map(icon => ({
            name: icon.name,
            format: icon.format,
            size: icon.size
          }))
        };
      }
      
      return summary;
    } catch (error) {
      throw new BrandManagerError(
        `Failed to generate brand summary: ${error.message}`,
        'GENERATE_SUMMARY_ERROR',
        { originalError: error }
      );
    }
  }
}

module.exports = { BrandManager, BrandManagerError };