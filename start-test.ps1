# ========== INICIAR MODO TESTE ==========
Write-Host "Iniciando ambiente de TESTE..." -ForegroundColor Yellow

# Copiar .env.test para .env.local
Copy-Item ".env.test" ".env.local" -Force
Write-Host "Credenciais de TESTE carregadas." -ForegroundColor Green

# Iniciar servidor em background
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node server.js" -WindowStyle Normal

Start-Sleep 2

# Iniciar ngrok em background
Start-Process powershell -ArgumentList "-NoExit", "-Command", "ngrok http 3000 --request-header-add='ngrok-skip-browser-warning:1'" -WindowStyle Normal

Write-Host ""
Write-Host "Servidor rodando em: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Aguarde o ngrok abrir e copie a URL https://*.ngrok-free.app" -ForegroundColor Cyan
Write-Host ""
Write-Host "Conta compradora de teste:" -ForegroundColor Yellow
Write-Host "  Usuario: TESTUSER6416... (veja no painel MP > Contas de teste)" -ForegroundColor White
Write-Host "  Senha:   jw5ck21O2t" -ForegroundColor White
