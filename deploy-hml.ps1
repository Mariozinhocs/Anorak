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

# 1. Cria a estrutura de pastas remotas no ambiente /hml
Create-FtpDirectory "hml"
Create-FtpDirectory "hml/css"
Create-FtpDirectory "hml/js"
Create-FtpDirectory "hml/api"
Create-FtpDirectory "hml/api/auth"
Create-FtpDirectory "hml/api/users"
Create-FtpDirectory "hml/api/admin"
Create-FtpDirectory "hml/api/payments"
Create-FtpDirectory "hml/assets"

# 2. Configura temporariamente o .env de homologação
$hasEnv = Test-Path "$localDir\.env"
if ($hasEnv) { Copy-Item "$localDir\.env" "$localDir\.env.bak" -Force }

if (Test-Path "$localDir\.env.hml") {
    Copy-Item "$localDir\.env.hml" "$localDir\.env" -Force
}

try {
    # 3. Envio dos arquivos do Frontend (Home, Login, App Privado)
    Upload-File "$localDir\index.html" "hml/index.html"
    Upload-File "$localDir\login.html" "hml/login.html"
    Upload-File "$localDir\app.html" "hml/app.html"

    # 4. Envio dos arquivos CSS
    Upload-File "$localDir\css\variables.css" "hml/css/variables.css"
    Upload-File "$localDir\css\base.css" "hml/css/base.css"
    Upload-File "$localDir\css\components.css" "hml/css/components.css"
    Upload-File "$localDir\css\animations.css" "hml/css/animations.css"
    Upload-File "$localDir\css\home.css" "hml/css/home.css"
    Upload-File "$localDir\css\login.css" "hml/css/login.css"

    # 5. Envio dos módulos JavaScript
    Upload-File "$localDir\index.html" "hml/index.html"
    Upload-File "$localDir\login.html" "hml/login.html"
    Upload-File "$localDir\app.html" "hml/app.html"
    Upload-File "$localDir\admin.html" "hml/admin.html"
    Upload-File "$localDir\help.html" "hml/help.html"
    Upload-File "$localDir\assets\anorak_construction_case.png" "hml/assets/anorak_construction_case.png"
    Upload-File "$localDir\assets\anorak_creative_case.png" "hml/assets/anorak_creative_case.png"
    Upload-File "$localDir\assets\anorak_business_case.png" "hml/assets/anorak_business_case.png"
    Upload-File "$localDir\assets\anorak_software_case.png" "hml/assets/anorak_software_case.png"
    Upload-File "$localDir\assets\bg-video.mp4" "hml/assets/bg-video.mp4"
 
    # 4. Envio dos arquivos CSS
    Upload-File "$localDir\css\variables.css" "hml/css/variables.css"
    Upload-File "$localDir\css\base.css" "hml/css/base.css"
    Upload-File "$localDir\css\components.css" "hml/css/components.css"
    Upload-File "$localDir\css\animations.css" "hml/css/animations.css"
    Upload-File "$localDir\css\home.css" "hml/css/home.css"
    Upload-File "$localDir\css\login.css" "hml/css/login.css"
    Upload-File "$localDir\css\admin.css" "hml/css/admin.css"
    Upload-File "$localDir\css\help.css" "hml/css/help.css"

    # 5. Envio dos módulos JavaScript
    Upload-File "$localDir\js\models.js" "hml/js/models.js"
    Upload-File "$localDir\js\db.js" "hml/js/db.js"
    Upload-File "$localDir\js\voice.js" "hml/js/voice.js"
    Upload-File "$localDir\js\matrix.js" "hml/js/matrix.js"
    Upload-File "$localDir\js\sync.js" "hml/js/sync.js"
    Upload-File "$localDir\js\app.js" "hml/js/app.js"
    Upload-File "$localDir\js\admin.js" "hml/js/admin.js"

    # 6. Envio dos arquivos do Backend, Autenticação e Banco de Dados
    Upload-File "$localDir\db_installer.php" "hml/db_installer.php"
    Upload-File "$localDir\.env" "hml/.env"
    Upload-File "$localDir\api\config.php" "hml/api/config.php"
    Upload-File "$localDir\api\schema.sql" "hml/api/schema.sql"
    Upload-File "$localDir\api\items.php" "hml/api/items.php"
    Upload-File "$localDir\api\upload_evidence.php" "hml/api/upload_evidence.php"
    Upload-File "$localDir\api\activity_logs.php" "hml/api/activity_logs.php"
    Upload-File "$localDir\api\users\list.php" "hml/api/users/list.php"
    Upload-File "$localDir\api\auth\login.php" "hml/api/auth/login.php"
    Upload-File "$localDir\api\auth\check_auth.php" "hml/api/auth/check_auth.php"
    Upload-File "$localDir\api\auth\logout.php" "hml/api/auth/logout.php"
    Upload-File "$localDir\api\auth\recover_password.php" "hml/api/auth/recover_password.php"
    Upload-File "$localDir\api\auth\reset_password.php" "hml/api/auth/reset_password.php"

    # 7. Envio das APIs de Administração e Pagamentos Mercado Pago
    Upload-File "$localDir\api\admin\list_users.php" "hml/api/admin/list_users.php"
    Upload-File "$localDir\api\admin\update_user.php" "hml/api/admin/update_user.php"
    Upload-File "$localDir\api\admin\delete_user.php" "hml/api/admin/delete_user.php"
    Upload-File "$localDir\api\admin\reset_password.php" "hml/api/admin/reset_password.php"
    Upload-File "$localDir\api\admin\list_payments.php" "hml/api/admin/list_payments.php"
    Upload-File "$localDir\api\admin\add_payment.php" "hml/api/admin/add_payment.php"
    Upload-File "$localDir\api\admin\get_stats.php" "hml/api/admin/get_stats.php"
    Upload-File "$localDir\api\admin\bulk_update.php" "hml/api/admin/bulk_update.php"
    Upload-File "$localDir\api\admin\run_deploy.php" "hml/api/admin/run_deploy.php"

    Upload-File "$localDir\api\payments\create_pix.php" "hml/api/payments/create_pix.php"
    Upload-File "$localDir\api\payments\webhook.php" "hml/api/payments/webhook.php"
    Upload-File "$localDir\api\payments\check_status.php" "hml/api/payments/check_status.php"

    Write-Host "`n=================================================" -ForegroundColor Green
    Write-Host " Deploy HML finalizado com sucesso!" -ForegroundColor Green
    Write-Host " Apresentação Pública: http://anorak.hubdigital360.com/hml/" -ForegroundColor Cyan
    Write-Host " Acesso ao Painel:     http://anorak.hubdigital360.com/hml/login.html" -ForegroundColor Cyan
    Write-Host " Instalador do Banco:  http://anorak.hubdigital360.com/hml/db_installer.php" -ForegroundColor Yellow
    Write-Host "=================================================" -ForegroundColor Green
}
finally {
    if (Test-Path "$localDir\.env.bak") {
        Move-Item "$localDir\.env.bak" "$localDir\.env" -Force
    }
}
