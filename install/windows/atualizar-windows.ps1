<#
.SYNOPSIS
    Atualiza o Puxador de Dados mantendo a pasta data (conexoes e mapeamentos).
#>
param(
    [string]$Pasta = "$env:LOCALAPPDATA\PuxadorDados",
    [switch]$SemPausa
)

$ErrorActionPreference = 'Stop'
$repo = 'SamuelNoia/puxador'
$zipUrl = "https://github.com/$repo/archive/refs/heads/main.zip"

Write-Host ""
Write-Host "  Atualizando o Puxador de Dados em $Pasta" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path (Join-Path $Pasta 'server.js'))) {
    Write-Host "  X  Instalacao nao encontrada. Rode o INSTALAR.cmd primeiro." -ForegroundColor Red
    if (-not $SemPausa) { Read-Host 'Enter para fechar' }
    return
}

$temp = Join-Path $env:TEMP ('puxador-up-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $temp | Out-Null
$backup = Join-Path $temp 'data-backup'

try {
    # parar o processo que estiver usando a pasta (se o usuario permitir)
    $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object { $_.CommandLine -like "*$Pasta*" }
    foreach ($p in $procs) {
        Write-Host "  parando processo $($p.ProcessId)..."
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }

    Copy-Item (Join-Path $Pasta 'data') $backup -Recurse -Force -ErrorAction SilentlyContinue

    $zip = Join-Path $temp 'app.zip'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $temp -Force
    $raiz = (Get-ChildItem -Path $temp -Directory | Where-Object { $_.Name -like 'puxador-*' } | Select-Object -First 1).FullName
    if (-not $raiz) { throw 'Pacote baixado invalido.' }

    foreach ($item in @('server.js', 'package.json', 'package-lock.json', 'src', 'public', 'tools', 'docs', 'install', 'README.md')) {
        $o = Join-Path $raiz $item
        if (-not (Test-Path $o)) { continue }
        $d = Join-Path $Pasta $item
        if (Test-Path $o -PathType Container) {
            if (Test-Path $d) { Remove-Item $d -Recurse -Force }
            Copy-Item $o -Destination $d -Recurse -Force
        } else {
            Copy-Item $o -Destination $d -Force
        }
    }

    Push-Location $Pasta
    try {
        $nodeExe = (Get-Command node).Source
        & $nodeExe (Join-Path (Split-Path $nodeExe) 'node_modules\npm\bin\npm-cli.js') install --omit=dev --no-audit --no-fund 2>&1 | Out-Null
    } finally { Pop-Location }

    Write-Host "  OK  Atualizado. Seus dados foram preservados." -ForegroundColor Green
    Write-Host "      Inicie novamente pelo atalho ou pelo iniciar.cmd" -ForegroundColor Gray
} catch {
    Write-Host "  X  Falha na atualizacao: $($_.Exception.Message)" -ForegroundColor Red
    if (Test-Path $backup) {
        Copy-Item $backup (Join-Path $Pasta 'data') -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "      Dados restaurados do backup." -ForegroundColor Yellow
    }
} finally {
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
if (-not $SemPausa) { Read-Host 'Enter para fechar' }
