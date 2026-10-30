# Servidor Web Local Ligero para "Precios & Gastos" PWA
$Port = 8080
$RootPath = $PSScriptRoot

# Determinar IP Local de la red Wi-Fi
$localIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*", "Ethernet*" -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.254\.' } | Select-Object -First 1).IPAddress
if (-not $localIp) { $localIp = "127.0.0.1" }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
if ($localIp -ne "127.0.0.1") {
    try {
        $listener.Prefixes.Add("http://${localIp}:${Port}/")
    } catch {
        # Si requiere permisos elevados de URL ACL, continúa con localhost
    }
}

try {
    $listener.Start()
} catch {
    Write-Host "El puerto $Port está ocupado, intentando con 8088..." -ForegroundColor Yellow
    $Port = 8088
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Prefixes.Add("http://127.0.0.1:$Port/")
    $listener.Start()
}

Clear-Host
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   CONTROL DE PRECIOS Y GASTOS (PWA) - SERVIDOR ACTIVO    " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "En tu Computadora:" -ForegroundColor Yellow
Write-Host "   http://localhost:$Port" -ForegroundColor White
Write-Host ""
Write-Host "En tu Teléfono Celular (Conectado al mismo Wi-Fi):" -ForegroundColor Yellow
Write-Host "   http://${localIp}:$Port" -ForegroundColor White
Write-Host ""
Write-Host "Tips de Instalación PWA:" -ForegroundColor Cyan
Write-Host " - En la Computadora: Haz clic en el icono de 'Instalar' en la barra del navegador."
Write-Host " - En tu Teléfono: Toca los 3 puntos y elige 'Añadir a pantalla de inicio'."
Write-Host ""
Write-Host "Presiona Ctrl + C en esta ventana para detener el servidor." -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Cyan

# Abrir automáticamente en el navegador de la PC
Start-Process "http://localhost:$Port"

# Mapeo de tipos MIME
$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".webp" = "image/webp"
    ".ico"  = "image/x-icon"
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $rawPath = $request.Url.LocalPath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rawPath)) {
        $rawPath = "index.html"
    }

    $filePath = Join-Path $RootPath $rawPath

    if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $contentType = $mimeTypes[$ext]
        if (-not $contentType) { $contentType = "application/octet-stream" }

        $response.ContentType = $contentType
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Cache-Control", "no-cache")

        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.Close()
    } else {
        $response.StatusCode = 404
        $notFoundMsg = [System.Text.Encoding]::UTF8.GetBytes("Archivo no encontrado: $rawPath")
        $response.ContentLength64 = $notFoundMsg.Length
        $response.OutputStream.Write($notFoundMsg, 0, $notFoundMsg.Length)
        $response.Close()
    }
}
