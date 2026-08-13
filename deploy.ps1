# Script de Deploy Automático para Hostinger via FTP
$ftpHost = "ftp://ftp.anorak.hubdigital360.com"
$username = "u576215103.anorak"
$password = ":jJbLt|E5"
$localDir = $PSScriptRoot

Write-Host "Iniciando upload para $ftpHost..." -ForegroundColor Cyan

function Upload-File($localFilePath, $remoteRelativePath) {
    $remoteUri = "$ftpHost/$remoteRelativePath"
    $req = [System.Net.FtpWebRequest]::Create($remoteUri)
    $req.Credentials = New-Object System.Net.NetworkCredential($username, $password)
    $req.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
    $req.UseBinary = $true
    $req.KeepAlive = $false

    try {
        $content = [System.IO.File]::ReadAllBytes($localFilePath)
        $req.ContentLength = $content.Length
        $requestStream = $req.GetRequestStream()
        $requestStream.Write($content, 0, $content.Length)
        $requestStream.Close()
        $requestStream.Dispose()
        Write-Host " [OK] $remoteRelativePath" -ForegroundColor Green
    } catch {
        Write-Host " [ERRO] $remoteRelativePath : $_" -ForegroundColor Red
    }
}

function Create-FtpDirectory($remoteRelativePath) {
    $remoteUri = "$ftpHost/$remoteRelativePath"
    $req = [System.Net.FtpWebRequest]::Create($remoteUri)
    $req.Credentials = New-Object System.Net.NetworkCredential($username, $password)
    $req.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
    $req.KeepAlive = $false
    try {
        $response = $req.GetResponse()
        $response.Close()
        Write-Host " [DIR CRIADO] $remoteRelativePath" -ForegroundColor Yellow
    } catch {
        # Diretório já existe ou sem permissão para recriar
    }
}

# Cria pastas no servidor se necessário
Create-FtpDirectory "css"
Create-FtpDirectory "js"

# Envia arquivos
Upload-File "$localDir\index.html" "index.html"
Upload-File "$localDir\css\variables.css" "css/variables.css"
Upload-File "$localDir\css\base.css" "css/base.css"
Upload-File "$localDir\css\components.css" "css/components.css"
Upload-File "$localDir\css\animations.css" "css/animations.css"
Upload-File "$localDir\js\models.js" "js/models.js"
Upload-File "$localDir\js\db.js" "js/db.js"
Upload-File "$localDir\js\voice.js" "js/voice.js"
Upload-File "$localDir\js\matrix.js" "js/matrix.js"
Upload-File "$localDir\js\sync.js" "js/sync.js"
Upload-File "$localDir\js\app.js" "js/app.js"

Write-Host "`nDeploy finalizado com sucesso! Acesse: http://anorak.hubdigital360.com" -ForegroundColor Cyan
