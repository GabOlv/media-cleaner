param(
  [string]$KeystorePath = 'D:\dev\.keys\dustio.keystore',
  [string]$KeyAlias = 'dustio'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$credentialsPath = Join-Path $projectRoot 'credentials.json'

if (-not (Test-Path -LiteralPath $KeystorePath -PathType Leaf)) {
  throw "Keystore não encontrada em: $KeystorePath"
}

$ignoreResult = & git -C $projectRoot check-ignore --no-index -- 'credentials.json' 2>$null
if ($LASTEXITCODE -ne 0) {
  throw 'credentials.json não está protegido pelo .gitignore. Interrompendo por segurança.'
}

if (Test-Path -LiteralPath $credentialsPath) {
  $replace = Read-Host 'credentials.json já existe. Substituir? [s/N]'
  if ($replace -notmatch '^[sS]$') {
    Write-Host 'Nenhuma alteração foi feita.'
    exit 0
  }
}

Write-Host 'As senhas serão usadas somente nesta execução e gravadas no credentials.json local.'
Write-Host 'Não envie essas senhas pelo chat e não faça git add credentials.json.'

$keystorePasswordSecure = Read-Host 'Senha da keystore' -AsSecureString
$sameKeyPassword = Read-Host 'A senha da chave dustio é igual à da keystore? [S/n]'

if ($sameKeyPassword -match '^[nN]$') {
  $keyPasswordSecure = Read-Host 'Senha da chave dustio' -AsSecureString
} else {
  $keyPasswordSecure = $keystorePasswordSecure
}

function Convert-SecureStringToPlainText {
  param([Security.SecureString]$SecureValue)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    if ($pointer -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
  }
}

$keystorePassword = Convert-SecureStringToPlainText $keystorePasswordSecure
$keyPassword = Convert-SecureStringToPlainText $keyPasswordSecure

$credentials = [ordered]@{
  android = [ordered]@{
    keystore = [ordered]@{
      keystorePath = $KeystorePath.Replace('\', '/')
      keystorePassword = $keystorePassword
      keyAlias = $KeyAlias
      keyPassword = $keyPassword
    }
  }
}

$credentials | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $credentialsPath -Encoding UTF8

$keystorePassword = $null
$keyPassword = $null
$keystorePasswordSecure = $null
$keyPasswordSecure = $null

Write-Host "Credenciais locais criadas em: $credentialsPath"
Write-Host "Keystore usada: $KeystorePath"
Write-Host 'O arquivo está protegido pelo .gitignore.'
