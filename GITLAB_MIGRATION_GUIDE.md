# GitLab Migration Setup Guide

## 🎯 **Overview**
This guide will help you migrate from GitHub to GitLab using the **Mirror Setup** approach, keeping GitHub as your primary development platform while leveraging GitLab for CI/CD and package publishing.

---

## 📋 **Prerequisites**

### Required Accounts & Tokens:
- [x] GitHub account (existing)
- [ ] GitLab account (create if needed)
- [ ] Figma account with design file access
- [ ] Figma Personal Access Token
- [ ] GitLab Personal Access Token

---

## 🔧 **Step 1: Create GitLab Repository**

### 1.1 Create New GitLab Project
1. Go to https://gitlab.com/projects/new
2. Click **"Create blank project"**
3. Fill in project details:
   - **Project name**: `delete-poc-icons` (or your preferred name)
   - **Project URL**: `https://gitlab.com/your-username/delete-poc-icons`
   - **Visibility**: Private (recommended)
   - **Initialize repository with README**: ❌ (unchecked)
4. Click **"Create project"**

### 1.2 Configure Project Settings
1. Go to **Settings → General → Visibility**
   - Set to **Private** or **Internal** as needed
2. Go to **Settings → General → Features**
   - ✅ Enable: **Repository**, **CI/CD**, **Package Registry**
   - ❌ Disable: **Issues**, **Wiki**, **Snippets** (optional, to focus on CI/CD)

---

## 🔑 **Step 2: Generate Required Tokens**

### 2.1 GitLab Personal Access Token
1. Go to GitLab → **User Settings → Access Tokens**
2. Create token with these scopes:
   - ✅ `api` - Access the API
   - ✅ `read_user` - Read user information
   - ✅ `read_repository` - Read repository
   - ✅ `write_repository` - Write repository
   - ✅ `read_registry` - Read package registry
   - ✅ `write_registry` - Write package registry
3. **Save this token securely** - you'll need it for CI/CD variables

### 2.2 Figma Personal Access Token
1. Go to Figma → **Account Settings → Personal Access Tokens**
2. Click **"Create new token"**
3. Give it a descriptive name: `Icon System CI/CD`
4. **Save this token securely**

### 2.3 Get Figma File Key
1. Open your Figma file
2. From URL `https://www.figma.com/file/ABC123XYZ456/Your-File-Name`
3. Extract the file key: `ABC123XYZ456` (22 characters)

---

## 🔄 **Step 3: Set Up Repository Mirroring**

### 3.1 Add GitLab Remote
```bash
# Navigate to your project root
cd /path/to/your/delete-poc-icons

# Add GitLab as a remote
git remote add gitlab https://gitlab.com/your-username/delete-poc-icons.git

# Verify remotes
git remote -v
# Should show both 'origin' (GitHub) and 'gitlab' remotes
```

### 3.2 Initial Push to GitLab
```bash
# Push current main branch to GitLab
git push gitlab main

# Push all branches (optional)
git push gitlab --all

# Push tags (optional)
git push gitlab --tags
```

---

## 🛠️ **Step 4: Configure GitLab CI/CD Variables**

### 4.1 Add CI/CD Variables
1. Go to your GitLab project → **Settings → CI/CD → Variables**
2. Add these variables:

| Variable Name | Value | Type | Masked | Protected | Description |
|---------------|-------|------|--------|-----------|-------------|
| `FIGMA_FILE_KEY` | `your_22_char_file_key` | Variable | ❌ | ✅ | Figma file identifier |
| `FIGMA_ACCESS_TOKEN` | `your_figma_token` | Variable | ✅ | ✅ | Figma API access token |
| `GITLAB_TOKEN` | `your_gitlab_token` | Variable | ✅ | ✅ | GitLab API access token |
| `FIGMA_WEBHOOK_SECRET` | `your_webhook_secret` | Variable | ✅ | ✅ | Optional: webhook security |

### 4.2 Variable Configuration Notes:
- **Masked**: ✅ for sensitive tokens (hides in logs)
- **Protected**: ✅ for production variables (only protected branches)
- **Environment scope**: Leave as `*` (all environments)

---

## 🔧 **Step 5: Create GitHub → GitLab Mirroring Workflow**

### 5.1 Create GitHub Action for Mirroring
Create `.github/workflows/mirror-to-gitlab.yml`:
```yaml
name: Mirror to GitLab

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  mirror:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' # Only mirror on push, not PR
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
      with:
        fetch-depth: 0 # Full history for complete mirror
    
    - name: Mirror to GitLab
      env:
        GITLAB_TOKEN: ${{ secrets.GITLAB_TOKEN }}
        GITLAB_REPO: gitlab.com/your-username/delete-poc-icons.git
      run: |
        git remote add gitlab https://oauth2:$GITLAB_TOKEN@$GITLAB_REPO
        git push gitlab --all --force
        git push gitlab --tags --force

    - name: Trigger GitLab Pipeline
      env:
        GITLAB_TOKEN: ${{ secrets.GITLAB_TOKEN }}
        GITLAB_PROJECT_ID: your-project-id # Get from GitLab project settings
      run: |
        curl -X POST \
          -F token=$GITLAB_TOKEN \
          -F ref=main \
          https://gitlab.com/api/v4/projects/$GITLAB_PROJECT_ID/trigger/pipeline
```

### 5.2 Add GitHub Secrets
1. Go to your GitHub repository → **Settings → Secrets and variables → Actions**
2. Add these secrets:
   - `GITLAB_TOKEN`: Your GitLab personal access token
   - `GITLAB_PROJECT_ID`: Your GitLab project ID (found in project settings)

---

## 📦 **Step 6: Configure Package Registry**

### 6.1 Update Package.json for GitLab Registry
```json
{
  "publishConfig": {
    "registry": "https://gitlab.com/api/v4/projects/YOUR_PROJECT_ID/packages/npm/",
    "@your-org:registry": "https://gitlab.com/api/v4/projects/YOUR_PROJECT_ID/packages/npm/"
  }
}
```

### 6.2 Create .npmrc Template
Create `packages/icon-tokens/.npmrc.template`:
```
@your-org:registry=https://gitlab.com/api/v4/projects/${CI_PROJECT_ID}/packages/npm/
//gitlab.com/api/v4/projects/${CI_PROJECT_ID}/packages/npm/:_authToken=${GITLAB_TOKEN}
```

---

## 🧪 **Step 7: Test the Setup**

### 7.1 Test Local Environment
```bash
# Create .env file for local testing
cp .env.example .env

# Edit .env with your actual values
# FIGMA_FILE_KEY=your_file_key
# FIGMA_ACCESS_TOKEN=your_token

# Test Figma sync locally
cd packages/icon-tokens
npm run sync:dry-run
```

### 7.2 Test GitLab Pipeline
```bash
# Make a small change and push to GitHub
echo "# Test GitLab CI/CD" >> README.md
git add README.md
git commit -m "test: trigger GitLab pipeline"
git push origin main

# This should:
# 1. Trigger GitHub Action to mirror to GitLab
# 2. Trigger GitLab CI/CD pipeline
# 3. Run the icon sync and build process
```

### 7.3 Monitor Pipeline
1. Check GitHub Actions: `https://github.com/your-username/delete-poc-icons/actions`
2. Check GitLab Pipelines: `https://gitlab.com/your-username/delete-poc-icons/-/pipelines`

---

## 🎯 **Step 8: Verify Everything Works**

### 8.1 Check Pipeline Stages
GitLab pipeline should show:
- ✅ **validate_security** - Environment variables validated
- ✅ **sync_figma** - Icons synced from Figma
- ✅ **build_icons** - Multi-brand packages built
- ✅ **test_packages** - Package validation completed
- 🔒 **publish_packages** - Manual trigger for publishing

### 8.2 Check Generated Artifacts
1. Go to GitLab → **CI/CD → Pipelines → [Latest Pipeline]**
2. Check **build_icons** job artifacts
3. Should contain `dist/` folder with brand packages

### 8.3 Test Package Publishing (Manual)
1. In GitLab pipeline, manually trigger **publish_packages** job
2. Check **Packages & Registries → Package Registry**
3. Should show published packages like `@your-org/icons-global`

---

## 📚 **Step 9: Team Setup & Documentation**

### 9.1 Update Team Workflow
1. **Development**: Continue using GitHub (no change)
2. **CI/CD**: Automatic via GitLab (no action needed)
3. **Package consumption**: Install from GitLab registry
4. **Monitoring**: Check GitLab for pipeline status

### 9.2 Update Package Installation Instructions
For consumers of your icon packages:
```bash
# Configure npm to use GitLab registry
npm config set @your-org:registry https://gitlab.com/api/v4/projects/YOUR_PROJECT_ID/packages/npm/

# Install packages
npm install @your-org/icons-global
npm install @your-org/icons-ifa
npm install @your-org/icons-bigsite
```

---

## 🔧 **Troubleshooting Common Issues**

### Issue: GitHub Action Fails to Mirror
**Solution**: Check GitHub secrets and GitLab token permissions

### Issue: GitLab CI/CD Variables Not Found
**Solution**: Verify variables are added with correct names and scopes

### Issue: Package Publishing Fails
**Solution**: Check GitLab token has `write_registry` scope

### Issue: Figma Sync Fails
**Solution**: Verify Figma file key format and token permissions

---

## ✅ **Migration Checklist**

- [ ] GitLab repository created
- [ ] GitLab CI/CD variables configured
- [ ] GitHub mirroring workflow created
- [ ] GitHub secrets configured
- [ ] Local .env file created and tested
- [ ] GitLab pipeline tested and passing
- [ ] Package registry configured
- [ ] Package publishing tested
- [ ] Team documentation updated
- [ ] Figma webhook configured (optional)

---

## 🚀 **Next Steps**

Once migration is complete:
1. **Schedule regular syncs** in GitLab (Settings → CI/CD → Schedules)
2. **Set up Figma webhooks** for real-time updates
3. **Configure team access** to GitLab packages
4. **Monitor pipeline health** and set up alerts
5. **Create Storybook app** for icon documentation

---

## 📞 **Support**

If you encounter issues:
1. Check GitLab CI/CD pipeline logs
2. Verify all tokens and variables are correctly configured
3. Test individual components locally first
4. Review the troubleshooting section above