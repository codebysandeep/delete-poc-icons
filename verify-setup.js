#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SetupVerification {
  constructor() {
    this.projectRoot = process.cwd();
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      tests: []
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : 
                  type === 'success' ? '✅' : 
                  type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} ${message}`);
  }

  test(name, testFn) {
    try {
      const result = testFn();
      if (result === true) {
        this.log(`${name}: PASSED`, 'success');
        this.results.passed++;
        this.results.tests.push({ name, status: 'PASSED' });
      } else if (result === 'warning') {
        this.log(`${name}: WARNING`, 'warning');
        this.results.warnings++;
        this.results.tests.push({ name, status: 'WARNING' });
      } else {
        this.log(`${name}: FAILED`, 'error');
        this.results.failed++;
        this.results.tests.push({ name, status: 'FAILED' });
      }
    } catch (error) {
      this.log(`${name}: FAILED - ${error.message}`, 'error');
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAILED', error: error.message });
    }
  }

  run() {
    this.log('🔍 Verifying GitLab migration setup...\n');

    // Test 1: Check if .env file exists
    this.test('Environment file exists', () => {
      return fs.existsSync(path.join(this.projectRoot, '.env'));
    });

    // Test 2: Check if .env has required variables
    this.test('Environment variables configured', () => {
      const envPath = path.join(this.projectRoot, '.env');
      if (!fs.existsSync(envPath)) return false;
      
      const envContent = fs.readFileSync(envPath, 'utf8');
      const required = ['FIGMA_FILE_KEY', 'FIGMA_ACCESS_TOKEN', 'GITLAB_TOKEN'];
      
      return required.every(key => envContent.includes(key + '='));
    });

    // Test 3: Check if GitHub workflow exists
    this.test('GitHub workflow exists', () => {
      return fs.existsSync(path.join(this.projectRoot, '.github', 'workflows', 'mirror-to-gitlab.yml'));
    });

    // Test 4: Check if GitLab CI config exists
    this.test('GitLab CI config exists', () => {
      return fs.existsSync(path.join(this.projectRoot, '.gitlab-ci.yml'));
    });

    // Test 5: Check if GitLab remote is configured
    this.test('GitLab remote configured', () => {
      try {
        const remotes = execSync('git remote -v', { encoding: 'utf8' });
        return remotes.includes('gitlab');
      } catch (e) {
        return false;
      }
    });

    // Test 6: Check if icon-tokens package structure exists
    this.test('Icon tokens package structure', () => {
      const requiredFiles = [
        'packages/icon-tokens/package.json',
        'packages/icon-tokens/config-multi-brand.js',
        'packages/icon-tokens/src/services/figma-api.js',
        'packages/icon-tokens/src/scripts/sync-figma-icons.js',
        'packages/icon-tokens/src/utils/brand-manager.js'
      ];
      
      return requiredFiles.every(file => 
        fs.existsSync(path.join(this.projectRoot, file))
      );
    });

    // Test 7: Check if brand folders exist
    this.test('Brand asset folders exist', () => {
      const brandFolders = [
        'packages/icon-tokens/assets/global',
        'packages/icon-tokens/assets/ifa',
        'packages/icon-tokens/assets/bigsite'
      ];
      
      return brandFolders.every(folder => 
        fs.existsSync(path.join(this.projectRoot, folder))
      );
    });

    // Test 8: Check if tokens file exists
    this.test('Tokens file exists', () => {
      return fs.existsSync(path.join(this.projectRoot, 'packages/icon-tokens/tokens/icons.json'));
    });

    // Test 9: Check if npm dependencies are installed
    this.test('NPM dependencies installed', () => {
      const nodeModules = path.join(this.projectRoot, 'packages/icon-tokens/node_modules');
      return fs.existsSync(nodeModules);
    });

    // Test 10: Check if required npm packages are available
    this.test('Required packages available', () => {
      const packageJsonPath = path.join(this.projectRoot, 'packages/icon-tokens/package.json');
      if (!fs.existsSync(packageJsonPath)) return false;
      
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const required = ['style-dictionary', 'sharp', 'webfont', 'axios'];
      
      return required.every(pkg => 
        packageJson.dependencies && packageJson.dependencies[pkg]
      );
    });

    // Test 11: Check if Figma file key format is valid
    this.test('Figma file key format', () => {
      const envPath = path.join(this.projectRoot, '.env');
      if (!fs.existsSync(envPath)) return false;
      
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/FIGMA_FILE_KEY=([^\s\n]+)/);
      
      if (!match) return false;
      
      const fileKey = match[1];
      return /^[a-zA-Z0-9]{22}$/.test(fileKey);
    });

    // Test 12: Check if migration guide exists
    this.test('Migration documentation', () => {
      const docs = [
        'GITLAB_MIGRATION_GUIDE.md',
        'TESTING_GUIDE.md',
        'MIGRATION_PLAN.md'
      ];
      
      return docs.every(doc => 
        fs.existsSync(path.join(this.projectRoot, doc))
      );
    });

    // Test 13: Check if git repository is clean
    this.test('Git repository status', () => {
      try {
        const status = execSync('git status --porcelain', { encoding: 'utf8' });
        if (status.trim()) {
          return 'warning'; // There are uncommitted changes
        }
        return true;
      } catch (e) {
        return false;
      }
    });

    // Generate report
    this.generateReport();
  }

  generateReport() {
    console.log('\n' + '='.repeat(50));
    console.log('📊 SETUP VERIFICATION REPORT');
    console.log('='.repeat(50));
    
    console.log(`✅ Tests Passed: ${this.results.passed}`);
    console.log(`❌ Tests Failed: ${this.results.failed}`);
    console.log(`⚠️ Warnings: ${this.results.warnings}`);
    console.log(`📋 Total Tests: ${this.results.tests.length}`);
    
    const successRate = (this.results.passed / this.results.tests.length * 100).toFixed(1);
    console.log(`📈 Success Rate: ${successRate}%`);
    
    if (this.results.failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.results.tests
        .filter(test => test.status === 'FAILED')
        .forEach(test => {
          console.log(`  - ${test.name}${test.error ? ': ' + test.error : ''}`);
        });
    }
    
    if (this.results.warnings > 0) {
      console.log('\n⚠️ WARNINGS:');
      this.results.tests
        .filter(test => test.status === 'WARNING')
        .forEach(test => {
          console.log(`  - ${test.name}`);
        });
    }
    
    console.log('\n🎯 NEXT STEPS:');
    
    if (this.results.failed === 0) {
      console.log('✅ Setup verification passed! You can proceed with:');
      console.log('  1. Create GitLab repository');
      console.log('  2. Add GitHub secrets');
      console.log('  3. Add GitLab CI/CD variables');
      console.log('  4. Test the pipeline');
    } else {
      console.log('❌ Please fix the failed tests before proceeding');
      console.log('  1. Check the error messages above');
      console.log('  2. Review the setup documentation');
      console.log('  3. Run this verification again');
    }
    
    console.log('\n📖 Documentation:');
    console.log('  - GITLAB_MIGRATION_GUIDE.md - Complete setup guide');
    console.log('  - TESTING_GUIDE.md - Testing procedures');
    console.log('  - MIGRATION_PLAN.md - Migration options');
    
    console.log('\n='.repeat(50));
  }
}

// Run verification
if (require.main === module) {
  const verification = new SetupVerification();
  verification.run();
}

module.exports = SetupVerification;