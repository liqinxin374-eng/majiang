<#
.SYNOPSIS
    麻将游戏全自动构建、上传与部署脚本 (Windows PowerShell 原生支持)
#>

param (
    [ValidateSet("all", "frontend", "backend")]
    [string]$Target = "all",

    [string]$ConfigFile = "deploy/deploy.config.json"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $ScriptDir
Set-Location $RootDir

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Auto Deploy Tool (PowerShell)" -ForegroundColor Cyan
Write-Host "Deploy Target: $Target" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

if (-not (Test-Path $ConfigFile)) {
    Write-Host "Config file not found: $ConfigFile" -ForegroundColor Red
    exit 1
}

$Config = Get-Content $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json

$ServerHost = $Config.serverHost
$SshUser = if ($Config.sshUser) { $Config.sshUser } else { "root" }
$SshPort = if ($Config.sshPort) { $Config.sshPort } else { 22 }
$RemoteWebDir = if ($Config.remoteWebDir) { $Config.remoteWebDir } else { "/var/www/mahjong" }
$RemoteServerDir = if ($Config.remoteServerDir) { $Config.remoteServerDir } else { "/opt/mahjong-server" }
$ServiceName = if ($Config.serviceName) { $Config.serviceName } else { "mahjong-server" }
$ServerOrigin = if ($Config.serverOrigin) { $Config.serverOrigin } else { "https://$ServerHost" }
$KeyArg = if ($Config.sshKey -and (Test-Path $Config.sshKey)) { "-i `"$($Config.sshKey)`"" } else { "" }

Write-Host "Server: $($SshUser)@$($ServerHost):$($SshPort)" -ForegroundColor DarkCyan
Write-Host "Web Dir: $RemoteWebDir" -ForegroundColor DarkCyan
Write-Host "Server Dir: $RemoteServerDir" -ForegroundColor DarkCyan
Write-Host ""

# 1. 前端部署
if ($Target -eq "all" -or $Target -eq "frontend") {
    Write-Host "[1/2] Building frontend (Vite build)..." -ForegroundColor Yellow
    & node .\node_modules\vite\bin\vite.js build
    if ($LASTEXITCODE -ne 0) { throw "Vite build failed" }

    $DistIndex = Join-Path $RootDir "dist/index.html"
    if (Test-Path $DistIndex) {
        $HtmlContent = Get-Content $DistIndex -Raw -Encoding UTF8
        if (-not $HtmlContent.Contains("window.__MAHJONG_SERVER_ORIGIN__")) {
            $Injection = "<script>window.__MAHJONG_SERVER_ORIGIN__ = `"$ServerOrigin`";</script>"
            $HtmlContent = $HtmlContent -replace "<head>", "<head>$Injection"
            [IO.File]::WriteAllText($DistIndex, $HtmlContent, [Text.Encoding]::UTF8)
            Write-Host "Injected server origin: $ServerOrigin" -ForegroundColor Green
        }
    }

    Write-Host "Packaging dist.tar.gz..." -ForegroundColor Yellow
    & tar.exe -czf dist.tar.gz -C dist .
    if ($LASTEXITCODE -ne 0) { throw "Archive failed" }

    Write-Host "[2/2] Uploading frontend to server..." -ForegroundColor Yellow
    $ScpCmd = "scp -P $SshPort $KeyArg -o StrictHostKeyChecking=accept-new dist.tar.gz ${SshUser}@${ServerHost}:/tmp/dist.tar.gz"
    Invoke-Expression $ScpCmd

    Write-Host "Extracting to $RemoteWebDir ..." -ForegroundColor Yellow
    $RemoteScript = "sudo mkdir -p $RemoteWebDir && sudo tar -xzf /tmp/dist.tar.gz -C $RemoteWebDir && sudo rm -f /tmp/dist.tar.gz"
    $SshCmd = "ssh -p $SshPort $KeyArg -o StrictHostKeyChecking=accept-new ${SshUser}@${ServerHost} `"$RemoteScript`""
    Invoke-Expression $SshCmd
    Write-Host "Frontend deploy complete!" -ForegroundColor Green
}

# 2. 后端部署
if ($Target -eq "all" -or $Target -eq "backend") {
    Write-Host ""
    Write-Host "[1/2] Packaging backend deploy.tar.gz..." -ForegroundColor Yellow
    & tar.exe -czf deploy.tar.gz server src package.json deploy
    if ($LASTEXITCODE -ne 0) { throw "Archive backend failed" }

    Write-Host "[2/2] Uploading backend code to server..." -ForegroundColor Yellow
    $ScpCmd = "scp -P $SshPort $KeyArg -o StrictHostKeyChecking=accept-new deploy.tar.gz ${SshUser}@${ServerHost}:/tmp/deploy.tar.gz"
    Invoke-Expression $ScpCmd

    Write-Host "Extracting and restarting $ServiceName ..." -ForegroundColor Yellow
    $RemoteScript = "sudo mkdir -p $RemoteServerDir && sudo tar -xzf /tmp/deploy.tar.gz -C $RemoteServerDir && sudo rm -f /tmp/deploy.tar.gz && sudo systemctl restart $ServiceName"
    $SshCmd = "ssh -p $SshPort $KeyArg -o StrictHostKeyChecking=accept-new ${SshUser}@${ServerHost} `"$RemoteScript`""
    Invoke-Expression $SshCmd
    Write-Host "Backend deploy complete!" -ForegroundColor Green
}

Write-Host ""
Write-Host "Checking service health..." -ForegroundColor Cyan
try {
    $ApiRes = Invoke-WebRequest -Uri "$ServerOrigin/api/leaderboard" -UseBasicParsing -TimeoutSec 5
    if ($ApiRes.StatusCode -eq 200) {
        Write-Host "Backend API OK (HTTP 200)" -ForegroundColor Green
    }
} catch {
    Write-Host "Backend check warning: $_" -ForegroundColor Yellow
}

try {
    $WebRes = Invoke-WebRequest -Uri "$ServerOrigin/" -UseBasicParsing -TimeoutSec 5
    if ($WebRes.StatusCode -eq 200) {
        Write-Host "Frontend HTML OK (HTTP 200)" -ForegroundColor Green
    }
} catch {
    Write-Host "Frontend check warning: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "====================================================" -ForegroundColor Green
Write-Host "All deployment tasks completed successfully!" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
