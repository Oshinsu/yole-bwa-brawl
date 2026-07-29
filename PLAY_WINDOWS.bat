@echo off
setlocal
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python introuvable. Installez Python 3 puis relancez ce fichier.
  echo Astuce : le monofichier YOLE_BWA_BRAWL_TROPICAL_MAYHEM_V3_2_SINGLE_FILE_ONLINE.html fonctionne sans Python.
  pause
  exit /b 1
)
python fetch_three.py
start "YOLE launcher" /min cmd /c "timeout /t 2 /nobreak >nul & explorer http://127.0.0.1:8765/"
echo YOLE: BWA BRAWL — TROPICAL MAYHEM V3.2
echo Serveur local: http://127.0.0.1:8765/
python -m http.server 8765 --bind 127.0.0.1
pause
