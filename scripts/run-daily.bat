@echo off
REM Top-K daily pipeline runner — uses Claude Code Pro CLI (no API key needed)
REM Scheduled via Windows Task Scheduler to run at 1:30 AM UTC (7:00 AM IST)

set TOPK_DIR=C:\Users\Tanisha\Desktop\SystemDesign-projs\topk-site

REM Environment variables (set these to your actual values)
set UPDATE_SECRET=ASDW0912_32ALL
set SITE_BASE=https://topk-site.vercel.app
set MAILERLITE_GROUP_ID=196497502048879775
set FROM_EMAIL=tanisharas@gmail.com
set PATH=%LOCALAPPDATA%\npm;%PATH%

cd /d "%TOPK_DIR%"

REM Run the pipeline (skip email on first test runs, remove flag once verified)
node scripts/run-local.mjs --skip-email

REM Log output for debugging
echo [%DATE% %TIME%] Pipeline completed with exit code %ERRORLEVEL% >> "%TOPK_DIR%\out\pipeline.log"
