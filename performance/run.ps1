# performance/run.ps1
# Windows PowerShell runner for the StayKaro LMS k6 performance suite.
#
# Usage:
#   .\run.ps1             # runs all scenarios
#   .\run.ps1 baseline
#   .\run.ps1 load
#   .\run.ps1 stress
#   .\run.ps1 spike
#   .\run.ps1 soak
#
# Prerequisites: k6 installed
#   winget install k6 --source winget
#   OR download from https://dl.k6.io/msi/k6-latest-amd64.msi

param(
  [string]$Scenario = "all"
)

$ErrorActionPreference = "Stop"
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$ReportDir  = Join-Path $ScriptDir "reports"
$EnvFile    = Join-Path $ScriptDir ".env"

if (-not (Test-Path $EnvFile)) {
  Write-Error "ERROR: $EnvFile not found. Copy .env.example and fill in credentials."
  exit 1
}

New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null

# ── Parse .env file ──────────────────────────────────────────
$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith('#')) {
    $idx = $line.IndexOf('=')
    if ($idx -gt 0) {
      $key = $line.Substring(0, $idx).Trim()
      $val = $line.Substring($idx + 1).Trim()
      $envVars[$key] = $val
    }
  }
}

$BASE_URL            = $envVars['BASE_URL']            ?? 'http://localhost:3001'
$STUDENT_EMAIL       = $envVars['STUDENT_EMAIL']       ?? ''
$STUDENT_PASSWORD    = $envVars['STUDENT_PASSWORD']    ?? ''
$FACULTY_EMAIL       = $envVars['FACULTY_EMAIL']       ?? ''
$FACULTY_PASSWORD    = $envVars['FACULTY_PASSWORD']    ?? ''
$ADMIN_EMAIL         = $envVars['ADMIN_EMAIL']         ?? ''
$ADMIN_PASSWORD      = $envVars['ADMIN_PASSWORD']      ?? ''
$SUPER_ADMIN_EMAIL   = $envVars['SUPER_ADMIN_EMAIL']   ?? ''
$SUPER_ADMIN_PASSWORD= $envVars['SUPER_ADMIN_PASSWORD']?? ''
$THINK_TIME_MIN      = $envVars['THINK_TIME_MIN']      ?? '1'
$THINK_TIME_MAX      = $envVars['THINK_TIME_MAX']      ?? '3'

Write-Host "Target  : $BASE_URL"
Write-Host "Reports : $ReportDir"
Write-Host ""

$K6Args = @(
  "-e", "BASE_URL=$BASE_URL",
  "-e", "STUDENT_EMAIL=$STUDENT_EMAIL",
  "-e", "STUDENT_PASSWORD=$STUDENT_PASSWORD",
  "-e", "FACULTY_EMAIL=$FACULTY_EMAIL",
  "-e", "FACULTY_PASSWORD=$FACULTY_PASSWORD",
  "-e", "ADMIN_EMAIL=$ADMIN_EMAIL",
  "-e", "ADMIN_PASSWORD=$ADMIN_PASSWORD",
  "-e", "SUPER_ADMIN_EMAIL=$SUPER_ADMIN_EMAIL",
  "-e", "SUPER_ADMIN_PASSWORD=$SUPER_ADMIN_PASSWORD",
  "-e", "THINK_TIME_MIN=$THINK_TIME_MIN",
  "-e", "THINK_TIME_MAX=$THINK_TIME_MAX",
  "-e", "REPORT_DIR=reports"
)

function Run-Scenario {
  param([string]$Name)
  $file = Join-Path $ScriptDir "scenarios\$Name.js"
  if (-not (Test-Path $file)) {
    Write-Error "Scenario file not found: $file"
    return
  }
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  Write-Host "  Running: $Name"
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  & k6 run @K6Args $file
  Write-Host ""
}

switch ($Scenario.ToLower()) {
  'baseline' { Run-Scenario 'baseline' }
  'load'     { Run-Scenario 'load' }
  'stress'   { Run-Scenario 'stress' }
  'spike'    { Run-Scenario 'spike' }
  'soak'     { Run-Scenario 'soak' }
  'all' {
    Run-Scenario 'baseline'
    Write-Host "Cooling down 30s..."; Start-Sleep 30
    Run-Scenario 'load'
    Write-Host "Cooling down 60s..."; Start-Sleep 60
    Run-Scenario 'stress'
    Write-Host "Cooling down 60s..."; Start-Sleep 60
    Run-Scenario 'spike'
    Write-Host "Cooling down 60s..."; Start-Sleep 60
    Run-Scenario 'soak'
  }
  default {
    Write-Error "Unknown scenario: $Scenario. Valid: baseline | load | stress | spike | soak | all"
    exit 1
  }
}

Write-Host "Done. Reports saved to: $ReportDir"
Get-ChildItem $ReportDir -Filter "*.html" | Sort-Object LastWriteTime -Descending | Select-Object Name, Length, LastWriteTime
