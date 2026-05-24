# ════════════════════════════════════════════════════════════════════
# fix-dns.ps1
# Conserta o DNS local pra resolver *.supabase.co
#
# COMO USAR:
#   1. Abra o Explorer e navegue até: scripts\fix-dns.ps1
#   2. Clique direito → "Executar com PowerShell"  (talvez precise
#      autorizar o UAC)
#   OU
#   1. Clique no menu Iniciar → digite "PowerShell"
#   2. Clique direito em "Windows PowerShell" → "Executar como
#      administrador"
#   3. Cole: cd "C:\Users\jlcar\OneDrive\Documentos\Meus repos\Projeto-mae"
#   4. Cole: powershell -ExecutionPolicy Bypass -File scripts\fix-dns.ps1
# ════════════════════════════════════════════════════════════════════

#Requires -RunAsAdministrator

Write-Host ""
Write-Host "═══ Diagnostico inicial ═══" -ForegroundColor Cyan
try {
  $check = Resolve-DnsName "npgtngcdskwcsmgymkql.supabase.co" -ErrorAction Stop
  Write-Host "DNS local JA resolve! Nada a fazer." -ForegroundColor Green
  $check | Where-Object Type -eq A | Select-Object Name, IPAddress | Format-Table -AutoSize
  exit 0
} catch {
  Write-Host "DNS local NAO resolve: vamos consertar." -ForegroundColor Yellow
}

# ─── Plano A: trocar DNS da interface ativa para Cloudflare/Google ───
Write-Host ""
Write-Host "═══ Plano A: Trocar DNS da interface ativa ═══" -ForegroundColor Cyan
$activeAdapter = Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object -First 1
if ($activeAdapter) {
  Write-Host "Interface ativa: $($activeAdapter.Name) ($($activeAdapter.InterfaceDescription))"
  try {
    Set-DnsClientServerAddress -InterfaceIndex $activeAdapter.ifIndex -ServerAddresses 1.1.1.1, 8.8.8.8 -ErrorAction Stop
    Write-Host "OK: DNS da interface trocado para 1.1.1.1 e 8.8.8.8" -ForegroundColor Green
    ipconfig /flushdns | Out-Null
    Start-Sleep -Seconds 2
    try {
      $r = Resolve-DnsName "npgtngcdskwcsmgymkql.supabase.co" -ErrorAction Stop
      Write-Host "Resolveu apos a troca:" -ForegroundColor Green
      $r | Where-Object Type -eq A | Select-Object Name, IPAddress | Format-Table -AutoSize
      Write-Host ""
      Write-Host "Pronto. Pode rodar 'npm run dev' agora." -ForegroundColor Green
      exit 0
    } catch {
      Write-Host "Ainda nao resolveu apos trocar DNS. Indo pro Plano B." -ForegroundColor Yellow
    }
  } catch {
    Write-Host "Falha ao trocar DNS: $($_.Exception.Message)" -ForegroundColor Red
  }
} else {
  Write-Host "Nenhuma interface ativa encontrada. Indo pro Plano B." -ForegroundColor Yellow
}

# ─── Plano B: editar hosts file com IP direto ────────────────────────
Write-Host ""
Write-Host "═══ Plano B: Adicionar entrada no hosts ═══" -ForegroundColor Cyan
$hostsFile = "$env:SystemRoot\System32\drivers\etc\hosts"
$existing = Get-Content $hostsFile -Raw

if ($existing -match "npgtngcdskwcsmgymkql\.supabase\.co") {
  Write-Host "Entrada ja existe no hosts." -ForegroundColor Yellow
} else {
  $entry = "`n# Workaround DNS local quebrado para Supabase`n172.64.149.246  npgtngcdskwcsmgymkql.supabase.co"
  Add-Content -Path $hostsFile -Value $entry
  Write-Host "OK: entrada adicionada ao hosts." -ForegroundColor Green
}

ipconfig /flushdns | Out-Null
Start-Sleep -Seconds 1

try {
  $r = Resolve-DnsName "npgtngcdskwcsmgymkql.supabase.co" -ErrorAction Stop
  Write-Host ""
  Write-Host "Resolveu pelo hosts:" -ForegroundColor Green
  $r | Where-Object Type -eq A | Select-Object Name, IPAddress | Format-Table -AutoSize
  Write-Host "Pronto. Pode rodar 'npm run dev' agora." -ForegroundColor Green
} catch {
  Write-Host "Ainda nao resolveu. Verifique firewall ou proxy de rede." -ForegroundColor Red
  exit 1
}
