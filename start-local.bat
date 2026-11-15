@echo off
rem StudyTrack: local start on Windows without Docker (SQLite database).
rem Requires Python 3.11+ (python.org, tick "Add to PATH") and Node.js 20+ (nodejs.org).
rem First run installs dependencies (needs internet, a few minutes); later runs start in seconds.
setlocal
cd /d "%~dp0"

set "PY=python"
where py >nul 2>nul && set "PY=py -3"
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" 2>nul
if errorlevel 1 (
  echo [!] Python 3.11 or newer is required. Install it from https://www.python.org/downloads/
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js 20 or newer is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)

echo === Backend: virtual environment and dependencies ===
cd /d "%~dp0backend"
if not exist .venv (
  %PY% -m venv .venv || goto :fail
)
call .venv\Scripts\activate.bat || goto :fail
python -m pip install --disable-pip-version-check -q -r requirements.txt || goto :fail

set "NEWDB=0"
if not exist studytrack.db set "NEWDB=1"
python -m alembic upgrade head || goto :fail
if "%NEWDB%"=="1" python -m app.seed

start "StudyTrack API :8000" /D "%~dp0backend" cmd /k "call .venv\Scripts\activate.bat && python -m uvicorn app.main:app --port 8000"

echo === Frontend: dependencies ===
cd /d "%~dp0frontend"
if not exist node_modules (
  call npm install || goto :fail
)
start "StudyTrack Web :5173" /D "%~dp0frontend" cmd /k "npm run dev"

echo.
echo StudyTrack is starting: http://127.0.0.1:5173
echo Demo login: demo@studytrack.ru / demo12345
echo API docs:   http://localhost:8000/api/docs
echo To stop, close the two windows "StudyTrack API" and "StudyTrack Web".
timeout /t 6 >nul
start "" http://127.0.0.1:5173
exit /b 0

:fail
echo [!] Something went wrong, see the messages above.
pause
exit /b 1
