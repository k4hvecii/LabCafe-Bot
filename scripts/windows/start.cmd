@echo off
setlocal
cd /d "%~dp0\..\.."
npm start
exit /b %errorlevel%
