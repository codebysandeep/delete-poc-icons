const { FigmaApiService, FigmaApiError } = require('../services/figma-api');
const { BrandManager, BrandManagerError } = require('../utils/brand-manager');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file for local development
try {
  const envPath = path.join(process.cwd(), '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value && !process.env[key]) {
        process.env[key] = value.trim();
      }
    });
  }
} catch (error) {
  // Ignore errors when loading .env file
}

class FigmaSyncError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'FigmaSyncError';
    this.code = code;
    this.details = details;
  }
}

class FigmaIconSync {
  constructor(options = {}) {
    this.figmaFileKey = options.figmaFileKey || process.env.FIGMA_FILE_KEY;
    this.accessToken = options.accessToken || process.env.FIGMA_ACCESS_TOKEN;
    this.assetsDir = options.assetsDir || path.join(process.cwd(), 'assets');
    this.tokensDir = options.tokensDir || path.join(process.cwd(), 'tokens');
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    
    this.validateConfiguration();
    
    this.figmaApi = new FigmaApiService({
      accessToken: this.accessToken,
      retryAttempts: 3,
      retryDelay: 1000
    });
    
    this.brandManager = new BrandManager(this.assetsDir);
    
    this.syncStats = {
      startTime: null,
      endTime: null,
      totalBrands: 0,
      totalIcons: 0,
      added: 0,
      updated: 0,
      removed: 0,
      errors: []
    };
  }
  
  validateConfiguration() {
    if (!this.figmaFileKey) {
      throw new FigmaSyncError(
        'Figma file key is required. Set FIGMA_FILE_KEY environment variable.',
        'MISSING_FILE_KEY'
      );
    }
    
    if (!this.accessToken) {
      throw new FigmaSyncError(
        'Figma access token is required. Set FIGMA_ACCESS_TOKEN environment variable.',
        'MISSING_ACCESS_TOKEN'
      );
    }
    
    if (!fs.existsSync(this.tokensDir)) {
      fs.mkdirSync(this.tokensDir, { recursive: true });
    }
  }
  
  log(message, type = 'info') {
    if (!this.verbose && type === 'debug') return;
    
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : 
                  type === 'success' ? '✅' : 
                  type === 'warning' ? '⚠️' : 
                  type === 'debug' ? '🔍' : 'ℹ️';
    
    console.log(`${prefix} [${timestamp}] ${message}`);
  }
  
  async syncIcons() {
    try {
      this.syncStats.startTime = new Date();
      this.log('🚀 Starting Figma icon synchronization...');
      
      if (this.dryRun) {
        this.log('🔍 Running in dry-run mode - no files will be modified', 'warning');
      }
      
      // Get current state
      const currentBrands = this.brandManager.getAllBrands();
      const currentState = this.buildCurrentState(currentBrands);
      
      this.log(`📁 Found ${currentBrands.length} existing brands`);
      
      // Fetch from Figma
      this.log('📥 Fetching icons from Figma...');
      const figmaIcons = await this.figmaApi.getIconsByBrand(this.figmaFileKey);
      
      this.syncStats.totalBrands = Object.keys(figmaIcons).length;
      this.syncStats.totalIcons = Object.values(figmaIcons).reduce((sum, icons) => sum + icons.length, 0);
      
      this.log(`📊 Found ${this.syncStats.totalBrands} brands with ${this.syncStats.totalIcons} icons in Figma`);
      
      // Download and sync
      const downloadResults = await this.downloadAndSyncIcons(figmaIcons, currentState);
      
      // Update tokens
      await this.updateTokensFile(figmaIcons, downloadResults);
      
      // Generate summary
      this.syncStats.endTime = new Date();
      this.generateSyncReport(downloadResults);
      
      return {
        success: true,
        stats: this.syncStats,
        results: downloadResults
      };
      
    } catch (error) {
      this.syncStats.endTime = new Date();
      this.syncStats.errors.push({
        type: 'SYNC_ERROR',
        message: error.message,
        details: error.details || {}
      });
      
      this.log(`Sync failed: ${error.message}`, 'error');
      
      throw new FigmaSyncError(
        `Icon synchronization failed: ${error.message}`,
        'SYNC_FAILED',
        { originalError: error, stats: this.syncStats }
      );
    }
  }
  
  buildCurrentState(brands) {
    const state = {};
    
    for (const brand of brands) {
      try {
        const icons = this.brandManager.getIconsForBrand(brand.name);
        state[brand.name] = icons.reduce((acc, icon) => {
          acc[icon.name] = {
            filename: icon.filename,
            path: icon.path,
            size: icon.size,
            modified: icon.modified
          };
          return acc;
        }, {});
      } catch (error) {
        this.log(`Failed to read icons for brand '${brand.name}': ${error.message}`, 'error');
        state[brand.name] = {};
      }
    }
    
    return state;
  }
  
  async downloadAndSyncIcons(figmaIcons, currentState) {
    const results = {};
    
    for (const [brandName, icons] of Object.entries(figmaIcons)) {
      this.log(`🔄 Processing brand: ${brandName}`);
      
      results[brandName] = {
        added: [],
        updated: [],
        removed: [],
        errors: [],
        skipped: []
      };
      
      try {
        // Ensure brand directory exists
        if (!this.dryRun) {
          try {
            this.brandManager.createBrand(brandName);
          } catch (error) {
            if (error.code !== 'BRAND_EXISTS') {
              throw error;
            }
          }
        }
        
        // Download icons for this brand
        if (icons.length > 0) {
          const nodeIds = icons.map(icon => icon.id);
          
          try {
            const exportResult = await this.figmaApi.exportNodes(
              this.figmaFileKey, 
              nodeIds, 
              'svg'
            );
            
            // Process each icon
            for (const icon of icons) {
              try {
                await this.processIcon(
                  brandName,
                  icon,
                  exportResult.images[icon.id],
                  currentState[brandName] || {},
                  results[brandName]
                );
              } catch (error) {
                results[brandName].errors.push({
                  icon: icon.name,
                  error: error.message
                });
                this.syncStats.errors.push({
                  type: 'ICON_PROCESS_ERROR',
                  brand: brandName,
                  icon: icon.name,
                  message: error.message
                });
              }
            }
          } catch (error) {
            results[brandName].errors.push({
              brand: brandName,
              error: `Failed to export icons: ${error.message}`
            });
            this.syncStats.errors.push({
              type: 'EXPORT_ERROR',
              brand: brandName,
              message: error.message
            });
          }
        }
        
        // Handle removed icons
        await this.handleRemovedIcons(brandName, icons, currentState[brandName] || {}, results[brandName]);
        
      } catch (error) {
        results[brandName].errors.push({
          brand: brandName,
          error: error.message
        });
        this.syncStats.errors.push({
          type: 'BRAND_PROCESS_ERROR',
          brand: brandName,
          message: error.message
        });
      }
    }
    
    return results;
  }
  
  async processIcon(brandName, icon, exportUrl, currentIcons, results) {
    if (!exportUrl) {
      results.errors.push({
        icon: icon.name,
        error: 'No export URL provided by Figma'
      });
      return;
    }
    
    try {
      // Download SVG content
      const svgContent = await this.figmaApi.downloadSvg(exportUrl, icon.name);
      
      // Check if icon already exists
      const currentIcon = currentIcons[icon.name];
      const isUpdate = !!currentIcon;
      
      if (this.dryRun) {
        if (isUpdate) {
          results.updated.push({
            name: icon.name,
            originalName: icon.originalName,
            action: 'would-update'
          });
        } else {
          results.added.push({
            name: icon.name,
            originalName: icon.originalName,
            action: 'would-add'
          });
        }
        return;
      }
      
      // Save the icon
      const result = this.brandManager.addIconToBrand(
        brandName,
        icon.name,
        svgContent,
        'svg'
      );
      
      if (isUpdate) {
        results.updated.push({
          name: icon.name,
          originalName: icon.originalName,
          path: result.path,
          action: 'updated'
        });
        this.syncStats.updated++;
        this.log(`📝 Updated: ${brandName}/${icon.name}`, 'success');
      } else {
        results.added.push({
          name: icon.name,
          originalName: icon.originalName,
          path: result.path,
          action: 'added'
        });
        this.syncStats.added++;
        this.log(`➕ Added: ${brandName}/${icon.name}`, 'success');
      }
      
    } catch (error) {
      if (error.code === 'ICON_EXISTS') {
        // Icon exists but content might be different - this is an update
        try {
          // Remove existing and add new
          this.brandManager.removeIconFromBrand(brandName, icon.name);
          const result = this.brandManager.addIconToBrand(
            brandName,
            icon.name,
            svgContent,
            'svg'
          );
          
          results.updated.push({
            name: icon.name,
            originalName: icon.originalName,
            path: result.path,
            action: 'updated'
          });
          this.syncStats.updated++;
          this.log(`📝 Updated: ${brandName}/${icon.name}`, 'success');
        } catch (updateError) {
          throw updateError;
        }
      } else {
        throw error;
      }
    }
  }
  
  async handleRemovedIcons(brandName, figmaIcons, currentIcons, results) {
    const figmaIconNames = new Set(figmaIcons.map(icon => icon.name));
    const currentIconNames = Object.keys(currentIcons);
    
    for (const currentIconName of currentIconNames) {
      if (!figmaIconNames.has(currentIconName)) {
        if (this.dryRun) {
          results.removed.push({
            name: currentIconName,
            action: 'would-remove'
          });
        } else {
          try {
            const result = this.brandManager.removeIconFromBrand(brandName, currentIconName);
            results.removed.push({
              name: currentIconName,
              path: result.path,
              action: 'removed'
            });
            this.syncStats.removed++;
            this.log(`🗑️ Removed: ${brandName}/${currentIconName}`, 'warning');
          } catch (error) {
            results.errors.push({
              icon: currentIconName,
              error: `Failed to remove: ${error.message}`
            });
          }
        }
      }
    }
  }
  
  async updateTokensFile(figmaIcons, downloadResults) {
    if (this.dryRun) {
      this.log('🔍 Would update tokens file', 'debug');
      return;
    }
    
    try {
      const tokensFile = path.join(this.tokensDir, 'icons.json');
      const tokens = { icon: {} };
      
      for (const [brandName, icons] of Object.entries(figmaIcons)) {
        for (const icon of icons) {
          const tokenKey = `${brandName}-${icon.name}`;
          tokens.icon[tokenKey] = {
            value: `${brandName}/${icon.name}.svg`,
            type: 'asset',
            description: icon.description || `${icon.originalName} icon`,
            brand: brandName,
            name: icon.name,
            originalName: icon.originalName
          };
        }
      }
      
      fs.writeFileSync(tokensFile, JSON.stringify(tokens, null, 2));
      this.log(`📄 Updated tokens file: ${tokensFile}`, 'success');
      
    } catch (error) {
      this.log(`Failed to update tokens file: ${error.message}`, 'error');
      throw new FigmaSyncError(
        `Failed to update tokens file: ${error.message}`,
        'UPDATE_TOKENS_ERROR',
        { originalError: error }
      );
    }
  }
  
  generateSyncReport(results) {
    const duration = this.syncStats.endTime - this.syncStats.startTime;
    
    this.log('📊 Synchronization Summary:', 'success');
    this.log(`   Duration: ${duration}ms`);
    this.log(`   Brands: ${this.syncStats.totalBrands}`);
    this.log(`   Icons: ${this.syncStats.totalIcons}`);
    this.log(`   Added: ${this.syncStats.added}`);
    this.log(`   Updated: ${this.syncStats.updated}`);
    this.log(`   Removed: ${this.syncStats.removed}`);
    this.log(`   Errors: ${this.syncStats.errors.length}`);
    
    if (this.syncStats.errors.length > 0) {
      this.log('⚠️ Errors encountered:', 'warning');
      for (const error of this.syncStats.errors) {
        this.log(`   ${error.type}: ${error.message}`, 'error');
      }
    }
    
    // Brand-specific summary
    for (const [brandName, brandResults] of Object.entries(results)) {
      const total = brandResults.added.length + brandResults.updated.length + brandResults.removed.length;
      if (total > 0 || brandResults.errors.length > 0) {
        this.log(`📁 ${brandName}: +${brandResults.added.length} ~${brandResults.updated.length} -${brandResults.removed.length}${brandResults.errors.length > 0 ? ` (${brandResults.errors.length} errors)` : ''}`);
      }
    }
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--file-key':
        options.figmaFileKey = args[++i];
        break;
      case '--token':
        options.accessToken = args[++i];
        break;
      case '--assets-dir':
        options.assetsDir = args[++i];
        break;
      case '--help':
        console.log(`
Usage: node sync-figma-icons.js [options]

Options:
  --dry-run          Run without making changes
  --verbose          Enable verbose logging
  --file-key <key>   Figma file key (or set FIGMA_FILE_KEY env var)
  --token <token>    Figma access token (or set FIGMA_ACCESS_TOKEN env var)
  --assets-dir <dir> Assets directory path (default: ./assets)
  --help             Show this help message
        `);
        process.exit(0);
        break;
    }
  }
  
  try {
    const sync = new FigmaIconSync(options);
    const result = await sync.syncIcons();
    
    if (result.success) {
      console.log('✅ Synchronization completed successfully!');
      process.exit(0);
    } else {
      console.log('❌ Synchronization completed with errors');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Synchronization failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { FigmaIconSync, FigmaSyncError };