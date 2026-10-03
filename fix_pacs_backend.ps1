$ErrorActionPreference = "Stop"

$pacsDir = "C:\Program Files\MerilView\resources\pacs-backend"
$sourceDist = "g:\newww\Meril_Dicom_Viewer\pacs-study-browser\backend\dist"
$programData = "C:\ProgramData\MerilView"

Write-Host "1. Ensuring ProgramData folders exist..."
foreach ($sub in @("logs", "temp", "backups", "database", "dicom")) {
    $dir = Join-Path $programData $sub
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

Write-Host "2. Granting user permissions on pacs-backend in Program Files..."
& icacls $pacsDir /grant "Users:(OI)(CI)M" /T /C /Q

Write-Host "3. Ensuring pacs-backend subfolders exist..."
foreach ($sub in @("logs", "data\temp", "data\backups")) {
    $dir = Join-Path $pacsDir $sub
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

Write-Host "4. Updating pacs-backend dist with hardened binaries..."
Copy-Item -Path "$sourceDist\*" -Destination "$pacsDir\dist" -Recurse -Force

Write-Host "PACS Backend repair completed successfully!"
