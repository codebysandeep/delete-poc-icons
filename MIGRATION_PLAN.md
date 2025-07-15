# GitHub to GitLab Migration Plan

## Option 1: Mirror Setup (Recommended)

### Benefits:
- Keep GitHub as your main repository (familiar workflow)
- Use GitLab only for CI/CD and package registry
- Automatic synchronization between both platforms
- Best of both worlds

### Implementation Steps:

#### 1. Create GitLab Repository
```bash
# Create a new project on GitLab
# https://gitlab.com/projects/new
```

#### 2. Set Up Push Mirror (GitHub → GitLab)
```bash
# Add GitLab as a remote
git remote add gitlab https://gitlab.com/your-username/your-project.git

# Push to both repositories
git push origin main
git push gitlab main
```

#### 3. Configure GitHub Actions to Push to GitLab
Create `.github/workflows/mirror-to-gitlab.yml`:

```yaml
name: Mirror to GitLab
on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  mirror:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
      with:
        fetch-depth: 0
    
    - name: Mirror to GitLab
      uses: pixta-dev/repository-mirroring-action@v1
      with:
        target_repo_url: https://gitlab.com/your-username/your-project.git
        ssh_private_key: ${{ secrets.GITLAB_SSH_KEY }}
```

#### 4. Configure GitLab for CI/CD Only
In GitLab project settings:
- Disable GitLab Issues, Wiki, Snippets
- Enable only CI/CD and Package Registry
- Set up CI/CD variables as described above

---

## Option 2: Dual Development

### Benefits:
- Full control over both repositories
- Can use different workflows for different purposes
- More flexibility

### Implementation Steps:

#### 1. Clone Your Repository to GitLab
```bash
# Import your GitHub repository to GitLab
# Use GitLab's import feature: https://gitlab.com/projects/new#import_project
```

#### 2. Set Up Dual Remotes
```bash
# Add both remotes
git remote add github https://github.com/your-username/your-project.git
git remote add gitlab https://gitlab.com/your-username/your-project.git

# Push to both
git push github main
git push gitlab main
```

#### 3. Create Sync Script
```bash
#!/bin/bash
# sync-repos.sh

echo "🔄 Syncing repositories..."

# Fetch from GitHub
git fetch github

# Merge changes
git merge github/main

# Push to GitLab
git push gitlab main

echo "✅ Sync completed!"
```

---

## Option 3: Full Migration

### Benefits:
- Single source of truth
- Simplified workflow
- Full GitLab features

### Implementation Steps:

#### 1. Export from GitHub
```bash
# Create a complete backup
git clone --mirror https://github.com/your-username/your-project.git
cd your-project.git
```

#### 2. Import to GitLab
```bash
# Create new GitLab project
# Push mirror to GitLab
git remote set-url origin https://gitlab.com/your-username/your-project.git
git push --mirror
```

#### 3. Update Local Repository
```bash
# Update your local repo
git remote set-url origin https://gitlab.com/your-username/your-project.git
```

---

## Recommended Workflow

### For Icon Design System Project:

1. **Use Option 1 (Mirror Setup)**
2. **Development Flow:**
   - Continue development on GitHub
   - GitHub automatically mirrors to GitLab
   - GitLab CI/CD handles Figma sync and package publishing
   - Packages published to GitLab Package Registry

3. **Team Workflow:**
   - Developers work with familiar GitHub workflow
   - CI/CD team manages GitLab CI/CD pipeline
   - Design team sees automatic updates from Figma

### Required Files for GitLab CI/CD:

```
your-project/
├── .gitlab-ci.yml                    # Already created
├── .github/workflows/mirror.yml      # For mirroring
├── .env.example                      # Template for local development
├── packages/icon-tokens/
│   ├── src/services/figma-api.js     # Already created
│   ├── src/scripts/sync-figma-icons.js # Already created
│   └── config-multi-brand.js         # Already created
```

---

## Testing Your Setup

### 1. Local Testing (Before Migration)
```bash
# Create .env file with your tokens
cp .env.example .env
# Edit .env with your actual values

# Test Figma sync
cd packages/icon-tokens
npm run sync:dry-run

# Test build
npm run build:multi
```

### 2. GitLab CI/CD Testing
```bash
# After setting up GitLab variables
# Push to GitLab and check CI/CD pipeline
git push gitlab main
```

### 3. Package Publishing Testing
```bash
# Test manual package publishing
# In GitLab CI/CD, manually trigger publish job
```

---

## Migration Checklist

- [ ] Create GitLab repository
- [ ] Set up GitLab CI/CD variables
- [ ] Configure GitHub → GitLab mirroring
- [ ] Test Figma API connection
- [ ] Test local sync script
- [ ] Test GitLab CI/CD pipeline
- [ ] Test package publishing
- [ ] Update documentation
- [ ] Train team on new workflow

---

## Support and Troubleshooting

### Common Issues:
1. **Authentication errors**: Check token permissions
2. **Rate limiting**: Adjust retry delays in figma-api.js
3. **Build failures**: Check brand folder structure
4. **Package publishing**: Verify GitLab token has correct scopes

### Debugging Commands:
```bash
# Test Figma API
npm run sync:verbose

# Test build pipeline
npm run build:multi --verbose

# Check GitLab CI logs
# View in GitLab UI: CI/CD > Pipelines
```