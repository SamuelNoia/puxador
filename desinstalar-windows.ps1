<#
.SYNOPSIS
    Desinstala o Puxador de Dados.
.DESCRIPTION
    Encerra o servidor, remove o atalho e a pasta de instalacao.
    A pasta data (conexoes e mapeamentos) so e apagada com -ApagarDados.
#>
param(
    [string]$Pasta = "$env:LOCALAPPDATA\PuxadorDados",
    [switch]$ApagarDados,
    [switch]$SemPausa
)

Write-Host ""
Write-Host "  Desinstalando o Puxador de Dados" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $Pasta)) {
    Write-Host "  Nada instalado em $Pasta" -ForegroundColor Yellow
    if (-not $SemPausa) { Read-Host 'Enter para fechar' }
    return
}

$procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like "*$Pasta*" }
foreach ($p in $procs) {
    Write-Host "  encerrando processo $($p.ProcessId)..."
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}

$atalho = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Puxador de Dados.lnk'
if (Test-Path $atalho) {
    Remove-Item $atalho -Force -ErrorAction SilentlyContinue
    Write-Host "  atalho removido" -ForegroundColor Gray
}

if (-not $ApagarDados) {
    $confirm = Read-Host "  Apagar tambem as conexoes e mapeamentos (data)? [s/N]"
    if ($confirm -eq 's' -or $confirm -eq 'S') { $ApagarDados = $true }
}

if (-not $ApagarDados) {
    $guardar = Join-Path (Split-Path $Pasta) 'PuxadorDados-data'
    Copy-Item (Join-Path $Pasta 'data') $guardar -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  dados preservados em $guardar" -ForegroundColor Yellow
}

Remove-Item $Pasta -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "  OK  Desinstalado." -ForegroundColor Green
Write-Host ""
if (-not $SemPausa) { Read-Host 'Enter para fechar' }
