@echo off
rem ============================================================
rem  Digital Twin Industrial - PARAR (duplo clique)
rem  Desliga o servidor (porta 8000) e o site (porta 5175) ligados pelo INICIAR.bat.
rem ============================================================
title Digital Twin Industrial - parando
echo.
echo  Desligando o servidor (8000) e o site (5175)...
powershell -NoProfile -Command "foreach ($p in 8000,5175) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host ('  porta ' + $p + ' desligada') } }"
echo.
echo  Pronto. As janelas pretas pedem para apertar uma tecla: pode fechar.
echo  (Os dados continuam guardados em backend\data\digital_twin.db.)
echo.
timeout /t 6 >nul
