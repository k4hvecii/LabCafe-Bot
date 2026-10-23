$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $ProjectRoot
try {
    $nodeVersion = (& node -p 'process.versions.node' 2>$null)
    if ($LASTEXITCODE -ne 0) { throw 'Node.js 24.17+ bulunamadı.' }
    $version = [version]($nodeVersion.Trim())
    if ($version -lt [version]'24.17.0') { throw "Node.js 24.17+ gerekli; şu an: $nodeVersion" }

    if (-not (Test-Path '.env')) {
        Copy-Item '.env.example' '.env'
        Write-Host 'Örnek .env oluşturuldu. Token ve uygulama ID bilgisini girin.'
    }
    & npm.cmd install
    if ($LASTEXITCODE -ne 0) { throw 'npm install başarısız' }
    & npm.cmd run check
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript kontrolü başarısız' }
    & npm.cmd run test
    if ($LASTEXITCODE -ne 0) { throw 'Testler başarısız' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Derleme başarısız' }
    Write-Host 'Kurulum hazır: .env düzenle -> npm run doctor -> npm run commands:register -> npm start'
} finally {
    Pop-Location
}
