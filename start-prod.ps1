# ========== INICIAR MODO PRODUCAO ==========
Write-Host "Iniciando ambiente de PRODUCAO..." -ForegroundColor Red
Write-Host "ATENCAO: Pagamentos reais serao processados!" -ForegroundColor Red
Write-Host ""

# Copiar .env.production para .env.local
Copy-Item ".env.production" ".env.local" -Force
Write-Host "Credenciais de PRODUCAO carregadas." -ForegroundColor Green

# Iniciar servidor em background
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node server.js" -WindowStyle Normal

Start-Sleep 2

# Iniciar ngrok em background
Start-Process powershell -ArgumentList "-NoExit", "-Command", "ngrok http 3000 --request-header-add='ngrok-skip-browser-warning:1'" -WindowStyle Normal

Write-Host ""
Write-Host "Servidor rodando em: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Aguarde o ngrok abrir e copie a URL https://*.ngrok-free.app" -ForegroundColor Cyan
Write-Host "Depois atualize APP_URL no .env.production com essa URL e reinicie." -ForegroundColor Yellow
