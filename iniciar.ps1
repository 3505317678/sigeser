#Requires -Version 5.1
<#
  Inicia SIGESER en Windows con Docker Desktop.
  La primera vez crea el archivo .env con secretos aleatorios y muestra las credenciales iniciales.
  Uso (en PowerShell, desde la carpeta del proyecto):  .\iniciar.ps1
#>
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Nuevo-Secreto([int]$Bytes) {
    # Generador criptográfico del sistema (no Get-Random, que no es apto para secretos).
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'No se encontró Docker. Instale Docker Desktop, ábralo y vuelva a ejecutar este script.'
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop no está en ejecución. Ábralo, espere a que diga "Engine running" y reintente.' }

function Puerto-Libre([int]$Numero) {
    # Ocupado si algo responde en el puerto (por ejemplo, un Apache) o si no se puede reservar en todas las interfaces.
    $cliente = [System.Net.Sockets.TcpClient]::new()
    try {
        if ($cliente.ConnectAsync('127.0.0.1', $Numero).Wait(300)) { return $false }
    } catch { } finally { $cliente.Dispose() }
    $escucha = $null
    try {
        $escucha = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Numero)
        $escucha.Start()
        return $true
    } catch { return $false } finally { if ($escucha) { $escucha.Stop() } }
}

$puerto = 8080
if (-not (Test-Path '.env')) {
    # El primer puerto libre entre 8080 y 8099 (8080 suele estar ocupado por otros servidores locales).
    $puerto = (8080..8099 | Where-Object { Puerto-Libre $_ } | Select-Object -First 1)
    if (-not $puerto) { throw 'Los puertos 8080 a 8099 están ocupados. Libere uno y vuelva a intentar.' }
    $claveAdmin = Nuevo-Secreto 12
    $claveDemo = Nuevo-Secreto 12
    $contenido = Get-Content '.env.example' -Raw -Encoding UTF8
    $contenido = $contenido.Replace('cambie-esta-clave-por-un-valor-aleatorio-largo', (Nuevo-Secreto 48))
    $contenido = $contenido.Replace('cambie-esta-contrasena-de-base-de-datos', (Nuevo-Secreto 24))
    $contenido = $contenido.Replace('cambie-esta-contrasena-de-administrador', $claveAdmin)
    $contenido = $contenido.Replace('cambie-esta-contrasena-de-demostracion', $claveDemo)
    $contenido = $contenido.Replace('SIGESER_PUERTO=8080', "SIGESER_PUERTO=$puerto")
    $contenido = $contenido.Replace('http://localhost:8080', "http://localhost:$puerto")
    $contenido = $contenido -replace "`r`n", "`n"
    # UTF-8 sin BOM: Docker Compose no reconoce la primera variable si el archivo empieza con BOM.
    [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $contenido, (New-Object System.Text.UTF8Encoding $false))

    Write-Host ''
    Write-Host 'Se creó el archivo .env con secretos aleatorios. Guarde estas credenciales:' -ForegroundColor Yellow
    Write-Host "  Administrador:   admin@sigeser.local   /  $claveAdmin"
    Write-Host "  Usuarios demo:   recepcion@sigeser.local, carlos.rodriguez@sigeser.local,"
    Write-Host "                   andrea.martinez@sigeser.local, julian.herrera@sigeser.local  /  $claveDemo"
    Write-Host '  (También quedan en el archivo .env; no lo comparta.)'
    Write-Host ''
} else {
    $linea = Select-String -Path '.env' -Pattern '^SIGESER_PUERTO=(\d+)' | Select-Object -First 1
    if ($linea) { $puerto = [int]$linea.Matches[0].Groups[1].Value }
}

Write-Host 'Construyendo e iniciando los contenedores (la primera vez tarda varios minutos)...' -ForegroundColor Cyan
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw 'docker compose no pudo iniciar los servicios. Revise el mensaje anterior.' }

$url = "http://localhost:$puerto"
Write-Host 'Esperando a que el sistema responda' -NoNewline
for ($i = 0; $i -lt 90; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "$url/api/v1/salud" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) {
            Write-Host ''
            Write-Host "SIGESER está listo en $url" -ForegroundColor Green
            Start-Process $url
            exit 0
        }
    } catch { }
    Write-Host '.' -NoNewline
    Start-Sleep -Seconds 2
}
Write-Host ''
Write-Warning 'El sistema no respondió a tiempo. Revise los registros con:  docker compose logs backend'
exit 1
