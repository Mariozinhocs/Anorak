# Script de Deploy Automático para Produção (PROD / Raiz) via FTP
$ftpHost = "ftp://ftp.anorak.hubdigital360.com"
$username = "u576215103.anorak"
$password = ":jJbLt|E5"
$localDir = $PSScriptRoot

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  ANORAK OASIS - Deploy para PRODUÇÃO (Raiz)     " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

function Upload-File($localFilePath, $remoteRelativePath) {
    if (-not (Test-Path $localFilePath)) {
        Write-Host " [PULADO] $remoteRelativePath (Arquivo inexistente)" -ForegroundColor DarkGray
        return
    }
    $remoteUri = "$ftpHost/$remoteRelativePath"
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Credentials = New-Object System.Net.NetworkCredential($username, $password)
        $wc.UploadFile($remoteUri, "STOR", $localFilePath)
        $wc.Dispose()
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
        # Diretório já existe
    }
}

# 1. Cria a estrutura de pastas remotas na raiz
Create-FtpDirectory "css"
Create-FtpDirectory "js"
Create-FtpDirectory "api"
Create-FtpDirectory "api/auth"
Create-FtpDirectory "api/users"
Create-FtpDirectory "api/admin"
Create-FtpDirectory "assets"

# 2. Configura temporariamente o .env de produção se existir
$hasEnv = Test-Path "$localDir\.env"
if ($hasEnv) { Copy-Item "$localDir\.env" "$localDir\.env.bak" -Force }

if (Test-Path "$localDir\.env.prod") {
    Copy-Item "$localDir\.env.prod" "$localDir\.env" -Force
}

try {
    # 3. Envio dos arquivos do Frontend (Home, Login, App Privado)
    Upload-File "$localDir\index.html" "index.html"
    Upload-File "$localDir\login.html" "login.html"
    Upload-File "$localDir\app.html" "app.html"

    # 4. Envio dos arquivos CSS
    Upload-File "$localDir\css\variables.css" "css/variables.css"
    Upload-File "$localDir\css\base.css" "css/base.css"
    Upload-File "$localDir\css\components.css" "css/components.css"
    Upload-File "$localDir\css\animations.css" "css/animations.css"
    Upload-File "$localDir\css\home.css" "css/home.css"
    Upload-File "$localDir\css\login.css" "css/login.css"

    # 5. Envio dos módulos JavaScript
    Upload-File "$localDir\index.html" "index.html"
    Upload-File "$localDir\login.html" "login.html"
    Upload-File "$localDir\app.html" "app.html"
    Upload-File "$localDir\admin.html" "admin.html"
    Upload-File "$localDir\aplicacoes.html" "aplicacoes.html"
    Upload-File "$localDir\assets\anorak_construction_case.png" "assets/anorak_construction_case.png"
    Upload-File "$localDir\assets\anorak_creative_case.png" "assets/anorak_creative_case.png"
    Upload-File "$localDir\assets\anorak_business_case.png" "assets/anorak_business_case.png"

    # 4. Envio dos arquivos CSS
    Upload-File "$localDir\css\variables.css" "css/variables.css"
    Upload-File "$localDir\css\base.css" "css/base.css"
    Upload-File "$localDir\css\components.css" "css/components.css"
    Upload-File "$localDir\css\animations.css" "css/animations.css"
    Upload-File "$localDir\css\home.css" "css/home.css"
    Upload-File "$localDir\css\login.css" "css/login.css"
    Upload-File "$localDir\css\admin.css" "css/admin.css"

    # 5. Envio dos módulos JavaScript
    Upload-File "$localDir\js\models.js" "js/models.js"
    Upload-File "$localDir\js\db.js" "js/db.js"
    Upload-File "$localDir\js\voice.js" "js/voice.js"
    Upload-File "$localDir\js\matrix.js" "js/matrix.js"
    Upload-File "$localDir\js\sync.js" "js/sync.js"
    Upload-File "$localDir\js\app.js" "js/app.js"
    Upload-File "$localDir\js\admin.js" "js/admin.js"

    # 6. Envio dos arquivos do Backend, Autenticação e Banco de Dados
    Upload-File "$localDir\db_installer.php" "db_installer.php"
    Upload-File "$localDir\.env" ".env"
    Upload-File "$localDir\api\config.php" "api/config.php"
    Upload-File "$localDir\api\schema.sql" "api/schema.sql"
    Upload-File "$localDir\api\items.php" "api/items.php"
    Upload-File "$localDir\api\upload_evidence.php" "api/upload_evidence.php"
    Upload-File "$localDir\api\activity_logs.php" "api/activity_logs.php"
    Upload-File "$localDir\api\users\list.php" "api/users/list.php"
    Upload-File "$localDir\api\auth\login.php" "api/auth/login.php"
    Upload-File "$localDir\api\auth\check_auth.php" "api/auth/check_auth.php"
    Upload-File "$localDir\api\auth\logout.php" "api/auth/logout.php"
    Upload-File "$localDir\api\auth\recover_password.php" "api/auth/recover_password.php"
    Upload-File "$localDir\api\auth\reset_password.php" "api/auth/reset_password.php"

    # 7. Envio das APIs de Administração
    Upload-File "$localDir\api\admin\list_users.php" "api/admin/list_users.php"
    Upload-File "$localDir\api\admin\update_user.php" "api/admin/update_user.php"
    Upload-File "$localDir\api\admin\delete_user.php" "api/admin/delete_user.php"
    Upload-File "$localDir\api\admin\reset_password.php" "api/admin/reset_password.php"
    Upload-File "$localDir\api\admin\list_payments.php" "api/admin/list_payments.php"
    Upload-File "$localDir\api\admin\add_payment.php" "api/admin/add_payment.php"
    Upload-File "$localDir\api\admin\get_stats.php" "api/admin/get_stats.php"
    Upload-File "$localDir\api\admin\bulk_update.php" "api/admin/bulk_update.php"
    Upload-File "$localDir\api\admin\run_deploy.php" "api/admin/run_deploy.php"

    Write-Host "`n=================================================" -ForegroundColor Green
    Write-Host " Deploy de PRODUÇÃO finalizado com sucesso!" -ForegroundColor Green
    Write-Host " Apresentação Pública: http://anorak.hubdigital360.com/" -ForegroundColor Cyan
    Write-Host " Acesso ao Painel:     http://anorak.hubdigital360.com/login.html" -ForegroundColor Cyan
    Write-Host " Instalador do Banco:  http://anorak.hubdigital360.com/db_installer.php" -ForegroundColor Yellow
    Write-Host "=================================================" -ForegroundColor Green
}
finally {
    if (Test-Path "$localDir\.env.bak") {
        Move-Item "$localDir\.env.bak" "$localDir\.env" -Force
    }
}
