# 只读手机存储审计：生成本地报告，不会删除或修改手机文件。
$ErrorActionPreference = 'Stop'
$adb = 'C:\Users\25852\AppData\Local\Android\Sdk\platform-tools\adb.exe'
$reportDir = Join-Path $PSScriptRoot 'phone-storage-report-2026-07-22'
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null

function Save-AdbOutput {
    param([string]$Name, [string]$Command)
    & $adb shell $Command 2>&1 | Out-File -LiteralPath (Join-Path $reportDir $Name) -Encoding utf8
}

& $adb start-server | Out-Null
& $adb devices -l 2>&1 | Out-File -LiteralPath (Join-Path $reportDir 'device-status.txt') -Encoding utf8
Save-AdbOutput 'storage-capacity.txt' 'df -h /sdcard'
Save-AdbOutput 'top-level-size.txt' 'du -sk /sdcard/* 2>/dev/null | sort -nr'
Save-AdbOutput 'largest-files.txt' 'find /sdcard -type f -exec du -k {} \; 2>/dev/null | sort -nr | head -n 200'
Save-AdbOutput 'all-files.txt' 'find /sdcard -type f 2>/dev/null | sort'
Save-AdbOutput 'media-folders.txt' 'for d in /sdcard/DCIM /sdcard/Download /sdcard/Pictures /sdcard/Movies /sdcard/Music /sdcard/Android/data /sdcard/Android/media; do if [ -e "$d" ]; then echo "=== $d ==="; du -sk "$d" 2>/dev/null; fi; done'
Save-AdbOutput 'cache-candidates.txt' 'find /sdcard -type f \( -iname "*.apk" -o -iname "*.apks" -o -iname "*.xapk" -o -iname "*.zip" -o -iname "*.rar" -o -iname "*.7z" -o -iname "*.log" -o -iname "*.tmp" -o -iname "*.bak" \) -exec du -k {} \; 2>/dev/null | sort -nr'

& $adb kill-server | Out-Null
Write-Output $reportDir
