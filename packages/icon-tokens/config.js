// Simple Icon Tokens Configuration
const fs = require('fs');
const path = require('path');

// Utility function for logging
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

// Check if file exists with error handling
function checkFile(filePath, description) {
  try {
    if (fs.existsSync(filePath)) {
      log(`${description} found: ${filePath}`, 'success');
      return true;
    } else {
      log(`${description} not found: ${filePath}`, 'error');
      return false;
    }
  } catch (error) {
    log(`Error checking ${description}: ${error.message}`, 'error');
    return false;
  }
}

// Main build function
async function build(platform = 'all') {
  try {
    log('🚀 Starting icon token build process...');
    log(`Platform: ${platform}`);
    log(`Working directory: ${process.cwd()}`);
    
    // Check required files
    const assetsDir = path.join(process.cwd(), 'assets');
    const tokensFile = path.join(process.cwd(), 'tokens', 'icons.json');
    
    if (!checkFile(assetsDir, 'Assets directory')) return false;
    if (!checkFile(tokensFile, 'Tokens file')) return false;
    
    // Check individual SVG files
    const svgFiles = ['hamburger.svg', 'ice-cream.svg'];
    for (const file of svgFiles) {
      const filePath = path.join(assetsDir, file);
      if (!checkFile(filePath, `SVG file ${file}`)) return false;
    }
    
    // Load dependencies
    log('Loading dependencies...');
    let StyleDictionary, sharp, webfont;
    
    try {
      const StyleDictionaryModule = require('style-dictionary');
      StyleDictionary = StyleDictionaryModule.default || StyleDictionaryModule;
      log('✅ style-dictionary loaded');
    } catch (error) {
      log(`Failed to load style-dictionary: ${error.message}`, 'error');
      return false;
    }
    
    try {
      sharp = require('sharp');
      log('✅ sharp loaded');
    } catch (error) {
      log(`Failed to load sharp: ${error.message}`, 'error');
      return false;
    }
    
    try {
      const webfontModule = require('webfont');
      webfont = webfontModule.webfont;
      log('✅ webfont loaded');
    } catch (error) {
      log(`Failed to load webfont: ${error.message}`, 'error');
      return false;
    }
    
    // Create output directory
    const distDir = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
      log(`Created output directory: ${distDir}`, 'success');
    }
    
    // Simple Style Dictionary configuration
    const config = {
      source: [tokensFile],
      platforms: {}
    };
    
    // Add platforms based on argument
    if (platform === 'all' || platform === 'svg') {
      config.platforms.svg = {
        transformGroup: 'js',
        buildPath: path.join(distDir, 'svg') + path.sep,
        files: [{
          destination: 'icons.js',
          format: 'javascript/es6'
        }]
      };
    }
    
    // Build with Style Dictionary
    log('Building with Style Dictionary...');
    const sd = new StyleDictionary(config);
    await sd.buildAllPlatforms();
    
    // Generate additional outputs
    if (platform === 'all' || platform === 'svg') {
      await generateSVGFiles(distDir);
    }
    
    if (platform === 'all' || platform === 'png') {
      await generatePNGFiles(distDir, sharp);
    }
    
    if (platform === 'all' || platform === 'font') {
      await generateFontFiles(distDir, webfont);
    }
    
    if (platform === 'all' || platform === 'webcomponent') {
      await generateWebComponents(distDir);
    }
    
    log('🎉 Build completed successfully!', 'success');
    log(`Output directory: ${distDir}`);
    return true;
    
  } catch (error) {
    log(`Build failed: ${error.message}`, 'error');
    log(`Stack trace: ${error.stack}`, 'error');
    return false;
  }
}

// Generate individual SVG files
async function generateSVGFiles(distDir) {
  try {
    log('Generating SVG files...');
    const svgDir = path.join(distDir, 'svg');
    if (!fs.existsSync(svgDir)) {
      fs.mkdirSync(svgDir, { recursive: true });
    }
    
    const svgFiles = ['hamburger.svg', 'ice-cream.svg'];
    for (const file of svgFiles) {
      const srcPath = path.join(process.cwd(), 'assets', file);
      const destPath = path.join(svgDir, file);
      fs.copyFileSync(srcPath, destPath);
      log(`Copied ${file} to ${destPath}`, 'success');
    }
  } catch (error) {
    log(`SVG generation failed: ${error.message}`, 'error');
  }
}

// Generate PNG files
async function generatePNGFiles(distDir, sharp) {
  try {
    log('Generating PNG files...');
    const pngDir = path.join(distDir, 'png');
    if (!fs.existsSync(pngDir)) {
      fs.mkdirSync(pngDir, { recursive: true });
    }
    
    const svgFiles = ['hamburger.svg', 'ice-cream.svg'];
    const sizes = [16, 24, 32, 48, 64];
    
    for (const file of svgFiles) {
      const svgPath = path.join(process.cwd(), 'assets', file);
      const baseName = path.basename(file, '.svg');
      
      for (const size of sizes) {
        const pngPath = path.join(pngDir, `${baseName}-${size}.png`);
        await sharp(svgPath)
          .resize(size, size)
          .png()
          .toFile(pngPath);
        log(`Generated ${baseName}-${size}.png`, 'success');
      }
    }
  } catch (error) {
    log(`PNG generation failed: ${error.message}`, 'error');
  }
}

// Generate font files
async function generateFontFiles(distDir, webfont) {
  try {
    log('Generating font files...');
    const fontDir = path.join(distDir, 'fonts');
    if (!fs.existsSync(fontDir)) {
      fs.mkdirSync(fontDir, { recursive: true });
    }
    
    // Change working directory temporarily for webfont
    const originalCwd = process.cwd();
    process.chdir(path.join(originalCwd, 'assets'));
    
    log(`Changed to assets directory for webfont`);
    log(`Assets directory contents: ${fs.readdirSync('.').join(', ')}`);
    
    const result = await webfont({
      files: '*.svg',
      fontName: 'MyIconFont',
      formats: ['woff2', 'woff', 'ttf'],
      normalize: true,
      fontHeight: 1000,
      descent: 150,
      startUnicode: 0xe000,
    });
    
    // Restore original working directory
    process.chdir(originalCwd);
    log(`Restored working directory to: ${process.cwd()}`);
    
    // Write font files
    const formats = ['woff2', 'woff', 'ttf'];
    for (const format of formats) {
      if (result[format]) {
        const filePath = path.join(fontDir, `MyIconFont.${format}`);
        fs.writeFileSync(filePath, result[format]);
        log(`Generated MyIconFont.${format}`, 'success');
      }
    }
    
    // Generate CSS
    const cssContent = `@font-face {
  font-family: 'MyIconFont';
  src: url('./MyIconFont.woff2') format('woff2'),
       url('./MyIconFont.woff') format('woff'),
       url('./MyIconFont.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}

.icon {
  font-family: 'MyIconFont';
  font-style: normal;
  font-weight: normal;
  font-variant: normal;
  text-transform: none;
  line-height: 1;
}

.icon-hamburger::before { content: "\\E000"; }
.icon-ice-cream::before { content: "\\E001"; }`;
    
    fs.writeFileSync(path.join(fontDir, 'MyIconFont.css'), cssContent);
    log('Generated MyIconFont.css', 'success');
    
  } catch (error) {
    log(`Font generation failed: ${error.message}`, 'error');
  }
}

// Generate web components
async function generateWebComponents(distDir) {
  try {
    log('Generating web components...');
    const webcompDir = path.join(distDir, 'webcomponents');
    if (!fs.existsSync(webcompDir)) {
      fs.mkdirSync(webcompDir, { recursive: true });
    }
    
    const svgFiles = ['hamburger.svg', 'ice-cream.svg'];
    const iconMap = svgFiles.map(file => {
      const iconName = path.basename(file, '.svg');
      const svgPath = path.join(process.cwd(), 'assets', file);
      const svgContent = fs.readFileSync(svgPath, 'utf8');
      return `    '${iconName}': \`${svgContent.replace(/`/g, '\\`')}\``;
    }).join(',\n');
    
    const webComponentContent = `// Auto-generated icon web components
class IconComponent extends HTMLElement {
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
      console.warn(\`Icon '\${iconName}' not found\`);
    }
  }
}

customElements.define('icon-component', IconComponent);

// Export individual icon functions for programmatic use
${svgFiles.map(file => {
  const iconName = path.basename(file, '.svg');
  return `export function create${iconName.charAt(0).toUpperCase() + iconName.slice(1)}Icon(size = 24, color = 'currentColor') {
  const iconEl = document.createElement('icon-component');
  iconEl.setAttribute('name', '${iconName}');
  iconEl.setAttribute('size', size);
  iconEl.setAttribute('color', color);
  return iconEl;
}`;
}).join('\n\n')}

export { IconComponent };`;
    
    fs.writeFileSync(path.join(webcompDir, 'icons.js'), webComponentContent);
    log('Generated icons.js web component', 'success');
    
  } catch (error) {
    log(`Web component generation failed: ${error.message}`, 'error');
  }
}

// Command line execution
if (require.main === module) {
  const platform = process.argv[2] || 'all';
  build(platform).then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { build };