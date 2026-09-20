Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$credentialsPath = Join-Path $projectRoot 'credentials.json'
$androidRoot = Join-Path $projectRoot 'android'
$gradlePropertiesPath = Join-Path $androidRoot 'gradle.properties'

if (-not (Test-Path -LiteralPath $credentialsPath -PathType Leaf)) {
  throw "credentials.json não encontrada em: $credentialsPath"
}

if (-not (Test-Path -LiteralPath (Join-Path $androidRoot 'app\build.gradle') -PathType Leaf)) {
  throw 'A pasta android ainda não foi gerada. Execute npx expo prebuild --platform android primeiro.'
}

$ignoreResult = & git -C $projectRoot check-ignore --no-index -- 'credentials.json' 2>$null
if ($LASTEXITCODE -ne 0) {
  throw 'credentials.json não está protegido pelo .gitignore. Interrompendo por segurança.'
}

$credentials = Get-Content -LiteralPath $credentialsPath -Raw | ConvertFrom-Json
$keystore = $credentials.android.keystore
$required = @('keystorePath', 'keystorePassword', 'keyAlias', 'keyPassword')

foreach ($property in $required) {
  if ([string]::IsNullOrWhiteSpace([string]$keystore.$property)) {
    throw "Campo ausente nas credenciais: $property"
  }
}

$managedNames = @(
  'DUSTIO_UPLOAD_STORE_FILE',
  'DUSTIO_UPLOAD_STORE_PASSWORD',
  'DUSTIO_UPLOAD_KEY_ALIAS',
  'DUSTIO_UPLOAD_KEY_PASSWORD'
)

$existingLines = if (Test-Path -LiteralPath $gradlePropertiesPath) {
  @(Get-Content -LiteralPath $gradlePropertiesPath)
} else {
  @()
}

$keptLines = @($existingLines | Where-Object {
    $line = [string]$_
    -not ($managedNames | Where-Object { $line.StartsWith("$_=") })
  })

$signingLines = @(
  "DUSTIO_UPLOAD_STORE_FILE=$($keystore.keystorePath)",
  "DUSTIO_UPLOAD_STORE_PASSWORD=$($keystore.keystorePassword)",
  "DUSTIO_UPLOAD_KEY_ALIAS=$($keystore.keyAlias)",
  "DUSTIO_UPLOAD_KEY_PASSWORD=$($keystore.keyPassword)"
)

@($keptLines + '' + $signingLines) | Set-Content -LiteralPath $gradlePropertiesPath -Encoding UTF8

$credentials = $null
$keystore = $null
$signingLines = $null

Write-Host 'Assinatura Android configurada apenas no projeto nativo ignorado.'
