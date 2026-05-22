#requires -Version 5.1
# Arranca Overtree en modo dev y abre el navegador cuando el server ya responde.
# Portable: se ubica solo via $PSScriptRoot, respeta $env:PORT (default 3000).

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Refresca PATH por si node/npm se instalaron via winget en esta sesion.
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
            [Environment]::GetEnvironmentVariable('Path','User')

$port = if ($env:PORT) { $env:PORT } else { 3000 }
$url  = "http://localhost:$port"

Write-Host "Iniciando Overtree en $url ..." -ForegroundColor Cyan

# Watcher en segundo plano: espera a que el puerto acepte conexiones y abre el navegador.
Start-Job -ArgumentList $url, $port {
  param($url, $port)
  for ($i = 0; $i -lt 120; $i++) {
    try {
      $c = New-Object Net.Sockets.TcpClient
      $c.Connect("localhost", [int]$port)
      $c.Close()
      Start-Process $url
      return
    } catch { Start-Sleep -Milliseconds 500 }
  }
} | Out-Null

# Server en primer plano: esta ventana muestra los logs. Cerrarla detiene Overtree.
npm run dev
