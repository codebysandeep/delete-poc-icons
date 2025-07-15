// Multi-Brand Icon Tokens Configuration
const fs = require('fs');
const path = require('path');
const { BrandManager } = require('./src/utils/brand-manager');

class MultiBrandBuilder {
  constructor(options = {}) {
    this.assetsDir = options.assetsDir || path.join(process.cwd(), 'assets');
    this.tokensDir = options.tokensDir || path.join(process.cwd(), 'tokens');
    this.distDir = options.distDir || path.join(process.cwd(), 'dist');
    this.platform = options.platform || 'all';
    this.brands = options.brands || [];
    this.verbose = options.verbose || false;
    
    this.brandManager = new BrandManager(this.assetsDir);
    this.buildStats = {
      startTime: null,
      endTime: null,
      totalBrands: 0,
      totalIcons: 0,
      errors: []
    };
  }
  
  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }
  
  async loadDependencies() {
    this.log('Loading dependencies...');
    
    try {
      const StyleDictionaryModule = require('style-dictionary');
      this.StyleDictionary = StyleDictionaryModule.default || StyleDictionaryModule;
      this.log('✅ style-dictionary loaded');
    } catch (error) {
      throw new Error(`Failed to load style-dictionary: ${error.message}`);
    }
    
    try {
      this.sharp = require('sharp');
      this.log('✅ sharp loaded');
    } catch (error) {
      throw new Error(`Failed to load sharp: ${error.message}`);
    }
    
    try {
      const webfontModule = require('webfont');
      this.webfont = webfontModule.webfont;
      this.log('✅ webfont loaded');
    } catch (error) {
      throw new Error(`Failed to load webfont: ${error.message}`);
    }
  }
  
  async validateSetup() {
    this.log('Validating setup...');
    
    if (!fs.existsSync(this.assetsDir)) {
      throw new Error(`Assets directory not found: ${this.assetsDir}`);
    }
    
    const tokensFile = path.join(this.tokensDir, 'icons.json');
    if (!fs.existsSync(tokensFile)) {
      this.log(`Tokens file not found: ${tokensFile}, creating empty one...`);
      if (!fs.existsSync(this.tokensDir)) {
        fs.mkdirSync(this.tokensDir, { recursive: true });
      }
      fs.writeFileSync(tokensFile, JSON.stringify({ icon: {} }, null, 2));
    }
    
    if (!fs.existsSync(this.distDir)) {
      fs.mkdirSync(this.distDir, { recursive: true });
      this.log(`Created output directory: ${this.distDir}`, 'success');
    }
  }
  
  getBrandsToProcess() {
    if (this.brands.length > 0) {
      return this.brands;
    }
    
    const allBrands = this.brandManager.getAllBrands();
    return allBrands.filter(brand => brand.iconCount > 0).map(brand => brand.name);
  }
  
  async build() {
    try {
      this.buildStats.startTime = new Date();
      this.log('🚀 Starting multi-brand icon build process...');
      this.log(`Platform: ${this.platform}`);
      this.log(`Working directory: ${process.cwd()}`);
      
      await this.loadDependencies();
      await this.validateSetup();
      
      const brandsToProcess = this.getBrandsToProcess();
      
      if (brandsToProcess.length === 0) {
        this.log('No brands with icons found to process', 'error');
        return false;
      }
      
      this.buildStats.totalBrands = brandsToProcess.length;
      this.log(`Found ${brandsToProcess.length} brands to process: ${brandsToProcess.join(', ')}`);
      
      const buildPromises = brandsToProcess.map(brand => this.buildBrand(brand));
      const results = await Promise.allSettled(buildPromises);
      
      // Check results
      let successCount = 0;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          this.buildStats.errors.push({
            brand: brandsToProcess[index],
            error: result.reason.message
          });
          this.log(`Failed to build brand '${brandsToProcess[index]}': ${result.reason.message}`, 'error');
        }
      });
      
      this.buildStats.endTime = new Date();
      this.generateBuildReport(successCount, brandsToProcess.length);
      
      return successCount === brandsToProcess.length;
      
    } catch (error) {
      this.buildStats.endTime = new Date();
      this.log(`Build failed: ${error.message}`, 'error');
      this.log(`Stack trace: ${error.stack}`, 'error');
      return false;
    }
  }
  
  async buildBrand(brandName) {
    try {
      this.log(`🔨 Building brand: ${brandName}`);
      
      const brandIcons = this.brandManager.getIconsForBrand(brandName);
      
      if (brandIcons.length === 0) {
        this.log(`No icons found for brand: ${brandName}`, 'error');
        return;
      }
      
      this.buildStats.totalIcons += brandIcons.length;
      this.log(`Found ${brandIcons.length} icons for brand: ${brandName}`);
      
      // Create brand-specific output directory
      const brandDistDir = path.join(this.distDir, brandName);
      if (!fs.existsSync(brandDistDir)) {
        fs.mkdirSync(brandDistDir, { recursive: true });
      }
      
      // Build Style Dictionary tokens for this brand
      await this.buildStyleDictionary(brandName, brandIcons, brandDistDir);
      
      // Generate additional outputs
      if (this.platform === 'all' || this.platform === 'svg') {
        await this.generateSVGFiles(brandName, brandIcons, brandDistDir);
      }
      
      if (this.platform === 'all' || this.platform === 'png') {
        await this.generatePNGFiles(brandName, brandIcons, brandDistDir);
      }
      
      if (this.platform === 'all' || this.platform === 'font') {
        await this.generateFontFiles(brandName, brandIcons, brandDistDir);
      }
      
      if (this.platform === 'all' || this.platform === 'webcomponent') {
        await this.generateWebComponents(brandName, brandIcons, brandDistDir);
      }
      
      // Generate package.json for this brand
      await this.generatePackageJson(brandName, brandIcons, brandDistDir);
      
      this.log(`✅ Completed brand: ${brandName}`, 'success');
      
    } catch (error) {
      this.log(`Failed to build brand '${brandName}': ${error.message}`, 'error');
      throw error;
    }
  }
  
  async buildStyleDictionary(brandName, icons, brandDistDir) {
    try {
      // Create brand-specific tokens
      const brandTokens = { icon: {} };
      
      icons.forEach(icon => {
        brandTokens.icon[icon.name] = {
          value: `${brandName}/${icon.filename}`,
          type: 'asset',
          description: `${icon.name} icon for ${brandName}`,
          brand: brandName,
          name: icon.name,
          filename: icon.filename
        };
      });
      
      // Write temporary tokens file for this brand
      const brandTokensFile = path.join(brandDistDir, 'tokens.json');
      fs.writeFileSync(brandTokensFile, JSON.stringify(brandTokens, null, 2));
      
      // Style Dictionary configuration
      const config = {
        source: [brandTokensFile],
        platforms: {}
      };
      
      if (this.platform === 'all' || this.platform === 'svg') {
        config.platforms.svg = {
          transformGroup: 'js',
          buildPath: path.join(brandDistDir, 'svg') + path.sep,
          files: [{
            destination: 'icons.js',
            format: 'javascript/es6'
          }]
        };
      }
      
      // Build with Style Dictionary
      const sd = new this.StyleDictionary(config);
      await sd.buildAllPlatforms();
      
      // Clean up temporary tokens file
      fs.unlinkSync(brandTokensFile);
      
      this.log(`Built Style Dictionary for brand: ${brandName}`, 'success');
      
    } catch (error) {
      this.log(`Style Dictionary build failed for brand '${brandName}': ${error.message}`, 'error');
      throw error;
    }
  }
  
  async generateSVGFiles(brandName, icons, brandDistDir) {
    try {
      this.log(`Generating SVG files for brand: ${brandName}`);
      const svgDir = path.join(brandDistDir, 'svg');
      
      if (!fs.existsSync(svgDir)) {
        fs.mkdirSync(svgDir, { recursive: true });
      }
      
      icons.forEach(icon => {
        const destPath = path.join(svgDir, icon.filename);
        fs.copyFileSync(icon.path, destPath);
        this.log(`Copied ${icon.filename} to ${destPath}`, 'success');
      });
      
    } catch (error) {
      this.log(`SVG generation failed for brand '${brandName}': ${error.message}`, 'error');
      throw error;
    }
  }
  
  async generatePNGFiles(brandName, icons, brandDistDir) {
    try {
      this.log(`Generating PNG files for brand: ${brandName}`);
      const pngDir = path.join(brandDistDir, 'png');
      
      if (!fs.existsSync(pngDir)) {
        fs.mkdirSync(pngDir, { recursive: true });
      }
      
      const sizes = [16, 24, 32, 48, 64];
      
      for (const icon of icons) {
        if (icon.format === 'svg') {
          for (const size of sizes) {
            const pngPath = path.join(pngDir, `${icon.name}-${size}.png`);
            await this.sharp(icon.path)
              .resize(size, size)
              .png()
              .toFile(pngPath);
            this.log(`Generated ${icon.name}-${size}.png`, 'success');
          }
        }
      }
      
    } catch (error) {
      this.log(`PNG generation failed for brand '${brandName}': ${error.message}`, 'error');
      throw error;
    }
  }
  
  async generateFontFiles(brandName, icons, brandDistDir) {
    try {
      this.log(`Generating font files for brand: ${brandName}`);
      const fontDir = path.join(brandDistDir, 'fonts');
      
      if (!fs.existsSync(fontDir)) {
        fs.mkdirSync(fontDir, { recursive: true });
      }
      
      const brandAssetsDir = this.brandManager.getBrandDirectory(brandName);
      
      // Change working directory temporarily for webfont
      const originalCwd = process.cwd();
      process.chdir(brandAssetsDir);
      
      this.log(`Changed to brand assets directory: ${brandAssetsDir}`);
      
      const fontName = `${brandName.charAt(0).toUpperCase() + brandName.slice(1)}IconFont`;
      
      const result = await this.webfont({
        files: '*.svg',
        fontName: fontName,
        formats: ['woff2', 'woff', 'ttf'],
        normalize: true,
        fontHeight: 1000,
        descent: 150,
        startUnicode: 0xe000,
      });
      
      // Restore original working directory
      process.chdir(originalCwd);
      
      // Write font files
      const formats = ['woff2', 'woff', 'ttf'];
      for (const format of formats) {
        if (result[format]) {
          const filePath = path.join(fontDir, `${fontName}.${format}`);
          fs.writeFileSync(filePath, result[format]);
          this.log(`Generated ${fontName}.${format}`, 'success');
        }
      }
      
      // Generate CSS
      const cssClasses = icons.map((icon, index) => {
        const unicodeValue = (0xe000 + index).toString(16).toUpperCase();
        return `.icon-${icon.name}::before { content: "\\${unicodeValue}"; }`;
      }).join('\n');
      
      const cssContent = `@font-face {
  font-family: '${fontName}';
  src: url('./${fontName}.woff2') format('woff2'),
       url('./${fontName}.woff') format('woff'),
       url('./${fontName}.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}

.icon {
  font-family: '${fontName}';
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  line-height: 1;
}

${cssClasses}`;
      
      fs.writeFileSync(path.join(fontDir, `${fontName}.css`), cssContent);
      this.log(`Generated ${fontName}.css`, 'success');
      
    } catch (error) {
      this.log(`Font generation failed for brand '${brandName}': ${error.message}`, 'error');
      throw error;
    }
  }
  
  async generateWebComponents(brandName, icons, brandDistDir) {
    try {
      this.log(`Generating web components for brand: ${brandName}`);
      const webcompDir = path.join(brandDistDir, 'webcomponents');
      
      if (!fs.existsSync(webcompDir)) {
        fs.mkdirSync(webcompDir, { recursive: true });
      }
      
      const iconMap = icons.map(icon => {
        const svgContent = fs.readFileSync(icon.path, 'utf8');
        return `    '${icon.name}': \`${svgContent.replace(/`/g, '\\`')}\``;
      }).join(',\n');
      
      const className = `${brandName.charAt(0).toUpperCase() + brandName.slice(1)}IconComponent`;
      
      const webComponentContent = `// Auto-generated ${brandName} icon web components
class ${className} extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
  
  connectedCallback() {
    const iconName = this.getAttribute('name');
    const size = this.getAttribute('size') || '24';
    const color = this.getAttribute('color') || 'currentColor';
    
    const iconMap = {
${iconMap}
    };
    
    if (iconMap[iconName]) {
      this.shadowRoot.innerHTML = \`
        <style>
          :host {
            display: inline-block;
            width: \${size}px;
            height: \${size}px;
          }
          svg {
            width: 100%;
            height: 100%;
            fill: \${color};
          }
        </style>
        \${iconMap[iconName]}
      \`;
    } else {
      console.warn(\`${brandName} icon '\${iconName}' not found. Available icons: \${Object.keys(iconMap).join(', ')}\`);
    }
  }
}

customElements.define('${brandName}-icon', ${className});

// Export individual icon functions for programmatic use
${icons.map(icon => {
  const functionName = `create${icon.name.charAt(0).toUpperCase() + icon.name.slice(1)}Icon`;
  return `export function ${functionName}(size = 24, color = 'currentColor') {
  const iconEl = document.createElement('${brandName}-icon');
  iconEl.setAttribute('name', '${icon.name}');
  iconEl.setAttribute('size', size);
  iconEl.setAttribute('color', color);
  return iconEl;
}`;
}).join('\n\n')}

export { ${className} };
export const availableIcons = [${icons.map(icon => `'${icon.name}'`).join(', ')}];`;
      
      fs.writeFileSync(path.join(webcompDir, 'icons.js'), webComponentContent);
      this.log(`Generated web components for brand: ${brandName}`, 'success');
      
    } catch (error) {
      this.log(`Web component generation failed for brand '${brandName}': ${error.message}`, 'error');
      throw error;
    }
  }
  
  async generatePackageJson(brandName, icons, brandDistDir) {
    try {
      const packageName = `@your-org/icons-${brandName}`;
      const packageContent = {
        name: packageName,
        version: '1.0.0',
        description: `Icon package for ${brandName} brand`,
        main: './svg/icons.js',
        types: './types/index.d.ts',
        files: [
          'svg/',
          'png/',
          'fonts/',
          'webcomponents/',
          'types/'
        ],
        exports: {
          '.': {
            import: './svg/icons.js',
            require: './svg/icons.js',
            types: './types/index.d.ts'
          },
          './svg': './svg/icons.js',
          './png': './png/',
          './fonts': './fonts/',
          './webcomponents': './webcomponents/icons.js'
        },
        scripts: {
          build: 'echo "Built by icon-tokens build system"'
        },
        keywords: ['icons', 'svg', 'design-system', brandName],
        author: 'Your Organization',
        license: 'MIT',
        repository: {
          type: 'git',
          url: 'https://gitlab.com/your-org/icons'
        },
        publishConfig: {
          registry: 'https://gitlab.com/api/v4/projects/YOUR_PROJECT_ID/packages/npm/'
        },
        metadata: {
          brand: brandName,
          iconCount: icons.length,
          generatedAt: new Date().toISOString(),
          icons: icons.map(icon => ({
            name: icon.name,
            filename: icon.filename,
            format: icon.format
          }))
        }
      };
      
      fs.writeFileSync(
        path.join(brandDistDir, 'package.json'),
        JSON.stringify(packageContent, null, 2)
      );
      
      this.log(`Generated package.json for brand: ${brandName}`, 'success');
      
    } catch (error) {
      this.log(`Package.json generation failed for brand '${brandName}': ${error.message}`, 'error');
      throw error;
    }
  }
  
  generateBuildReport(successCount, totalBrands) {
    const duration = this.buildStats.endTime - this.buildStats.startTime;
    
    this.log('📊 Build Summary:', 'success');
    this.log(`   Duration: ${duration}ms`);
    this.log(`   Brands: ${successCount}/${totalBrands}`);
    this.log(`   Total Icons: ${this.buildStats.totalIcons}`);
    this.log(`   Errors: ${this.buildStats.errors.length}`);
    
    if (this.buildStats.errors.length > 0) {
      this.log('⚠️ Errors encountered:', 'error');
      this.buildStats.errors.forEach(error => {
        this.log(`   ${error.brand}: ${error.error}`, 'error');
      });
    }
    
    this.log(`🎉 Build completed! Output directory: ${this.distDir}`, 'success');
  }
}

// Main build function
async function build(platform = 'all', options = {}) {
  const builder = new MultiBrandBuilder({
    platform,
    ...options
  });
  
  return await builder.build();
}

// Command line execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const platform = args[0] || 'all';
  const options = {};
  
  // Parse additional arguments
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--brands':
        options.brands = args[++i].split(',');
        break;
      case '--verbose':
        options.verbose = true;
        break;
    }
  }
  
  build(platform, options).then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { build, MultiBrandBuilder };