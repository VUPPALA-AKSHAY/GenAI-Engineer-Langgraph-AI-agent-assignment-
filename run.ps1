# Starts local backend (:8000) and frontend (:3000).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "== Backend: installing deps (venv) ==" -ForegroundColor Cyan
& "$Root\backend\venv\Scripts\python.exe" -m pip install -r "$Root\backend\requirements.txt" --quiet

Write-Host "== Starting backend on http://localhost:8000 ==" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\backend'; .\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000"

Write-Host "== Starting frontend on http://localhost:3000 ==" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\frontend'; npm run dev -- --port 3000"

Write-Host "Done. Open http://localhost:3000 and type: Introduction to RAG" -ForegroundColor Green
