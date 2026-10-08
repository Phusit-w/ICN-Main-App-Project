# SOC Runner install (ADR 0008, ticket 16), the part every user gets the same.
# The command /soc gives a reviewer fetches it from the server, which puts
# $SocRunnerFiles above it (soc-runner.json with the user's new token, and the
# runner files, base64) and wraps both in & { } (lib/soc-runner-install.ts).
#
# There is no installer .exe: Smart App Control (on, company policy) blocks
# unsigned programs nobody else has run. Everything this runs is accepted on
# its own merits: Windows PowerShell, Python from NuGet (signed by the Python
# Software Foundation), the skill's packages from PyPI, and Claude Code.
# Windows PowerShell 5.1, all in the user profile, no admin. Pasting the
# command again is the repair.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$pythonVersion = '3.12.10'
$pythonSha256 = '0EB85C2DFCCCCF1B17352DE4C397F69194035B7D37149EACC16F1147D93DE3B8'
$root = Join-Path $env:LOCALAPPDATA 'SOCRunner'
$app = Join-Path $root 'app'
$python = Join-Path $app 'python'
$runner = Join-Path $app 'runner'

function Write-Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }

function Remove-Folder($path) {
    # A runner just stopped may hold its files for a moment.
    for ($attempt = 1; Test-Path $path; $attempt++) {
        try { Remove-Item -Recurse -Force $path }
        catch { if ($attempt -ge 10) { throw }; Start-Sleep -Milliseconds 500 }
    }
}

try {
    Write-Step 'หยุด SOC Runner เดิม (ถ้ามี)'
    Get-Process python, pythonw, SOCRunner -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -like "$app\*" } |
        ForEach-Object { cmd.exe /c "taskkill /PID $($_.Id) /T /F >nul 2>&1" }
    New-Item -ItemType Directory -Force $root | Out-Null
    Remove-Folder $app

    Write-Step "ดาวน์โหลด Python $pythonVersion"
    $package = Join-Path $root 'python.zip'
    $unpacked = Join-Path $root 'python.tmp'
    Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/python/$pythonVersion/python.$pythonVersion.nupkg" -OutFile $package -UseBasicParsing
    if ((Get-FileHash $package -Algorithm SHA256).Hash -ne $pythonSha256) { throw 'ไฟล์ Python ที่ดาวน์โหลดไม่ตรงกับที่ควรเป็น (checksum) ลองใหม่อีกครั้ง' }
    Remove-Folder $unpacked
    Expand-Archive $package $unpacked
    New-Item -ItemType Directory -Force $app | Out-Null
    Move-Item (Join-Path $unpacked 'tools') $python
    Remove-Item -Force $package
    Remove-Folder $unpacked
    # The runner runs on pythonw.exe under its own name, so Task Manager shows
    # "SOCRunner" rather than an unexplained Python (install.py starts it).
    Copy-Item (Join-Path $python 'pythonw.exe') (Join-Path $python 'SOCRunner.exe')

    New-Item -ItemType Directory -Force $runner | Out-Null
    foreach ($name in $SocRunnerFiles.Keys) {
        $folder = if ($name -eq 'soc-runner.json') { $root } else { $runner }
        [IO.File]::WriteAllBytes((Join-Path $folder $name), [Convert]::FromBase64String($SocRunnerFiles[$name]))
    }

    Write-Step 'ติดตั้ง package ที่ skill ใช้ (python-docx, PyMuPDF, openpyxl)'
    & (Join-Path $python 'python.exe') -m pip install --disable-pip-version-check --no-warn-script-location --only-binary=:all: -q -r (Join-Path $runner 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw "ติดตั้ง package ไม่สำเร็จ (pip exit $LASTEXITCODE) ตรวจว่าเครื่องเข้า pypi.org ได้" }

    Write-Step 'ติดตั้ง Claude Code, ตั้งให้เริ่มเอง, เข้าสู่ระบบ Claude แล้วเริ่ม SOC Runner'
    & (Join-Path $python 'python.exe') (Join-Path $runner 'install.py') $root
    if ($LASTEXITCODE -ne 0) { throw "install.py exit $LASTEXITCODE" }
    Write-Host 'ติดตั้ง SOC Runner เสร็จแล้ว ปิดหน้าต่างนี้ได้' -ForegroundColor Green
} catch {
    Write-Host "ติดตั้งไม่สำเร็จ: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'สร้างคำสั่งติดตั้งใหม่ที่หน้า ตรวจสอบ SOC แล้ววางอีกครั้ง ถ้ายังไม่ได้ ส่งข้อความนี้ให้ผู้ดูแล' -ForegroundColor Red
}
