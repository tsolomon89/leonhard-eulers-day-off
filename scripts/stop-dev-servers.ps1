param(
  [int[]]$Ports = @(5173, 8080, 3000),
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Get-ListenersByPort {
  param([int[]]$PortList)
  Get-NetTCPConnection -State Listen |
    Where-Object { $PortList -contains $_.LocalPort } |
    Sort-Object LocalPort, OwningProcess -Unique
}

$listeners = Get-ListenersByPort -PortList $Ports

if (-not $listeners -or $listeners.Count -eq 0) {
  Write-Host "No listeners found on ports: $($Ports -join ', ')"
  return
}

Write-Host "Found listeners:"
$listeners | ForEach-Object {
  $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
  $name = if ($proc) { $proc.ProcessName } else { '<exited>' }
  Write-Host ("  port {0} -> pid {1} ({2})" -f $_.LocalPort, $_.OwningProcess, $name)
}

if ($DryRun) {
  Write-Host 'DryRun enabled. No processes were stopped.'
  return
}

$targetPids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pid in $targetPids) {
  $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
  if ($proc) {
    Stop-Process -Id $pid -Force
    Write-Host ("Stopped pid {0} ({1})" -f $pid, $proc.ProcessName)
  }
}

Start-Sleep -Milliseconds 250

$remaining = Get-ListenersByPort -PortList $Ports
if (-not $remaining -or $remaining.Count -eq 0) {
  Write-Host "Verified: no listeners remain on ports: $($Ports -join ', ')"
} else {
  Write-Warning 'Some listeners are still active:'
  $remaining | ForEach-Object {
    $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    $name = if ($proc) { $proc.ProcessName } else { '<exited>' }
    Write-Host ("  port {0} -> pid {1} ({2})" -f $_.LocalPort, $_.OwningProcess, $name)
  }
}
