$patterns = @('Full Integration','analysis_flow','heart-sense-ai-main','ecg_backend-main','lab_backend-main','data_extraction-main')

$procs = @()
foreach ($p in Get-CimInstance Win32_Process) {
    if ($p.CommandLine) {
        foreach ($pat in $patterns) {
            if ($p.CommandLine -like "*$pat*") {
                if ($p.ProcessId -eq $PID) { continue }
                $procs += $p
                break
            }
        }
    }
}

if (-not $procs) {
    Write-Output 'No matching workspace processes found.'
    exit 0
}

$procs | Select-Object ProcessId, CommandLine | Format-Table -AutoSize

foreach ($p in $procs) {
    try {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
        Write-Output "Killed PID $($p.ProcessId)"
    } catch {
        Write-Output "Failed to kill PID $($p.ProcessId): $($_.Exception.Message)"
    }
}

# Also attempt to kill common dev servers by image name
$images = @('node.exe','python.exe','pnpm.exe','npm.exe')
foreach ($img in $images) {
    try {
        Get-Process -Name ($img -replace '\\.exe$','') -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue; Write-Output "Killed $($img) PID $($_.Id)" }
    } catch {
        # ignore
    }
}
