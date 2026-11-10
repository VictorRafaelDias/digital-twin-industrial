@echo off
rem ============================================================
rem  Digital Twin Industrial - PARAR DOCKER (duplo clique)
rem  Desliga os conteineres. Os dados do banco continuam guardados.
rem  (Para apagar tudo e recomecar do zero: docker compose down -v)
rem ============================================================
title Digital Twin Industrial - parando Docker
cd /d "%~dp0"
echo.
docker compose down
echo.
echo  Pronto. Os dados do banco continuam guardados para a proxima vez.
echo.
timeout /t 6 >nul
