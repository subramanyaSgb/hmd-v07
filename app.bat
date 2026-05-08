@echo off
setlocal enabledelayedexpansion
title HMD System Manager v5.0

:: ============================================
:: Global Error Handler - Prevent console from closing on errors
:: ============================================
if "%~1"=="--from-error" (
    echo.
    echo   [!] An unexpected error occurred. Check the messages above.
    pause
    exit /b 1
)

:: ============================================
:: Configuration
:: ============================================
:: Python venv directory (was conda env "hmd_env" before May 2026 — see
:: changes_tracker.md). Lives at the repo root, gitignored. To recreate
:: from scratch: `rmdir /s /q .venv` then re-run this script.
set VENV_DIR=.venv
set PYTHON_VERSION=3.10
set BACKEND_PORT=8000
set FRONTEND_PORT=5173
set REDIS_PORT=6379
set WHATSAPP_PORT=3002
set LOG_DIR=logs\startup

:: Create log directory
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: ============================================
:: Main Entry Point
:: ============================================
:main_menu
cls
call :draw_header
call :draw_main_menu
goto :eof

:: ============================================
:: Draw Header
:: ============================================
:draw_header
echo.
echo   +========================================================================+
echo   :                                                                        :
echo   :   HH   HH  MM    MM  DDDD       SSSSS  YY   YY  SSSSS                  :
echo   :   HH   HH  MMM  MMM  DD  DD     SS      YY YY   SS                     :
echo   :   HHHHHHH  MM MM MM  DD   DD     SSS     YYY     SSS                   :
echo   :   HH   HH  MM    MM  DD  DD        SS    YY        SS                  :
echo   :   HH   HH  MM    MM  DDDD       SSSSS    YY    SSSSS                   :
echo   :                                                                        :
echo   :        --------------------------------------------------------        :
echo   :          Hot Metal Distribution System  :  Version 5.0                 :
echo   :        --------------------------------------------------------        :
echo   :                                                                        :
echo   +========================================================================+
echo.
goto :eof

:: ============================================
:: Draw Main Menu
:: ============================================
:draw_main_menu
echo   +------------------------------------------------------------------------+
echo   :                        MAIN CONTROL PANEL                              :
echo   +------------------------------------------------------------------------+
echo   :                                                                        :
echo   :      [1]  Start Services        Launch Application Services       ^>^>   :
echo   :                                                                        :
echo   :      [2]  Stop Services         Stop Running Services             ^>^>   :
echo   :                                                                        :
echo   :      [3]  Documentation         Build ^& Open Dev Docs            ^>^>   :
echo   :                                                                        :
echo   :      [4]  System Status         Check Running Services                 :
echo   :                                                                        :
echo   :      [5]  Exit                  Close This Console                     :
echo   :                                                                        :
echo   +------------------------------------------------------------------------+
echo.
set /p "MAIN_CHOICE=       Enter your choice [1-5]: "

if "%MAIN_CHOICE%"=="1" goto :start_menu
if "%MAIN_CHOICE%"=="2" goto :stop_menu
if "%MAIN_CHOICE%"=="3" goto :documentation_menu
if "%MAIN_CHOICE%"=="4" goto :status_check
if "%MAIN_CHOICE%"=="5" goto :exit_app
goto :main_menu

:: ============================================
:: Start Services Menu
:: ============================================
:start_menu
cls
call :draw_header
echo   +------------------------------------------------------------------------+
echo   :                       START SERVICES PANEL                             :
echo   +------------------------------------------------------------------------+
echo   :                                                                        :
echo   :      [1]  Start Full Stack      Backend + Frontend + Redis + WhatsApp  :
echo   :                                                                        :
echo   :      [2]  Start Backend         Python API Server Only                 :
echo   :                                                                        :
echo   :      [3]  Start Frontend        React Development Server               :
echo   :                                                                        :
echo   :      [4]  Start WhatsApp        WhatsApp Notification Service          :
echo   :                                                                        :
echo   :      [0]  Back                  Return to Main Menu               ^<^<   :
echo   :                                                                        :
echo   +------------------------------------------------------------------------+
echo.
set /p "START_CHOICE=       Enter your choice [0-4]: "

if "%START_CHOICE%"=="0" goto :main_menu
if "%START_CHOICE%"=="1" goto :start_full
if "%START_CHOICE%"=="2" goto :start_backend_only
if "%START_CHOICE%"=="3" goto :start_frontend_only
if "%START_CHOICE%"=="4" goto :start_whatsapp_only
goto :start_menu

:: ============================================
:: Stop Services Menu
:: ============================================
:stop_menu
cls
call :draw_header
echo   +------------------------------------------------------------------------+
echo   :                        STOP SERVICES PANEL                             :
echo   +------------------------------------------------------------------------+
echo   :                                                                        :
echo   :      [1]  Stop All Services     Backend + Frontend + Redis + WhatsApp  :
echo   :                                                                        :
echo   :      [2]  Stop Backend          Stop Python API Server                 :
echo   :                                                                        :
echo   :      [3]  Stop Frontend         Stop React Dev Server                  :
echo   :                                                                        :
echo   :      [4]  Stop Redis            Stop Redis Cache                       :
echo   :                                                                        :
echo   :      [5]  Stop WhatsApp         Stop WhatsApp Service                  :
echo   :                                                                        :
echo   :      [0]  Back                  Return to Main Menu               ^<^<   :
echo   :                                                                        :
echo   +------------------------------------------------------------------------+
echo.
set /p "STOP_CHOICE=       Enter your choice [0-5]: "

if "%STOP_CHOICE%"=="0" goto :main_menu
if "%STOP_CHOICE%"=="1" goto :stop_all
if "%STOP_CHOICE%"=="2" goto :stop_backend
if "%STOP_CHOICE%"=="3" goto :stop_frontend
if "%STOP_CHOICE%"=="4" goto :stop_redis
if "%STOP_CHOICE%"=="5" goto :stop_whatsapp
goto :stop_menu

:: ============================================
:: Documentation Menu
:: ============================================
:documentation_menu
cls
call :draw_header
echo   +------------------------------------------------------------------------+
echo   :                      DOCUMENTATION PANEL                               :
echo   +------------------------------------------------------------------------+
echo   :                                                                        :
echo   :      [1]  Build ^& Open         Build latest docs and open browser     :
echo   :                                                                        :
echo   :      [2]  Open Only             Open existing docs (skip build)        :
echo   :                                                                        :
echo   :      [3]  Dev Server            Start docs dev server (hot reload)     :
echo   :                                                                        :
echo   :      [0]  Back                  Return to Main Menu               ^<^<   :
echo   :                                                                        :
echo   +------------------------------------------------------------------------+
echo.
set /p "DOC_CHOICE=       Enter your choice [0-3]: "

if "%DOC_CHOICE%"=="0" goto :main_menu
if "%DOC_CHOICE%"=="1" goto :build_and_open_docs
if "%DOC_CHOICE%"=="2" goto :open_docs_only
if "%DOC_CHOICE%"=="3" goto :docs_dev_server
goto :documentation_menu

:build_and_open_docs
cls
call :draw_header
echo.
echo   +------------------------------------------------------------------------+
echo   :  BUILDING DEVELOPER DOCUMENTATION (MkDocs)                            :
echo   +------------------------------------------------------------------------+
echo.

:: Check Python
where python >nul 2>&1
if errorlevel 1 (
    echo     [X] Python is required for MkDocs documentation
    echo     [!] Please install Python 3.8+ and try again
    call :press_any_key
    goto :documentation_menu
)
echo     [OK] Python found

:: Check if developer-docs exists
if not exist "..\Document\developer-docs\mkdocs.yml" (
    echo     [X] ..\Document\developer-docs\mkdocs.yml not found
    call :press_any_key
    goto :documentation_menu
)
echo     [OK] MkDocs project found

:: Step 1: Check MkDocs installation
echo.
echo     [1/2] Checking MkDocs installation...
python -m mkdocs --version >nul 2>&1
if errorlevel 1 (
    echo     [!] MkDocs not installed - installing now...
    pip install mkdocs mkdocs-material
    if errorlevel 1 (
        echo     [X] Failed to install MkDocs
        call :press_any_key
        goto :documentation_menu
    )
)
echo     [OK] MkDocs ready

:: Step 2: Start documentation server (builds automatically on startup)
echo.
echo     [2/2] Starting documentation server...
echo           (MkDocs will build on startup - this may take ~30 seconds)
echo.

:: Check if docs server is already running on port 8002
netstat -an 2>nul | findstr ":8002 " | findstr "LISTENING" > nul 2>&1
if not errorlevel 1 (
    echo     [!] Docs server already running on port 8002
    echo     [OK] Opening existing documentation...
    start http://localhost:8002
    call :press_any_key
    goto :documentation_menu
)

echo   +========================================================================+
echo   :  STARTING DOCUMENTATION SERVER                                         :
echo   +========================================================================+
echo   :                                                                        :
echo   :      Dev Docs  :  http://localhost:8002                               :
echo   :      API Docs  :  http://localhost:%BACKEND_PORT%/docs                          :
echo   :                                                                        :
echo   :      Building documentation... (this takes ~30 seconds)               :
echo   :                                                                        :
echo   +========================================================================+
echo.
start "HMD Docs" cmd /k "title HMD Docs && cd ..\Document\developer-docs && mkdocs serve -a localhost:8002"
call :wait_for_docs_server
start http://localhost:8002
echo.
echo     [OK] Documentation server ready!
call :press_any_key
goto :documentation_menu

:open_docs_only
cls
call :draw_header
echo.
echo   +------------------------------------------------------------------------+
echo   :  OPENING DOCUMENTATION                                                 :
echo   +------------------------------------------------------------------------+
echo.

:: Check if server is already running
netstat -an 2>nul | findstr ":8002 " | findstr "LISTENING" > nul 2>&1
if not errorlevel 1 (
    echo     [OK] Docs server already running
    echo     [OK] Opening documentation...
    start http://localhost:8002
    call :press_any_key
    goto :documentation_menu
)

:: Check if build exists
if not exist "..\Document\developer-docs\site\index.html" (
    echo     [X] Documentation not built yet
    echo     [!] Please use option [1] to build first
    call :press_any_key
    goto :documentation_menu
)

echo     [*] Starting MkDocs server...
start "HMD Docs" cmd /k "title HMD Docs && cd ..\Document\developer-docs && mkdocs serve -a localhost:8002"
call :wait_for_docs_server
start http://localhost:8002
echo.
echo     [OK] Documentation ready!
call :press_any_key
goto :documentation_menu

:docs_dev_server
cls
call :draw_header
echo.
echo   +------------------------------------------------------------------------+
echo   :  STARTING DOCUMENTATION DEV SERVER                                     :
echo   +------------------------------------------------------------------------+
echo.

:: Check if server is already running
netstat -an 2>nul | findstr ":8002 " | findstr "LISTENING" > nul 2>&1
if not errorlevel 1 (
    echo     [OK] Docs dev server already running on port 8002
    echo     [OK] Opening documentation...
    start http://localhost:8002
    call :press_any_key
    goto :documentation_menu
)

echo     [*] Starting MkDocs development server...
echo     [*] Hot-reload enabled for documentation editing
echo.
start "HMD Docs Dev" cmd /k "title HMD Docs Dev && cd ..\Document\developer-docs && mkdocs serve -a localhost:8002"
call :wait_for_docs_server
start http://localhost:8002
echo.
echo     [OK] Dev server ready at http://localhost:8002
call :press_any_key
goto :documentation_menu

:: ============================================
:: Stop All Services
:: ============================================
:stop_all
cls
call :draw_header
echo.
echo   +------------------------------------------------------------------------+
echo   :  STOPPING ALL SERVICES                                                 :
echo   +------------------------------------------------------------------------+

call :stop_backend_process
call :stop_frontend_process
call :stop_redis_process
call :stop_whatsapp_process
call :close_hmd_windows

echo.
echo   +========================================================================+
echo   :  [OK] All services have been stopped successfully                      :
echo   +========================================================================+
call :press_any_key
goto :main_menu

:: ============================================
:: Stop Backend Only
:: ============================================
:stop_backend
cls
call :draw_header
echo.
echo   +------------------------------------------------------------------------+
echo   :  STOPPING BACKEND                                                      :
echo   +------------------------------------------------------------------------+

call :stop_backend_process
call :close_hmd_windows

echo.
echo   +========================================================================+
echo   :  [OK] Backend service stopped successfully                             :
echo   +========================================================================+
call :press_any_key
goto :stop_menu

:: ============================================
:: Stop Frontend Only
:: ============================================
:stop_frontend
cls
call :draw_header
echo.
echo   +------------------------------------------------------------------------+
echo   :  STOPPING FRONTEND                                                     :
echo   +------------------------------------------------------------------------+

call :stop_frontend_process
call :close_hmd_windows

echo.
echo   +========================================================================+
echo   :  [OK] Frontend service stopped successfully                            :
echo   +========================================================================+
call :press_any_key
goto :stop_menu

:: ============================================
:: Stop Redis Only
:: ============================================
:stop_redis
cls
call :draw_header
echo.
echo   +------------------------------------------------------------------------+
echo   :  STOPPING REDIS                                                        :
echo   +------------------------------------------------------------------------+

call :stop_redis_process

echo.
echo   +========================================================================+
echo   :  [OK] Redis cache stopped successfully                                 :
echo   +========================================================================+
call :press_any_key
goto :stop_menu

:: ============================================
:: Stop WhatsApp Only
:: ============================================
:stop_whatsapp
cls
call :draw_header
echo.
echo   +------------------------------------------------------------------------+
echo   :  STOPPING WHATSAPP SERVICE                                             :
echo   +------------------------------------------------------------------------+

call :stop_whatsapp_process

echo.
echo   +========================================================================+
echo   :  [OK] WhatsApp service stopped successfully                            :
echo   +========================================================================+
call :press_any_key
goto :stop_menu

:: ============================================
:: Stop Process Functions
:: ============================================
:stop_backend_process
echo.
echo   [*] Stopping Backend Server...
:: Kill process on port
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%BACKEND_PORT% " ^| findstr "LISTENING"') do (
    echo       - Terminating process %%a on port %BACKEND_PORT%
    taskkill /F /PID %%a > nul 2>&1
)
:: Kill uvicorn/python processes
taskkill /F /IM "uvicorn.exe" > nul 2>&1
:: Kill the backend terminal window
taskkill /F /FI "WINDOWTITLE eq HMD Backend*" > nul 2>&1
taskkill /F /FI "WINDOWTITLE eq HMD Backend" > nul 2>&1
echo       + Backend stopped
goto :eof

:stop_frontend_process
echo.
echo   [*] Stopping Frontend Server...
:: Kill process on port
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%FRONTEND_PORT% " ^| findstr "LISTENING"') do (
    echo       - Terminating process %%a on port %FRONTEND_PORT%
    taskkill /F /PID %%a > nul 2>&1
)
:: Kill the frontend terminal window
taskkill /F /FI "WINDOWTITLE eq HMD Frontend*" > nul 2>&1
taskkill /F /FI "WINDOWTITLE eq HMD Frontend" > nul 2>&1
echo       + Frontend stopped
goto :eof

:stop_redis_process
echo.
echo   [*] Stopping Redis Cache...
taskkill /F /IM "redis-server.exe" > nul 2>&1
echo       + Redis stopped
goto :eof

:stop_whatsapp_process
echo.
echo   [*] Stopping WhatsApp Service...
:: Kill process on port
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%WHATSAPP_PORT% " ^| findstr "LISTENING"') do (
    echo       - Terminating process %%a on port %WHATSAPP_PORT%
    taskkill /F /PID %%a > nul 2>&1
)
:: Kill node processes for whatsapp
taskkill /F /FI "WINDOWTITLE eq HMD WhatsApp*" > nul 2>&1
taskkill /F /FI "WINDOWTITLE eq HMD WhatsApp" > nul 2>&1
echo       + WhatsApp service stopped
goto :eof

:close_hmd_windows
echo.
echo   [*] Closing HMD Terminal Windows...
:: Kill cmd windows by title - only Backend, Frontend, WhatsApp, NOT the System Manager
taskkill /F /FI "WINDOWTITLE eq HMD Backend*" > nul 2>&1
taskkill /F /FI "WINDOWTITLE eq HMD Frontend*" > nul 2>&1
taskkill /F /FI "WINDOWTITLE eq HMD WhatsApp*" > nul 2>&1
:: Also try without wildcard
taskkill /F /FI "WINDOWTITLE eq HMD Backend" > nul 2>&1
taskkill /F /FI "WINDOWTITLE eq HMD Frontend" > nul 2>&1
taskkill /F /FI "WINDOWTITLE eq HMD WhatsApp" > nul 2>&1
echo       + Terminal windows closed
goto :eof

:: ============================================
:: Start Services
:: ============================================
:start_full
set CHOICE=1
goto :start_services

:start_backend_only
set CHOICE=2
goto :start_services

:start_frontend_only
set CHOICE=3
goto :start_services

:start_whatsapp_only
set CHOICE=4
goto :start_services

:start_services
cls
call :draw_header

if "%CHOICE%"=="1" set "MODE_LABEL=FULL STACK"
if "%CHOICE%"=="2" set "MODE_LABEL=BACKEND ONLY"
if "%CHOICE%"=="3" set "MODE_LABEL=FRONTEND ONLY"
if "%CHOICE%"=="4" set "MODE_LABEL=WHATSAPP SERVICE"

echo.
echo   +------------------------------------------------------------------------+
echo   :  STARTING %MODE_LABEL%
echo   +------------------------------------------------------------------------+

:: Step 1: Validate Prerequisites
echo.
echo   [STEP 1/6] Validating Prerequisites
echo   ------------------------------------------------------------------------

where python >nul 2>&1
if errorlevel 1 (
    echo     [X] Python not found on PATH. Install Python %PYTHON_VERSION%+ from https://www.python.org/downloads/
    goto :error
)
for /f "tokens=*" %%i in ('python --version') do echo     [OK] %%i

if "%CHOICE%"=="2" goto :skip_node_check

where node >nul 2>&1
if errorlevel 1 (
    echo     [X] Node.js not found. Please install Node.js 18+.
    goto :error
)
for /f "tokens=*" %%i in ('node --version') do echo     [OK] Node.js %%i

where npm >nul 2>&1
if errorlevel 1 (
    echo     [X] npm not found.
    goto :error
)
echo     [OK] npm found

:skip_node_check
:: Skip venv setup for WhatsApp-only start (no Python deps needed there)
if "%CHOICE%"=="4" goto :skip_venv

:: Step 2: Check Port Availability
echo.
echo   [STEP 2/6] Checking Port Availability
echo   ------------------------------------------------------------------------

if "%CHOICE%"=="1" call :check_port %BACKEND_PORT% Backend
if "%CHOICE%"=="1" call :check_port %FRONTEND_PORT% Frontend
if "%CHOICE%"=="1" call :check_port %WHATSAPP_PORT% WhatsApp
if "%CHOICE%"=="2" call :check_port %BACKEND_PORT% Backend
if "%CHOICE%"=="3" call :check_port %FRONTEND_PORT% Frontend
if "%CHOICE%"=="4" call :check_port %WHATSAPP_PORT% WhatsApp

:: Step 3: Setup Python venv
if "%CHOICE%"=="3" goto :skip_venv

echo.
echo   [STEP 3/6] Setting Up Python Environment (venv)
echo   ------------------------------------------------------------------------

:: Make sure system python is available before we try to bootstrap the venv.
where python > nul 2>&1
if errorlevel 1 (
    echo     [X] python not found on PATH.
    echo     [!] Install Python %PYTHON_VERSION% or newer from https://www.python.org/downloads/
    echo     [!] then re-run this script.
    goto :error
)

if exist "%VENV_DIR%\Scripts\activate.bat" goto :venv_exists
echo     Creating virtual environment in %VENV_DIR%...
python -m venv %VENV_DIR% > "%LOG_DIR%\venv_create.log" 2>&1
if errorlevel 1 (
    echo     [X] Failed to create venv
    echo     [!] Error details:
    type "%LOG_DIR%\venv_create.log" 2>nul
    goto :error
)
echo     [OK] venv created at %VENV_DIR%
goto :venv_done
:venv_exists
echo     [OK] venv %VENV_DIR% exists
:venv_done

echo     Activating environment...
call "%VENV_DIR%\Scripts\activate.bat"
if errorlevel 1 (
    echo     [X] Failed to activate venv
    goto :error
)

echo     Installing/updating backend dependencies...
python -m pip install --upgrade pip -q > "%LOG_DIR%\pip_install.log" 2>&1
pip install -r backend\requirements.txt -q >> "%LOG_DIR%\pip_install.log" 2>&1
if errorlevel 1 goto :pip_had_issues
echo     [OK] Dependencies installed
goto :pip_done
:pip_had_issues
echo     [!] Some pip packages may have issues
echo     [!] Errors from pip install:
type "%LOG_DIR%\pip_install.log" 2>nul | findstr /i "error ERROR Error"
call :press_any_key
:pip_done

:skip_venv

:: Step 4: Setup Frontend Dependencies
if "%CHOICE%"=="2" goto :skip_frontend_deps
if "%CHOICE%"=="4" goto :skip_frontend_deps

echo.
echo   [STEP 4/6] Setting Up Frontend Dependencies
echo   ------------------------------------------------------------------------

cd frontend
if exist node_modules goto :frontend_deps_ready
echo     Installing npm packages...
call npm install > "..\%LOG_DIR%\npm_install.log" 2>&1
if errorlevel 1 (
    echo     [X] npm install failed
    echo     [!] Error details:
    type "..\%LOG_DIR%\npm_install.log" 2>nul | findstr /i "error ERROR ERR!"
    cd ..
    goto :error
)
echo     [OK] npm packages installed
goto :frontend_deps_done
:frontend_deps_ready
echo     [OK] node_modules exists
:frontend_deps_done
cd ..

:skip_frontend_deps

:: Step 4b: Setup WhatsApp Service Dependencies
if "%CHOICE%"=="2" goto :skip_whatsapp_deps
if "%CHOICE%"=="3" goto :skip_whatsapp_deps

echo.
echo   [STEP 4b/6] Setting Up WhatsApp Service Dependencies
echo   ------------------------------------------------------------------------

cd whatsapp-service
if exist node_modules goto :whatsapp_deps_ready
echo     Installing WhatsApp service npm packages...
call npm install > "..\%LOG_DIR%\npm_whatsapp_install.log" 2>&1
if errorlevel 1 (
    echo     [X] WhatsApp npm install failed
    echo     [!] Error details:
    type "..\%LOG_DIR%\npm_whatsapp_install.log" 2>nul | findstr /i "error ERROR ERR!"
    cd ..
    goto :error
)
echo     [OK] WhatsApp packages installed
goto :whatsapp_deps_done
:whatsapp_deps_ready
echo     [OK] WhatsApp node_modules exists
:whatsapp_deps_done
cd ..

:skip_whatsapp_deps

:: Step 5: Check Redis
if "%CHOICE%"=="3" goto :skip_redis_start
if "%CHOICE%"=="4" goto :skip_redis_start

echo.
echo   [STEP 5/6] Checking Redis Cache
echo   ------------------------------------------------------------------------

netstat -an 2>nul | findstr ":%REDIS_PORT% " | findstr "LISTENING" > nul 2>&1
if not errorlevel 1 (
    echo     [OK] Redis running on port %REDIS_PORT%
) else (
    echo     [!] Redis not running - using in-memory cache fallback
)

:skip_redis_start

:: Step 6: Start Applications
echo.
echo   [STEP 6/6] Starting Applications
echo   ------------------------------------------------------------------------

if "%CHOICE%"=="1" goto :start_all_apps
if "%CHOICE%"=="2" goto :start_backend_app
if "%CHOICE%"=="3" goto :start_frontend_app
if "%CHOICE%"=="4" goto :start_whatsapp_app

:start_all_apps
echo     [^>^>] Starting all services in background (hidden windows)...
echo.

:: Start services minimized - user won't see terminal windows
start /MIN "HMD Backend" cmd /k "title HMD Backend && call %VENV_DIR%\Scripts\activate.bat && uvicorn backend.main:app --reload --port %BACKEND_PORT%"

start /MIN "HMD Frontend" cmd /k "title HMD Frontend && cd frontend && npm run dev"

start /MIN "HMD WhatsApp" cmd /k "title HMD WhatsApp && cd whatsapp-service && npm start"

echo     [OK] Services started in background (minimized)
goto :wait_and_open

:start_backend_app
echo     [^>^>] Starting Backend on http://localhost:%BACKEND_PORT%
start /MIN "HMD Backend" cmd /k "title HMD Backend && call %VENV_DIR%\Scripts\activate.bat && uvicorn backend.main:app --reload --port %BACKEND_PORT%"
goto :wait_backend

:start_frontend_app
echo     [^>^>] Starting Frontend on http://localhost:%FRONTEND_PORT%
start /MIN "HMD Frontend" cmd /k "title HMD Frontend && cd frontend && npm run dev"
goto :wait_frontend

:start_whatsapp_app
echo     [^>^>] Starting WhatsApp on http://localhost:%WHATSAPP_PORT%
start /MIN "HMD WhatsApp" cmd /k "title HMD WhatsApp && cd whatsapp-service && npm start"
goto :wait_whatsapp

:: ============================================
:: Health Checks and Browser Launch
:: ============================================
:wait_and_open
echo.
echo   [*] Waiting for services to start...
echo       Checking backend health...

set ATTEMPTS=0
:backend_loop
set /a ATTEMPTS+=1
if %ATTEMPTS% gtr 30 (
    echo     [!] Backend health check timeout - may still be starting
    goto :open_browser
)
timeout /t 1 /nobreak > nul
curl -s http://localhost:%BACKEND_PORT%/api/health > nul 2>&1
if errorlevel 1 (
    echo       Waiting... %ATTEMPTS%/30
    goto :backend_loop
)
echo     [OK] Backend is ready

:open_browser
echo.
echo   +========================================================================+
echo   :                HMD SYSTEM STARTED SUCCESSFULLY!                        :
echo   +========================================================================+
echo   :                                                                        :
echo   :      Backend   :  http://localhost:%BACKEND_PORT%                              :
echo   :      Frontend  :  http://localhost:%FRONTEND_PORT%                              :
echo   :      WhatsApp  :  http://localhost:%WHATSAPP_PORT%                              :
echo   :      API Docs  :  http://localhost:%BACKEND_PORT%/docs                          :
echo   :                                                                        :
echo   +========================================================================+
echo.
echo   Opening browser...
start http://localhost:%FRONTEND_PORT%
call :press_any_key
goto :main_menu

:wait_backend
echo.
echo       Checking backend health...
set ATTEMPTS=0
:backend_only_loop
set /a ATTEMPTS+=1
if %ATTEMPTS% gtr 30 (
    echo     [!] Backend may still be starting
    goto :backend_done
)
timeout /t 1 /nobreak > nul
curl -s http://localhost:%BACKEND_PORT%/api/health > nul 2>&1
if errorlevel 1 goto :backend_only_loop
echo     [OK] Backend is ready
:backend_done
echo.
echo       Backend:  http://localhost:%BACKEND_PORT%
echo       API Docs: http://localhost:%BACKEND_PORT%/docs
start http://localhost:%BACKEND_PORT%/docs
call :press_any_key
goto :main_menu

:wait_frontend
echo.
timeout /t 5 /nobreak > nul
echo       Frontend: http://localhost:%FRONTEND_PORT%
start http://localhost:%FRONTEND_PORT%
call :press_any_key
goto :main_menu

:wait_whatsapp
echo.
echo       Checking WhatsApp service health...
set ATTEMPTS=0
:whatsapp_loop
set /a ATTEMPTS+=1
if %ATTEMPTS% gtr 15 (
    echo     [!] WhatsApp service may still be starting
    goto :whatsapp_done
)
timeout /t 1 /nobreak > nul
curl -s http://localhost:%WHATSAPP_PORT%/health > nul 2>&1
if errorlevel 1 goto :whatsapp_loop
echo     [OK] WhatsApp service is ready
:whatsapp_done
echo.
echo       WhatsApp: http://localhost:%WHATSAPP_PORT%
echo       Status:   http://localhost:%WHATSAPP_PORT%/status
call :press_any_key
goto :main_menu

:: ============================================
:: Status Check
:: ============================================
:status_check
cls
call :draw_header
echo.
echo   +------------------------------------------------------------------------+
echo   :  SYSTEM STATUS                                                         :
echo   +------------------------------------------------------------------------+
echo.
echo   +------------------------------------------------------------------------+
echo   :                         SERVICE STATUS                                 :
echo   +------------------------------------------------------------------------+

curl -s http://localhost:%BACKEND_PORT%/api/health > nul 2>&1
if errorlevel 1 (
    echo   :      Backend      :  [OFFLINE]                                       :
) else (
    echo   :      Backend      :  [RUNNING] on port %BACKEND_PORT%                        :
)

netstat -an 2>nul | findstr ":%FRONTEND_PORT% " | findstr "LISTENING" > nul 2>&1
if errorlevel 1 (
    echo   :      Frontend     :  [OFFLINE]                                       :
) else (
    echo   :      Frontend     :  [RUNNING] on port %FRONTEND_PORT%                        :
)

netstat -an 2>nul | findstr ":%REDIS_PORT% " | findstr "LISTENING" > nul 2>&1
if errorlevel 1 (
    echo   :      Redis        :  [OFFLINE] using fallback                        :
) else (
    echo   :      Redis        :  [RUNNING] on port %REDIS_PORT%                         :
)

netstat -an 2>nul | findstr ":5432 " | findstr "LISTENING" > nul 2>&1
if errorlevel 1 (
    echo   :      PostgreSQL   :  [OFFLINE]                                       :
) else (
    echo   :      PostgreSQL   :  [RUNNING] on port 5432                          :
)

curl -s http://localhost:%WHATSAPP_PORT%/health > nul 2>&1
if errorlevel 1 (
    echo   :      WhatsApp     :  [OFFLINE]                                       :
) else (
    echo   :      WhatsApp     :  [RUNNING] on port %WHATSAPP_PORT%                         :
)

echo   +------------------------------------------------------------------------+

call :press_any_key
goto :main_menu

:: ============================================
:: Utility Functions
:: ============================================
:check_port
netstat -an 2>nul | findstr ":%~1 " | findstr "LISTENING" > nul 2>&1
if not errorlevel 1 (
    echo     [!] Port %~1 ^(%~2^) is already in use
) else (
    echo     [OK] Port %~1 ^(%~2^) is available
)
goto :eof

:wait_for_docs_server
:: Wait for docs server with loading indicator
set /a "ELAPSED=0"
set /a "MAX_WAIT=60"
set "DOTS="
echo.
<nul set /p "=    [*] Building"
:docs_wait_loop
:: Check if server is responding
curl -s -o nul http://localhost:8002 >nul 2>&1
if not errorlevel 1 goto :docs_server_ready

:: Check if max wait exceeded
if %ELAPSED% geq %MAX_WAIT% (
    echo.
    echo     [!] Timeout - server may still be building
    goto :eof
)

:: Print a dot every 2 seconds
set /a "MOD=ELAPSED %% 2"
if %MOD%==0 <nul set /p "=."

:: Increment counter and wait
set /a "ELAPSED+=1"
timeout /t 1 /nobreak >nul
goto :docs_wait_loop

:docs_server_ready
echo  Done! (%ELAPSED%s)
goto :eof

:press_any_key
echo.
echo   Press any key to return to menu...
pause > nul
goto :eof

:error
echo.
echo   +========================================================================+
echo   :  [X] SETUP FAILED - Please check the errors above                      :
echo   +========================================================================+
echo   :                                                                        :
echo   :  Troubleshooting tips:                                                 :
echo   :    - Check if all prerequisites are installed                          :
echo   :    - Review log files in %LOG_DIR%\                           :
echo   :    - Try running the command manually to see full output               :
echo   :                                                                        :
echo   +========================================================================+
echo.
echo   Press any key to return to menu (window will NOT close)...
pause > nul
goto :main_menu

:exit_app
cls
echo.
echo   +========================================================================+
echo   :                                                                        :
echo   :            Thank you for using HMD System Manager!                     :
echo   :                                                                        :
echo   :                          Goodbye!                                      :
echo   :                                                                        :
echo   +========================================================================+
echo.
timeout /t 2 /nobreak > nul
exit /b 0

:: ============================================
:: Unexpected Error Trap
:: This label catches any unexpected script termination
:: ============================================
:unexpected_error
echo.
echo   +========================================================================+
echo   :  [!] An unexpected error occurred                                      :
echo   +========================================================================+
echo   :                                                                        :
echo   :  The script encountered an unexpected issue. Please:                   :
echo   :    1. Note any error messages displayed above                          :
echo   :    2. Check log files in %LOG_DIR%\                           :
echo   :    3. Restart the application and try again                            :
echo   :                                                                        :
echo   +========================================================================+
echo.
pause
exit /b 1
