@echo off
REM Top-K daily pipeline runner — uses Claude Code Pro CLI (no API key needed)
REM Scheduled via Windows Task Scheduler to run at 7:00 AM IST
REM
REM IMPORTANT: Do NOT set ANTHROPIC_API_KEY here — Claude Code Pro uses OAuth.
REM If ANTHROPIC_API_KEY is set in your environment, unset it first.

set TOPK_DIR=C:\Users\Tanisha\Desktop\SystemDesign-projs\topk-site

REM Clear any stale API key so Claude Code uses OAuth (Pro subscription)
set ANTHROPIC_API_KEY=

REM Environment variables
set UPDATE_SECRET=ASDW0912_32ALL
set SITE_BASE=https://topk-site.vercel.app
set MAILERLITE_GROUP_ID=196497502048879775
set FROM_EMAIL=tanisharas@gmail.com
set PATH=%LOCALAPPDATA%\npm;%PATH%

cd /d "%TOPK_DIR%"

REM Run the pipeline
node scripts/run-local.mjs

REM Log output for debugging
echo [%DATE% %TIME%] Pipeline completed with exit code %ERRORLEVEL% >> "%TOPK_DIR%\out\pipeline.log"
