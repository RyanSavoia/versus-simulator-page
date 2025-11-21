# Setup GitHub Repository

Follow these steps to create and push to your GitHub repository:

## Option 1: Using GitHub Web Interface (Easiest)

1. **Create the repository on GitHub:**
   - Go to https://github.com/new
   - Repository name: `versus-simulator-page`
   - Description: "Versus Sports Simulator web application"
   - Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
   - Click "Create repository"

2. **Push your code:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/versus-simulator-page.git
   git branch -M main
   git push -u origin main
   ```

## Option 2: Using GitHub CLI (if installed)

```bash
gh repo create versus-simulator-page --public --source=. --remote=origin --push
```

## Option 3: Using GitHub API (Advanced)

1. **Get a Personal Access Token:**
   - Go to https://github.com/settings/tokens
   - Generate new token (classic)
   - Select `repo` scope
   - Copy the token

2. **Create the repository via API:**
   ```bash
   curl -H "Authorization: token YOUR_TOKEN" \
        -d '{"name":"versus-simulator-page","description":"Versus Sports Simulator web application","private":false}' \
        https://api.github.com/user/repos
   ```

3. **Push your code:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/versus-simulator-page.git
   git branch -M main
   git push -u origin main
   ```

Replace `YOUR_USERNAME` with your actual GitHub username in the commands above.

