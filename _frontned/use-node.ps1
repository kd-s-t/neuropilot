$version = Get-Content .nvmrc -Raw | ForEach-Object { $_.Trim() }
if ($version) {
    nvm use $version
} else {
    Write-Host "No version found in .nvmrc"
}
