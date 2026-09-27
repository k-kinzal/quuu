@echo off
rem The Windows counterpart of bin/quuu. Resources\bin\quuu.cmd inside Quuu, apps\mac\bin in a checkout.
setlocal
set "QUUU_DIR=%~dp0"
if not exist "%QUUU_DIR%quuu.mjs" goto checkout
where node >nul 2>nul
if errorlevel 1 goto bundled
node "%QUUU_DIR%quuu.mjs" %*
exit /b %ERRORLEVEL%

:bundled
rem The app's own runtime stands in for a missing Node, so agents Quuu launches can always reach it.
set ELECTRON_RUN_AS_NODE=1
"%QUUU_DIR%..\..\Quuu.exe" "%QUUU_DIR%quuu.mjs" %*
exit /b %ERRORLEVEL%

:checkout
if not exist "%QUUU_DIR%..\out\cli\quuu.mjs" goto missing
node "%QUUU_DIR%..\out\cli\quuu.mjs" %*
exit /b %ERRORLEVEL%

:missing
echo quuu: CLI has not been built. Run npm run build:cli from the Quuu checkout.>&2
exit /b 1
