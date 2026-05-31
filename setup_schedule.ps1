$ScriptPath = Join-Path $PSScriptRoot "backend\app\sync.py"
$PythonPath = Join-Path $PSScriptRoot "backend\venv\Scripts\python.exe"
$WorkDir = Join-Path $PSScriptRoot "backend"

# Check if Python interpreter and sync script exist
if (-not (Test-Path $PythonPath)) {
    Write-Error "Python venv interpreter not found at: $PythonPath"
    exit 1
}

if (-not (Test-Path $ScriptPath)) {
    Write-Error "Sync script not found at: $ScriptPath"
    exit 1
}

# Create Scheduled Task Action
$Action = New-ScheduledTaskAction -Execute $PythonPath -Argument "`"$ScriptPath`"" -WorkingDirectory $WorkDir

# Create Trigger (Daily at 6:00 AM)
$Trigger = New-ScheduledTaskTrigger -Daily -At "06:00"

# Register Scheduled Task
Register-ScheduledTask -TaskName "PlateShieldDailySync" -Action $Action -Trigger $Trigger -Description "Daily sync of Plate Shield vehicle records at 6:00 AM" -Force

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host " Windows Scheduled Task 'PlateShieldDailySync' registered successfully!" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "Trigger: Daily at 06:00 AM" -ForegroundColor Green
Write-Host "Python Path: $PythonPath" -ForegroundColor Green
Write-Host "Script Path: $ScriptPath" -ForegroundColor Green
Write-Host "Working Dir: $WorkDir" -ForegroundColor Green
Write-Host "Log File:    $WorkDir\sync.log" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
