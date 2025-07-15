#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class GitLabMigrationSetup {
  constructor() {
    this.projectRoot = process.cwd();
    this.config = {};
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : 
                  type === 'success' ? '✅' : 
                  type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  prompt(question) {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      readline.question(question, (answer) => {
        readline.close();
        resolve(answer.trim());
      });
    });
  }

  async collectConfiguration() {
    this.log('🔧 GitLab Migration Setup');
    this.log('This script will help you configure the GitLab migration');
    
    console.log('\n📋 Please provide the following information:\n');
    
    // GitLab repository info
    this.config.gitlabUsername = await this.prompt('GitLab username: ');
    this.config.gitlabRepoName = await this.prompt('GitLab repository name (default: delete-poc-icons): ') || 'delete-poc-icons';
    this.config.gitlabProjectId = await this.prompt('GitLab project ID (from project settings): ');
    
    // Tokens
    this.config.figmaFileKey = await this.prompt('Figma file key (22 characters): ');
    this.config.figmaAccessToken = await this.prompt('Figma access token: ');
    this.config.gitlabToken = await this.prompt('GitLab personal access token: ');
    
    // Organization name for packages
    this.config.orgName = await this.prompt('Organization name for packages (default: your-org): ') || 'your-org';
    
    this.log('✅ Configuration collected successfully');
  }

  validateConfiguration() {
    this.log('🔍 Validating configuration...');
    
    const errors = [];
    
    if (!this.config.gitlabUsername) {
      errors.push('GitLab username is required');
    }
    
    if (!this.config.gitlabProjectId || !/^\d+$/.test(this.config.gitlabProjectId)) {
      errors.push('GitLab project ID must be a number');
    }
    
    if (!this.config.figmaFileKey || this.config.figmaFileKey.length !== 22) {
      errors.push('Figma file key must be exactly 22 characters');
    }
    
    if (!this.config.figmaAccessToken) {
      errors.push('Figma access token is required');
    }
    
    if (!this.config.gitlabToken) {
      errors.push('GitLab token is required');
    }
    
    if (errors.length > 0) {
      this.log('❌ Configuration validation failed:', 'error');
      errors.forEach(error => this.log(`  - ${error}`, 'error'));
      process.exit(1);
    }
    
    this.log('✅ Configuration validation passed');
  }

  createEnvironmentFile() {
    this.log('📄 Creating .env file...');
    
    const envContent = `# Figma Configuration
FIGMA_FILE_KEY=${this.config.figmaFileKey}
FIGMA_ACCESS_TOKEN=${this.config.figmaAccessToken}
FIGMA_WEBHOOK_SECRET=your_webhook_secret_here

# GitLab Configuration
GITLAB_TOKEN=${this.config.gitlabToken}

# Development Configuration
NODE_ENV=development
VERBOSE=true
`;
    
    fs.writeFileSync(path.join(this.projectRoot, '.env'), envContent);
    this.log('✅ .env file created');
  }

  updateGitHubWorkflow() {
    this.log('🔄 Updating GitHub workflow...');
    
    const workflowPath = path.join(this.projectRoot, '.github', 'workflows', 'mirror-to-gitlab.yml');
    
    if (!fs.existsSync(workflowPath)) {
      this.log('❌ GitHub workflow file not found', 'error');
      return;
    }
    
    let workflowContent = fs.readFileSync(workflowPath, 'utf8');
    
    // Update GitLab repository reference
    workflowContent = workflowContent.replace(
      /gitlab\.com\/username\/repo\.git/g,
      `gitlab.com/${this.config.gitlabUsername}/${this.config.gitlabRepoName}.git`
    );
    
    fs.writeFileSync(workflowPath, workflowContent);
    this.log('✅ GitHub workflow updated');
  }

  updatePackageConfigurations() {
    this.log('📦 Updating package configurations...');
    
    // Update icon-tokens package.json
    const packageJsonPath = path.join(this.projectRoot, 'packages', 'icon-tokens', 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      packageJson.publishConfig = {
        registry: `https://gitlab.com/api/v4/projects/${this.config.gitlabProjectId}/packages/npm/`,
        [`@${this.config.orgName}:registry`]: `https://gitlab.com/api/v4/projects/${this.config.gitlabProjectId}/packages/npm/`
      };
      
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      this.log('✅ icon-tokens package.json updated');
    }
    
    // Update multi-brand config
    const multiBrandConfigPath = path.join(this.projectRoot, 'packages', 'icon-tokens', 'config-multi-brand.js');
    
    if (fs.existsSync(multiBrandConfigPath)) {
      let configContent = fs.readFileSync(multiBrandConfigPath, 'utf8');
      
      // Update organization name in package generation
      configContent = configContent.replace(
        /@your-org\/icons-/g,
        `@${this.config.orgName}/icons-`
      );
      
      configContent = configContent.replace(
        /registry: 'https:\/\/gitlab\.com\/api\/v4\/projects\/YOUR_PROJECT_ID\/packages\/npm\/'/g,
        `registry: 'https://gitlab.com/api/v4/projects/${this.config.gitlabProjectId}/packages/npm/'`
      );
      
      fs.writeFileSync(multiBrandConfigPath, configContent);
      this.log('✅ Multi-brand config updated');
    }
  }

  createNpmrcTemplate() {
    this.log('📄 Creating .npmrc template...');
    
    const npmrcContent = `@${this.config.orgName}:registry=https://gitlab.com/api/v4/projects/\${CI_PROJECT_ID}/packages/npm/
//gitlab.com/api/v4/projects/\${CI_PROJECT_ID}/packages/npm/:_authToken=\${GITLAB_TOKEN}
`;
    
    const npmrcPath = path.join(this.projectRoot, 'packages', 'icon-tokens', '.npmrc.template');
    fs.writeFileSync(npmrcPath, npmrcContent);
    
    this.log('✅ .npmrc template created');
  }

  addGitLabRemote() {
    this.log('🔗 Adding GitLab remote...');
    
    try {
      const gitlabUrl = `https://gitlab.com/${this.config.gitlabUsername}/${this.config.gitlabRepoName}.git`;
      
      // Check if remote already exists
      try {
        execSync('git remote get-url gitlab', { stdio: 'ignore' });
        this.log('⚠️ GitLab remote already exists, updating...', 'warning');
        execSync(`git remote set-url gitlab ${gitlabUrl}`);
      } catch (e) {
        // Remote doesn't exist, add it
        execSync(`git remote add gitlab ${gitlabUrl}`);
      }
      
      this.log('✅ GitLab remote configured');
      
      // Show remotes
      const remotes = execSync('git remote -v', { encoding: 'utf8' });
      this.log('📋 Current remotes:');
      console.log(remotes);
      
    } catch (error) {
      this.log(`❌ Failed to add GitLab remote: ${error.message}`, 'error');
    }
  }

  generateInstructions() {
    this.log('📋 Generating setup instructions...');
    
    const instructions = `
# GitLab Migration Setup Complete! 🎉

## Next Steps:

### 1. GitHub Secrets Setup
Add these secrets to your GitHub repository (Settings → Secrets → Actions):
- GITLAB_TOKEN: ${this.config.gitlabToken}
- GITLAB_REPO: gitlab.com/${this.config.gitlabUsername}/${this.config.gitlabRepoName}.git
- GITLAB_PROJECT_ID: ${this.config.gitlabProjectId}

### 2. GitLab CI/CD Variables
Add these variables in GitLab (Settings → CI/CD → Variables):
- FIGMA_FILE_KEY: ${this.config.figmaFileKey}
- FIGMA_ACCESS_TOKEN: ${this.config.figmaAccessToken}
- GITLAB_TOKEN: ${this.config.gitlabToken}

### 3. Test Local Setup
\`\`\`bash
cd packages/icon-tokens
npm run sync:dry-run
\`\`\`

### 4. Test GitLab Pipeline
\`\`\`bash
git add .
git commit -m "feat: configure GitLab migration"
git push origin main
\`\`\`

### 5. Package Installation (for consumers)
\`\`\`bash
npm config set @${this.config.orgName}:registry https://gitlab.com/api/v4/projects/${this.config.gitlabProjectId}/packages/npm/
npm install @${this.config.orgName}/icons-global
\`\`\`

## Repository URLs:
- GitHub: https://github.com/${this.config.gitlabUsername}/${this.config.gitlabRepoName}
- GitLab: https://gitlab.com/${this.config.gitlabUsername}/${this.config.gitlabRepoName}
- Packages: https://gitlab.com/${this.config.gitlabUsername}/${this.config.gitlabRepoName}/-/packages

## Support:
- Check GITLAB_MIGRATION_GUIDE.md for detailed instructions
- Review TESTING_GUIDE.md for testing procedures
`;
    
    fs.writeFileSync(path.join(this.projectRoot, 'GITLAB_SETUP_COMPLETE.md'), instructions);
    console.log(instructions);
  }

  async run() {
    try {
      await this.collectConfiguration();
      this.validateConfiguration();
      
      this.createEnvironmentFile();
      this.updateGitHubWorkflow();
      this.updatePackageConfigurations();
      this.createNpmrcTemplate();
      this.addGitLabRemote();
      
      this.generateInstructions();
      
      this.log('🎉 GitLab migration setup completed successfully!', 'success');
      this.log('📖 Check GITLAB_SETUP_COMPLETE.md for next steps');
      
    } catch (error) {
      this.log(`❌ Setup failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// Run the setup
if (require.main === module) {
  const setup = new GitLabMigrationSetup();
  setup.run();
}

module.exports = GitLabMigrationSetup;