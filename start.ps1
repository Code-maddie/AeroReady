# AeroReady one-command launcher (Windows PowerShell).
#   .\start.ps1        set up if needed, build the UI, serve everything on http://localhost:8000
#   .\start.ps1 -Dev   run API (:8000) + Vite dev server with hot reload (:5173)
param([switch]$Dev)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$py = Join-Path $root "backend\.venv\Scripts\python.exe"

if (-not (Test-Path $py)) {
    Write-Host "Creating Python venv and installing backend requirements..." -ForegroundColor Cyan
    python -m venv (Join-Path $root "backend\.venv")
    & $py -m pip install -q -r (Join-Path $root "backend\requirements.txt")
}
if (-not (Test-Path (Join-Path $root "frontend\node_modules"))) {
    Write-Host "Installing frontend packages..." -ForegroundColor Cyan
    Push-Location (Join-Path $root "frontend"); npm ci; Pop-Location
}

if ($Dev) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; & '$py' -m uvicorn aeroready.api.main:app --port 8000 --reload"
    Push-Location (Join-Path $root "frontend"); npm run dev; Pop-Location
} else {
    Write-Host "Building frontend..." -ForegroundColor Cyan
    Push-Location (Join-Path $root "frontend"); npm run build; Pop-Location
    Write-Host "AeroReady running at http://localhost:8000  (Ctrl+C to stop)" -ForegroundColor Green
    Start-Process "http://localhost:8000"
    Push-Location (Join-Path $root "backend")
    & $py -m uvicorn aeroready.api.main:app --port 8000
    Pop-Location
}
