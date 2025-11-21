# PowerShell script to push to GitHub repository
# Make sure you've created the repository "versus-simulator-page" on GitHub first

Write-Host "Setting up GitHub remote and pushing code..." -ForegroundColor Green

# Get GitHub username
$username = Read-Host "Enter your GitHub username"

# Add remote (update if already exists)
$remoteExists = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Remote 'origin' already exists. Updating..." -ForegroundColor Yellow
    git remote set-url origin "https://github.com/$username/versus-simulator-page.git"
} else {
    Write-Host "Adding remote 'origin'..." -ForegroundColor Green
    git remote add origin "https://github.com/$username/versus-simulator-page.git"
}

# Ensure we're on main branch
git branch -M main

# Push to GitHub
Write-Host "`nPushing to GitHub..." -ForegroundColor Green
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host "Your repository: https://github.com/$username/versus-simulator-page" -ForegroundColor Cyan
} else {
    Write-Host "`n❌ Push failed. Make sure:" -ForegroundColor Red
    Write-Host "  1. The repository 'versus-simulator-page' exists on GitHub" -ForegroundColor Yellow
    Write-Host "  2. You have push access to the repository" -ForegroundColor Yellow
    Write-Host "  3. You're authenticated with GitHub (check: git config --global credential.helper)" -ForegroundColor Yellow
}

