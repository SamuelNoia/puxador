<#
.SYNOPSIS
    Instalador do Puxador de Dados para Windows.

.DESCRIPTION
    Verifica o Node.js (22.5+), baixa o projeto do GitHub, instala as dependencias,
    cria a pasta de dados, o atalho na area de trabalho e inicia o portal.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File instalar-windows.ps1

.EXAMPLE
    .\instalar-windows.ps1 -Porta 8800 -Origem .
#>
param(
    [string]$Pasta = "$env:LOCALAPPDATA\PuxadorDados",
    [int]$Porta = 8790,
    [string]$Origem = "",
    [switch]$SemAtalho,
    [switch]$NaoIniciar,
    [switch]$SemPausa
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = 'SamuelNoia/puxador'
$zipUrl = "https://github.com/$repo/archive/refs/heads/main.zip"
$versaoMinima = [version]'22.5.0'

function Info($t) { Write-Host "      $t" -ForegroundColor Gray }
function Ok($t) { Write-Host "      OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "      !   $t" -ForegroundColor Yellow }
function Falhou($t) { Write-Host "      X   $t" -ForegroundColor Red }
function Passo($n, $t) { Write-Host ""; Write-Host "  [$n] $t" -ForegroundColor White }

function AcharNode {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in @(
            "$env:ProgramFiles\nodejs\node.exe",
            "${env:ProgramFiles(x86)}\nodejs\node.exe",
            "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

function VersaoNode($exe) {
    try {
        $bruto = & $exe --version 2>$null
        if (-not $bruto) { return $null }
        return [version]($bruto.Trim().TrimStart('v'))
    } catch { return $null }
}

Clear-Host
Write-Host ""
Write-Host "  ##########################################################" -ForegroundColor DarkCyan
Write-Host "  #            PUXADOR DE DADOS - INSTALADOR               #" -ForegroundColor DarkCyan
Write-Host "  ##########################################################" -ForegroundColor DarkCyan
Write-Host ""
Info "Pasta:  $Pasta"
Info "Porta:  $Porta"
Write-Host ""

if ($Porta -lt 1 -or $Porta -gt 65535) { Falhou "Porta invalida: $Porta"; return }

# ---------------------------------------------------------------- 1. Node.js
Passo 1 'Verificando o Node.js'
$nodeExe = AcharNode
$versao = if ($nodeExe) { VersaoNode $nodeExe } else { $null }

if ($versao -and $versao -ge $versaoMinima) {
    Ok "Node.js $versao"
} else {
    if ($versao) { Aviso "Node.js $versao e antigo (precisa $versaoMinima+)" } else { Aviso 'Node.js nao encontrado' }
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        Info 'Instalando Node.js LTS pelo winget...'
        try {
            & winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements | Out-Null
            $env:PATH = [Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH', 'User')
            $nodeExe = AcharNode
            if ($nodeExe) { $versao = VersaoNode $nodeExe }
            if ($versao -and $versao -ge $versaoMinima) { Ok "Node.js $versao instalado" }
        } catch {
            Falhou "winget falhou: $($_.Exception.Message)"
        }
    }
    if (-not ($versao -and $versao -ge $versaoMinima)) {
        Falhou 'Node.js indisponivel.'
        Info 'Instale a versao LTS em https://nodejs.org e rode o instalador de novo.'
        if (-not $SemPausa) { Read-Host 'Enter para fechar' }
        return
    }
}

# ---------------------------------------------------------------- 2. arquivos
Passo 2 'Obtendo os arquivos'
$temp = Join-Path $env:TEMP ('puxador-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $temp | Out-Null

try {
    if ($Origem) {
        $raiz = (Resolve-Path $Origem).Path
        Ok "Origem local: $raiz"
    } else {
        $zip = Join-Path $temp 'app.zip'
        Info 'Baixando do GitHub...'
        try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
        Invoke-WebRequest -Uri $zipUrl -OutFile $zip -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $temp -Force
        $cand = Get-ChildItem -Path $temp -Directory | Where-Object { $_.Name -like 'puxador-*' } | Select-Object -First 1
        if (-not $cand) { Falhou 'Pacote baixado nao contem a aplicacao.'; return }
        $raiz = $cand.FullName
        Ok 'Download concluido'
    }

    if (-not (Test-Path (Join-Path $raiz 'server.js'))) {
        Falhou 'Os arquivos nao parecem ser o Puxador de Dados.'
        return
    }

    # ------------------------------------------------------------ 3. copia
    Passo 3 "Instalando em $Pasta"
    New-Item -ItemType Directory -Force -Path $Pasta | Out-Null

    $itens = @('server.js', 'package.json', 'package-lock.json', 'README.md', 'LICENSE',
        'src', 'public', 'tools', 'docs', 'Dockerfile', '.dockerignore', '.gitignore',
        'docker-compose.yml', 'instalar.sh', 'instalar-windows.ps1', 'INSTALAR.cmd',
        'iniciar.cmd', 'atualizar-windows.ps1', 'ATUALIZAR.cmd',
        'desinstalar-windows.ps1', 'DESINSTALAR.cmd')

    $n = 0
    foreach ($item in $itens) {
        $o = Join-Path $raiz $item
        if (-not (Test-Path $o)) { continue }
        $d = Join-Path $Pasta $item
        if (Test-Path $o -PathType Container) {
            if (Test-Path $d) { Remove-Item $d -Recurse -Force }
            Copy-Item $o -Destination $d -Recurse -Force
        } else {
            Copy-Item $o -Destination $d -Force
        }
        $n++
    }
    Ok "$n item(ns) copiado(s)"
    New-Item -ItemType Directory -Force -Path (Join-Path $Pasta 'data') | Out-Null

    # ------------------------------------------------------------ 4. dependencias
    Passo 4 'Instalando as dependencias (mysql2, pg, node-firebird)'
    Push-Location $Pasta
    try {
        & $nodeExe (Join-Path (Split-Path $nodeExe) 'node_modules\npm\bin\npm-cli.js') install --omit=dev --no-audit --no-fund 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "npm install retornou $LASTEXITCODE" }
        Ok 'Dependencias instaladas'
    } catch {
        Aviso "Falha ao instalar dependencias: $($_.Exception.Message)"
        Info "Rode manualmente: cd `"$Pasta`" && npm install --omit=dev"
    } finally {
        Pop-Location
    }

    # ------------------------------------------------------------ 5. inicializador
    Passo 5 'Criando o inicializador'
    $iniciar = Join-Path $Pasta 'iniciar.cmd'
    $conteudo = @"
@echo off
title Puxador de Dados
cd /d "%~dp0"
set "NODE_ENV=production"
set "PORT=$Porta"
set "HOST=0.0.0.0"
echo.
echo  Puxador de Dados
echo  Abrindo em http://localhost:$Porta
echo  Para encerrar: feche esta janela ou pressione Ctrl+C
echo.
start "" "http://localhost:$Porta"
"$nodeExe" server.js
echo.
pause
"@
    Set-Content -Path $iniciar -Value $conteudo -Encoding Default -Force
    Ok "iniciar.cmd (porta $Porta)"

    # ------------------------------------------------------------ 6. atalho
    if (-not $SemAtalho) {
        Passo 6 'Criando atalho na area de trabalho'
        $locais = @(
            [Environment]::GetFolderPath('Desktop'),
            (Join-Path $env:USERPROFILE 'Desktop'),
            (Join-Path $env:USERPROFILE 'OneDrive\Desktop')
        ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

        foreach ($local in $locais) {
            try {
                $ws = New-Object -ComObject WScript.Shell
                $lnk = $ws.CreateShortcut((Join-Path $local 'Puxador de Dados.lnk'))
                $lnk.TargetPath = $iniciar
                $lnk.WorkingDirectory = $Pasta
                $lnk.Description = 'Puxador de Dados'
                $lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,21"
                $lnk.Save()
                Ok "Atalho em $local"
                break
            } catch { continue }
        }
    }

    Write-Host ""
    Write-Host "  INSTALACAO CONCLUIDA" -ForegroundColor Green
    Info "Pasta:  $Pasta"
    Info "Acesso: http://localhost:$Porta"
    Write-Host ""

    if (-not $NaoIniciar) {
        Start-Process -FilePath $iniciar -WorkingDirectory $Pasta
    } else {
        Info "Para iniciar: $iniciar"
    }
} finally {
    if (Test-Path $temp) { Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

if (-not $SemPausa) { Read-Host 'Pressione Enter para fechar' }
