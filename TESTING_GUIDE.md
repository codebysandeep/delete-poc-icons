# Testing Guide for Icon Design System

## 🧪 **Pre-Migration Testing (Local)**

### 1. **Setup Environment**

```bash
# 1. Copy the environment template
cp .env.example .env

# 2. Edit .env with your actual values
# FIGMA_FILE_KEY=your_22_character_figma_file_key
# FIGMA_ACCESS_TOKEN=your_figma_personal_access_token
```

### 2. **Install Dependencies**

```bash
# Install root dependencies
npm install

# Install icon-tokens dependencies
cd packages/icon-tokens
npm install
```

### 3. **Test Figma API Connection**

```bash
# Test connection (dry run - no files modified)
npm run sync:dry-run

# Expected output:
# ✅ Figma API connection successful
# ✅ Found X brands with Y icons
# 🔍 Would add/update/remove icons (dry run)
```

### 4. **Test Icon Sync**

```bash
# Sync icons from Figma (will modify files)
npm run sync:verbose

# Expected output:
# ✅ Synced icons to assets/brandname/
# ✅ Updated tokens/icons.json
# 📊 Sync summary with stats
```

### 5. **Test Multi-Brand Build**

```bash
# Build all brand packages
npm run build:multi

# Expected output:
# ✅ Built packages in dist/brandname/
# 📦 Generated package.json for each brand
# 📊 Build summary
```

### 6. **Verify Output Structure**

```bash
# Check the generated structure
ls -la dist/
# Should show brand folders: global/, ifa/, bigsite/, etc.

# Check individual brand structure
ls -la dist/global/
# Should show: svg/, png/, fonts/, webcomponents/, package.json
```

---

## 🔄 **Migration Testing**

### Option 1: Mirror Setup Testing

#### 1. **Create GitLab Repository**
```bash
# Go to https://gitlab.com/projects/new
# Create new project: your-project-name
```

#### 2. **Test GitLab Remote**
```bash
# Add GitLab remote
git remote add gitlab https://gitlab.com/your-username/your-project.git

# Push to GitLab
git push gitlab main
```

#### 3. **Configure GitLab CI/CD Variables**
Go to GitLab project → Settings → CI/CD → Variables, add:
- `FIGMA_FILE_KEY` (not masked, protected)
- `FIGMA_ACCESS_TOKEN` (masked, protected)  
- `GITLAB_TOKEN` (masked, protected)

#### 4. **Test GitLab CI/CD Pipeline**
```bash
# Push a change to trigger pipeline
git commit -m "test: trigger GitLab CI/CD pipeline"
git push gitlab main

# Check pipeline status in GitLab UI
# Go to: CI/CD → Pipelines
```

### Option 2: Dual Development Testing

#### 1. **Set Up Dual Remotes**
```bash
# Add both remotes
git remote add github https://github.com/your-username/your-project.git
git remote add gitlab https://gitlab.com/your-username/your-project.git

# Test pushing to both
git push github main
git push gitlab main
```

#### 2. **Create Sync Script**
```bash
# Create sync-repos.sh
chmod +x sync-repos.sh
./sync-repos.sh
```

---

## 🧪 **Component Testing**

### 1. **Figma API Service Testing**

```javascript
// Test script: test-figma-api.js
const { FigmaApiService } = require('./packages/icon-tokens/src/services/figma-api');

async function testFigmaApi() {
  try {
    const figmaApi = new FigmaApiService();
    
    // Test file access
    const file = await figmaApi.getFile(process.env.FIGMA_FILE_KEY);
    console.log('✅ File access successful');
    
    // Test components
    const components = await figmaApi.getFileComponents(process.env.FIGMA_FILE_KEY);
    console.log('✅ Components access successful');
    
    // Test icons by brand
    const icons = await figmaApi.getIconsByBrand(process.env.FIGMA_FILE_KEY);
    console.log('✅ Icons by brand:', Object.keys(icons));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testFigmaApi();
```

### 2. **Brand Manager Testing**

```javascript
// Test script: test-brand-manager.js
const { BrandManager } = require('./packages/icon-tokens/src/utils/brand-manager');

function testBrandManager() {
  try {
    const brandManager = new BrandManager('./packages/icon-tokens/assets');
    
    // Test brand discovery
    const brands = brandManager.getAllBrands();
    console.log('✅ Found brands:', brands.map(b => b.name));
    
    // Test icon discovery
    brands.forEach(brand => {
      const icons = brandManager.getIconsForBrand(brand.name);
      console.log(`✅ ${brand.name}: ${icons.length} icons`);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testBrandManager();
```

---

## 🔧 **Troubleshooting Common Issues**

### 1. **Figma API Authentication**
```bash
# Test your token manually
curl -H "X-Figma-Token: YOUR_TOKEN" https://api.figma.com/v1/me

# Expected: {"id":"...","email":"...","handle":"..."}
```

### 2. **File Key Validation**
```javascript
// Check if your file key is valid format
const fileKey = "YOUR_FILE_KEY";
const isValid = /^[a-zA-Z0-9]{22}$/.test(fileKey);
console.log('File key valid:', isValid);
```

### 3. **Brand Folder Structure**
```bash
# Ensure proper folder structure
mkdir -p packages/icon-tokens/assets/global
mkdir -p packages/icon-tokens/assets/ifa
mkdir -p packages/icon-tokens/assets/bigsite

# Move existing icons to global
mv packages/icon-tokens/assets/*.svg packages/icon-tokens/assets/global/
```

### 4. **Build Errors**
```bash
# Check dependencies
cd packages/icon-tokens
npm ls

# Reinstall if needed
rm -rf node_modules package-lock.json
npm install
```

---

## 📊 **Expected Results**

### Successful Local Test:
```
📥 Syncing icons from Figma...
✅ Found 3 brands with 15 icons in Figma
✅ Global: +2 icons
✅ IFA: +5 icons  
✅ BigSite: +8 icons
📄 Updated tokens file
🎉 Build completed successfully!
```

### Successful GitLab CI/CD:
```
🔐 Security validation completed
📥 Figma sync completed successfully
🔨 Icon build completed successfully
🧪 Package testing completed
📦 All packages published successfully
```

### Expected File Structure:
```
packages/icon-tokens/
├── assets/
│   ├── global/
│   │   ├── hamburger.svg
│   │   └── ice-cream.svg
│   ├── ifa/
│   │   └── [ifa-icons].svg
│   └── bigsite/
│       └── [bigsite-icons].svg
├── tokens/
│   └── icons.json
└── dist/
    ├── global/
    │   ├── package.json
    │   ├── svg/
    │   ├── png/
    │   ├── fonts/
    │   └── webcomponents/
    ├── ifa/
    └── bigsite/
```

---

## 🚀 **Next Steps After Testing**

1. **If local tests pass**: Proceed with migration
2. **If GitLab CI/CD works**: Set up automatic mirroring
3. **If package publishing works**: Configure team access
4. **If all tests pass**: Begin production use

---

## 🆘 **Getting Help**

If you encounter issues:
1. Check the logs: `npm run sync:verbose`
2. Verify environment variables: `echo $FIGMA_FILE_KEY`
3. Test individual components as shown above
4. Check GitLab CI/CD pipeline logs in the GitLab UI