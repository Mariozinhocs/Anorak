# Script de Deploy Automático para Homologação (HML) via FTP
$ftpHost = "ftp://ftp.anorak.hubdigital360.com"
$username = "u576215103.anorak"
$password = ":jJbLt|E5"
$localDir = $PSScriptRoot

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  ANORAK OASIS - Deploy para HOMOLOGAÇÃO (/hml)  " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

function Upload-File($localFilePath, $remoteRelativePath) {
    if (-not (Test-Path $localFilePath)) {
        Write-Host " [PULADO] Arquivo não encontrado: $localFilePath" -ForegroundColor DarkGray
        return
    }
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

# 1. Cria a estrutura de pastas remotas no ambiente /hml
Create-FtpDirectory "hml"
Create-FtpDirectory "hml/css"
Create-FtpDirectory "hml/js"
Create-FtpDirectory "hml/api"

# 2. Configura temporariamente o .env de homologação
$hasEnv = Test-Path "$localDir\.env"
if ($hasEnv) { Copy-Item "$localDir\.env" "$localDir\.env.bak" -Force }

if (Test-Path "$localDir\.env.hml") {
    Copy-Item "$localDir\.env.hml" "$localDir\.env" -Force
}

try {
    # 3. Envio dos arquivos do Frontend
    Upload-File "$localDir\index.html" "hml/index.html"
    Upload-File "$localDir\css\variables.css" "hml/css/variables.css"
    Upload-File "$localDir\css\base.css" "hml/css/base.css"
    Upload-File "$localDir\css\components.css" "hml/css/components.css"
    Upload-File "$localDir\css\animations.css" "hml/css/animations.css"
    Upload-File "$localDir\js\models.js" "hml/js/models.js"
    Upload-File "$localDir\js\db.js" "hml/js/db.js"
    Upload-File "$localDir\js\voice.js" "hml/js/voice.js"
    Upload-File "$localDir\js\matrix.js" "hml/js/matrix.js"
    Upload-File "$localDir\js\sync.js" "hml/js/sync.js"
    Upload-File "$localDir\js\app.js" "hml/js/app.js"

    # 4. Envio dos arquivos do Backend e Banco de Dados
    Upload-File "$localDir\db_installer.php" "hml/db_installer.php"
    Upload-File "$localDir\.env" "hml/.env"
    Upload-File "$localDir\api\config.php" "hml/api/config.php"
    Upload-File "$localDir\api\schema.sql" "hml/api/schema.sql"
    Upload-File "$localDir\api\items.php" "hml/api/items.php"

    Write-Host "`n=================================================" -ForegroundColor Green
    Write-Host " Deploy HML finalizado com sucesso!" -ForegroundColor Green
    Write-Host " Acesse a aplicação: http://anorak.hubdigital360.com/hml/" -ForegroundColor Cyan
    Write-Host " Instalador do Banco: http://anorak.hubdigital360.com/hml/db_installer.php" -ForegroundColor Yellow
    Write-Host "=================================================" -ForegroundColor Green
}
finally {
    if (Test-Path "$localDir\.env.bak") {
        Move-Item "$localDir\.env.bak" "$localDir\.env" -Force
    }
}
