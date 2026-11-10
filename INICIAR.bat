@echo off
rem ============================================================
rem  Digital Twin Industrial - INICIAR (duplo clique)
rem  Liga o servidor (API, porta 8000) e o site (porta 5175) e abre o navegador.
rem  Para desligar: PARAR.bat
rem ============================================================
setlocal
title Digital Twin Industrial - iniciando
cd /d "%~dp0"

echo.
echo  Digital Twin Industrial - iniciando...
echo.

rem ---------- 1) Python
set "PY="
python --version >nul 2>nul && set "PY=python"
if not defined PY ( py -3 --version >nul 2>nul && set "PY=py -3" )
if not defined PY (
  echo  [ERRO] Python nao encontrado.
  echo  Instale em https://www.python.org/downloads/ e marque a caixa "Add python.exe to PATH".
  echo  Depois de instalar, de duplo clique em INICIAR.bat de novo.
  echo.
  pause
  exit /b 1
)

rem ---------- 2) Node.js (so para o site)
where npm >nul 2>nul
if errorlevel 1 (
  echo  [ERRO] Node.js nao encontrado.
  echo  Instale em https://nodejs.org/ - versao LTS - e de duplo clique em INICIAR.bat de novo.
  echo.
  pause
  exit /b 1
)

rem ---------- 3) Pacotes que faltam (so na primeira vez; precisa de internet)
%PY% -c "import fastapi, uvicorn, sqlalchemy, pydantic, pypdf" >nul 2>nul
if errorlevel 1 (
  echo  [1/2] Instalando os pacotes do Python - so na primeira vez, pode demorar...
  %PY% -m pip install -r "%~dp0backend\requirements.txt"
  if errorlevel 1 (
    echo.
    echo  [ERRO] Nao consegui instalar os pacotes do Python. Veja a mensagem acima.
    pause
    exit /b 1
  )
)
if not exist "%~dp0app\node_modules" (
  echo  [2/2] Instalando os pacotes do site - so na primeira vez, pode demorar...
  pushd "%~dp0app"
  call npm install
  if errorlevel 1 (
    popd
    echo.
    echo  [ERRO] Nao consegui instalar os pacotes do site. Veja a mensagem acima.
    pause
    exit /b 1
  )
  popd
)

rem ---------- 4) Servidor (API)
curl -s -o nul http://127.0.0.1:8000/health
if errorlevel 1 (
  echo  Ligando o servidor na porta 8000...
  start "Digital Twin - SERVIDOR (API)" /d "%~dp0backend" cmd /c "%PY% -m uvicorn app.main:app --host 127.0.0.1 --port 8000 & echo. & echo O servidor parou. Pode fechar esta janela. & pause"
) else (
  echo  O servidor ja estava ligado.
)

rem ---------- 5) Site (front-end). VITE_API_URL ja deixa "Usar o servidor" marcado na tela de login.
curl -s -o nul http://localhost:5175
if errorlevel 1 (
  echo  Ligando o site na porta 5175...
  set "VITE_API_URL=http://127.0.0.1:8000"
  start "Digital Twin - SITE" /d "%~dp0app" cmd /c "npm run dev & echo. & echo O site parou. Pode fechar esta janela. & pause"
) else (
  echo  O site ja estava ligado.
)

rem ---------- 6) Espera ficar pronto (ate ~90 segundos) e abre o navegador
echo.
echo  Aguardando ficar pronto...
set /a N=0
:espera
curl -s -o nul http://127.0.0.1:8000/health
if errorlevel 1 goto :nao_api
curl -s -o nul http://localhost:5175
if errorlevel 1 goto :nao_site
goto :pronto
:nao_api
:nao_site
set /a N+=1
if %N% geq 90 goto :demorou
ping -n 2 127.0.0.1 >nul
goto :espera

:demorou
echo.
echo  [ATENCAO] Demorou mais de 90 segundos. Olhe as duas janelas pretas que abriram:
echo  alguma mensagem de erro deve aparecer nelas. Tente de novo depois de PARAR.bat.
echo.
pause
exit /b 1

:pronto
echo.
echo  Tudo pronto!
echo    Site:      http://localhost:5175
echo    Servidor:  http://127.0.0.1:8000/docs  (documentacao da API)
echo    Login:     victor.dias  /  senha1234
echo.
echo  Deixe as duas janelas pretas abertas enquanto usa. Para desligar tudo: PARAR.bat
start "" http://localhost:5175
echo.
timeout /t 8 >nul
exit /b 0
