# ========== INICIAR MODO TESTE ==========
Write-Host ""
Write-Host "========================================" -ForegroundColor DarkMagenta
Write-Host "   ATELIE DA ESCOLA — MODO TESTE" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor DarkMagenta
Write-Host ""

# Copiar .env.test para .env.local
Copy-Item ".env.test" ".env.local" -Force
Write-Host "[1/4] Credenciais de TESTE carregadas." -ForegroundColor Green

# Iniciar ngrok em background e aguardar URL
Write-Host "[2/4] Iniciando ngrok..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "ngrok http 3000 --request-header-add='ngrok-skip-browser-warning:1'" -WindowStyle Normal

# Aguardar ngrok subir e capturar URL via API local
$ngrokUrl = $null
$attempts = 0
while (-not $ngrokUrl -and $attempts -lt 20) {
    Start-Sleep 1
    $attempts++
    try {
        $tunnels = Invoke-RestMethod "http://localhost:4040/api/tunnels" -ErrorAction Stop
        $ngrokUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1).public_url
    } catch {}
}

if ($ngrokUrl) {
    Write-Host "[3/4] ngrok ativo: $ngrokUrl" -ForegroundColor Green

    # Atualizar APP_URL no .env.local automaticamente
    $envContent = Get-Content ".env.local" -Raw
    $envContent = $envContent -replace "(?m)^APP_URL=.*$", "APP_URL=$ngrokUrl"
    Set-Content ".env.local" $envContent -NoNewline
    Write-Host "      APP_URL atualizado no .env.local automaticamente." -ForegroundColor DarkGreen
} else {
    Write-Host "[3/4] ngrok nao respondeu a tempo. APP_URL nao atualizado." -ForegroundColor Red
    Write-Host "      Atualize APP_URL no .env.local manualmente se necessario." -ForegroundColor Yellow
}

# Iniciar servidor Node
Write-Host "[4/4] Iniciando servidor Node..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node server.js" -WindowStyle Normal

Start-Sleep 2

Write-Host ""
Write-Host "========================================" -ForegroundColor DarkMagenta
Write-Host " PRONTO! Acesse o site em:" -ForegroundColor White
Write-Host " http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host " IMPORTANTE: Use SEMPRE localhost:3000" -ForegroundColor Yellow
Write-Host " O ngrok e so para o webhook (MP -> servidor)" -ForegroundColor DarkYellow
Write-Host " Login pelo ngrok da erro no Firebase!" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor DarkMagenta
Write-Host ""
Write-Host "Conta compradora de teste (MercadoPago Sandbox):" -ForegroundColor Yellow
Write-Host "  Usuario: TESTUSER6416... (veja no painel MP > Contas de teste)" -ForegroundColor White
Write-Host "  Senha:   jw5ck21O2t" -ForegroundColor White
if ($ngrokUrl) {
    Write-Host ""
    Write-Host 'Webhook configurado em:' -ForegroundColor DarkYellow
    Write-Host "  $($ngrokUrl)/api/webhook" -ForegroundColor White
}
Write-Host ""
