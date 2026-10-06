@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
set "PORT=8790"
set "URL=http://localhost:%PORT%"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "NODE=node"
where node >nul 2>nul || set "NODE=%ProgramFiles%\nodejs\node.exe"

call :probe
if "!OURS!"=="1" goto open
if "!BUSY!"=="1" (
  echo Port %PORT% is used by another program. Close it and start Ghillie Ops again.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath '%NODE%' -ArgumentList 'server.js' -WorkingDirectory '%~dp0.' -WindowStyle Hidden"

for /l %%i in (1,1,40) do (
  call :probe
  if "!OURS!"=="1" goto open
  ping -n 2 127.0.0.1 >nul
)
echo The Ghillie Ops server did not start. Is Node.js installed?
pause
exit /b 1

:open
if defined GHILLIE_NO_BROWSER exit /b 0
if exist "%CHROME%" (start "" "%CHROME%" "%URL%") else (start "" "%URL%")
exit /b 0

:probe
set "OURS=0"
set "BUSY=0"
curl.exe -s --max-time 1 "http://127.0.0.1:%PORT%/__ghillieops" 2>nul | findstr /c:"ghillie-ops" >nul && set "OURS=1"
if "!OURS!"=="1" exit /b 0
netstat -ano -p tcp | findstr /r /c:":%PORT%  *0\.0\.0\.0:0 " >nul && set "BUSY=1"
netstat -ano -p tcpv6 | findstr /r /c:":%PORT%  *\[::\]:0 " >nul && set "BUSY=1"
exit /b 0
