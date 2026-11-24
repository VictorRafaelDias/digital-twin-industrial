@echo off
rem ============================================================
rem  Digital Twin Industrial - INICIAR COM DOCKER (duplo clique)
rem  Sobe tudo em conteineres: banco PostgreSQL + servidor (API) + site.
rem  Precisa do Docker Desktop instalado. Nao precisa de Python nem de Node.
rem  Para desligar: PARAR_DOCKER.bat
rem ============================================================
setlocal
title Digital Twin Industrial - Docker
cd /d "%~dp0"

echo.
echo  Digital Twin Industrial - iniciando com Docker...
echo.

where docker >nul 2>nul
if errorlevel 1 (
  echo  [ERRO] Docker nao encontrado. Instale o Docker Desktop: https://www.docker.com/products/docker-desktop/
  echo  Se preferir nao usar Docker, de duplo clique em INICIAR.bat.
  echo.
  pause
  exit /b 1
)

docker info >nul 2>nul
if not errorlevel 1 goto :docker_ok
echo  O Docker Desktop esta fechado. Abrindo...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if exist "%LocalAppData%\Programs\DockerDesktop\Docker Desktop.exe" start "" "%LocalAppData%\Programs\DockerDesktop\Docker Desktop.exe"
echo  Aguardando o Docker ficar pronto - ate uns 3 minutos...
set /a N=0
:espera_docker
docker info >nul 2>nul
if not errorlevel 1 goto :docker_ok
set /a N+=1
if %N% geq 90 goto :docker_falhou
ping -n 3 127.0.0.1 >nul
goto :espera_docker

:docker_falhou
echo.
echo  [ERRO] O Docker nao ficou pronto. Abra o Docker Desktop, espere ele iniciar e tente de novo.
pause
exit /b 1

:docker_ok

rem ---------- A porta 8000 (servidor) e a 8080 (site) estao livres?
call :porta_livre 8000
if errorlevel 1 goto :porta_ocupada
call :porta_livre 8080
if errorlevel 1 goto :porta_ocupada

echo  Ligando banco, servidor e site. Na primeira vez baixa as imagens e demora varios minutos...
echo.
docker compose up -d --build --remove-orphans
if not errorlevel 1 goto :subiu

echo.
echo  [AVISO] Nao consegui atualizar as imagens - talvez sem internet. Tentando ligar com as que ja existem...
echo.
docker compose up -d --remove-orphans
if not errorlevel 1 goto :subiu

echo.
echo  [ERRO] O Docker nao conseguiu subir. Veja a mensagem acima.
pause
exit /b 1

:porta_ocupada
echo.
echo  Nao liguei o sistema porque a porta esta ocupada. Libere a porta e de duplo clique de novo.
pause
exit /b 1

:subiu

echo.
echo  Aguardando ficar pronto...
set /a N=0
:espera
curl -s -o nul http://127.0.0.1:8000/health
if errorlevel 1 goto :nao
curl -s -o nul http://localhost:8080
if errorlevel 1 goto :nao
goto :pronto
:nao
set /a N+=1
if %N% geq 90 goto :demorou
ping -n 2 127.0.0.1 >nul
goto :espera

:demorou
echo.
echo  [ATENCAO] Demorou demais. Rode: docker compose logs   nesta pasta para ver o que houve.
pause
exit /b 1

:pronto
echo.
echo  Tudo pronto!
echo    Site:      http://localhost:8080
echo    Servidor:  http://127.0.0.1:8000/docs
echo    Login:     victor.dias  /  senha1234
echo.
echo  Para desligar: PARAR_DOCKER.bat
start "" http://localhost:8080
timeout /t 8 >nul
exit /b 0

rem ============================================================
rem  Confere se outro conteiner ou programa ocupa a porta %1.
rem  Sai com erro 1 se continuar ocupada.
rem ============================================================
:porta_livre
set "OUTRO="
for /f "usebackq delims=" %%c in (`docker ps --filter "publish=%1" --format "{{.Names}}"`) do (
  echo %%c| findstr /b /c:"digital-twin-industrial" >nul || set "OUTRO=%%c"
)
if not defined OUTRO goto :ver_programa
echo  [ATENCAO] O conteiner "%OUTRO%", de outro projeto, esta usando a porta %1.
choice /c SN /m "  Posso parar esse conteiner agora? Ele nao e apagado."
if errorlevel 2 exit /b 1
docker stop %OUTRO% >nul
echo  Conteiner "%OUTRO%" parado.
:ver_programa
set "PROG="
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %1 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName } | Where-Object { $_ -notmatch 'docker|wslrelay|vpnkit' } | Select-Object -First 1"`) do set "PROG=%%p"
if not defined PROG exit /b 0
echo  [ATENCAO] O programa "%PROG%" esta usando a porta %1.
echo  Se voce ligou o sistema pelo INICIAR.bat, de duplo clique em PARAR.bat antes.
exit /b 1

