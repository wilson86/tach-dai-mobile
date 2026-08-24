@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish_update.ps1"
set "UPDATE_EXIT=%ERRORLEVEL%"
if not "%UPDATE_EXIT%"=="0" (
  echo.
  echo CAP NHAT THAT BAI. Xem thong bao o tren, sau do bam phim bat ky.
  pause
  exit /b %UPDATE_EXIT%
)
echo.
echo CAP NHAT THANH CONG. Bam phim bat ky de dong cua so.
pause
exit /b 0
