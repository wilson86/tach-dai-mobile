@echo off
setlocal
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync_mobile.ps1"
set "SYNC_EXIT=%ERRORLEVEL%"
echo.
if not "%SYNC_EXIT%"=="0" (
  echo Dong bo that bai. Xem loi o tren.
  echo Bam phim bat ky de dong...
  pause
  exit /b %SYNC_EXIT%
)
echo Bam phim bat ky de dong...
pause
exit /b 0
