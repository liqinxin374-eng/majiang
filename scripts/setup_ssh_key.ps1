$ErrorActionPreference = "Stop"

$ConfigFile = "deploy/deploy.config.json"
if (-not (Test-Path $ConfigFile)) {
    $ConfigFile = "deploy/deploy.config.example.json"
}

$Config = Get-Content $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
$ServerHost = $Config.serverHost
$SshUser = if ($Config.sshUser) { $Config.sshUser } else { "root" }
$SshPort = if ($Config.sshPort) { $Config.sshPort } else { 22 }

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "SSH Key Setup Tool" -ForegroundColor Cyan
Write-Host "Target: $($SshUser)@$($ServerHost):$($SshPort)" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$SshDir = Join-Path $HOME ".ssh"
if (-not (Test-Path $SshDir)) {
    New-Item -ItemType Directory -Path $SshDir | Out-Null
}

$KeyPath = Join-Path $SshDir "id_ed25519"
$PubKeyPath = Join-Path $SshDir "id_ed25519.pub"

if (-not (Test-Path $PubKeyPath)) {
    Write-Host "[1/2] Generating local SSH Key ($PubKeyPath)..." -ForegroundColor Yellow
    & ssh-keygen.exe -t ed25519 -f $KeyPath -N "" -q
}

$PubKeyContent = (Get-Content $PubKeyPath -Raw).Trim()
Write-Host "[1/2] Public key ready: $PubKeyPath" -ForegroundColor Green
Write-Host ""
Write-Host "[2/2] Installing public key to server (Please enter server root password for the LAST time):" -ForegroundColor Yellow

$RemoteCmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$PubKeyContent' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo 'SUCCESS'"
& ssh.exe -p $SshPort -o StrictHostKeyChecking=accept-new "$($SshUser)@$($ServerHost)" "$RemoteCmd"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "====================================================" -ForegroundColor Green
    Write-Host "SUCCESS: SSH passwordless login configured successfully!" -ForegroundColor Green
    Write-Host "From now on, deploy scripts will NEVER ask for password again." -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Failed to install key. Please verify password." -ForegroundColor Red
}
