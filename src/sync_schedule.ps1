param(
    [string[]]$PostTimes = @("10:00", "15:00", "18:00")
)

$scriptDir = Split-Path -Parent $PSScriptRoot
$vbsPath = Join-Path $scriptDir "run_daily_silent.vbs"

if ($PostTimes.Count -eq 1 -and $PostTimes[0].Contains(",")) {
    $PostTimes = $PostTimes[0].Split(",")
}

for ($i = 1; $i -le 10; $i++) {
    try {
        Unregister-ScheduledTask -TaskName "Automation_Slot$i" -Confirm:$false -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName "AnimeReels_Slot$i" -Confirm:$false -ErrorAction SilentlyContinue
    } catch {}
}

for ($i = 0; $i -lt $PostTimes.Count; $i++) {
    $slot = $i + 1
    $timeStr = $PostTimes[$i].Trim()
    if (-not $timeStr) { continue }

    try {
        $trigger = New-ScheduledTaskTrigger -Daily -At $timeStr
    } catch {
        $trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::Parse($timeStr))
    }

    $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`"" -WorkingDirectory "$scriptDir"
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun -StartWhenAvailable
    
    Register-ScheduledTask -TaskName "Automation_Slot$slot" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
    Write-Host "[+] Configured Automation_Slot$slot for $timeStr (WakeToRun + Battery + StartWhenAvailable enabled)"
}
