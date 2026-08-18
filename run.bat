@echo off
setlocal

rem ==================================================================
rem  STEEL CRADLE - launcher
rem
rem  Opening index.html directly (file://) breaks the BGM:
rem  browsers refuse to fetch() local files, so the music never loads.
rem  Sound effects still work because they are synthesised in code.
rem  This script serves the folder over HTTP instead.
rem
rem  ASCII only on purpose - cmd.exe mis-parses non-ASCII .bat files.
rem  Japanese notes live in README.md.
rem ==================================================================

cd /d "%~dp0"
set PORT=8765

set PY=
where py >nul 2>&1 && set PY=py
if "%PY%"=="" (
  where python >nul 2>&1 && set PY=python
)

if "%PY%"=="" (
  echo.
  echo   Python not found.
  echo   Install it from https://www.python.org/downloads/
  echo   or serve this folder over HTTP some other way.
  echo.
  pause
  exit /b 1
)

echo.
echo   STEEL CRADLE
echo   ----------------------------------------
echo   URL  : http://127.0.0.1:%PORT%/
echo   Stop : close this window, or press Ctrl+C
echo.

start "" "http://127.0.0.1:%PORT%/index.html"

rem dev_server.py serves with no-cache headers. Without it the browser can
rem keep a stale index.html, miss a newly added script, and the game dies
rem silently (black screen, frozen enemies). Fall back to http.server if
rem the file is missing.
if exist "dev_server.py" (
  %PY% dev_server.py %PORT%
) else (
  %PY% -m http.server %PORT% --bind 127.0.0.1
)

endlocal
