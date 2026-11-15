# myfamilyoffice.ps1 - the one command that starts Family Office on a Windows machine. Nothing has to be installed first.
#   $env:FO_SITE='https://<the site>/'; irm https://<the site>/myfamilyoffice.ps1 | iex          (pasted into PowerShell)
#   powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\.familyoffice\app\myfamilyoffice.ps1"     (any time after that)
# IT RUNS IN THE WINDOW IT WAS PASTED INTO. It starts no second PowerShell (a PowerShell started with a command to fetch and run a
# script is what security software refuses: "Access is denied"), and it never ends the window: pasted, it stops by returning.
# WHERE THE TEAM RUNS, decided here and never asked:
#   - This PC already has Windows' Linux layer (WSL) with a Linux in it, and no team has been set up on Windows itself: the team runs
#     there. It is the same app by the same script as on a Linux machine (myfamilyoffice.sh), and the engines that use a graphics
#     card run there. Nothing is installed to make that so.
#   - Otherwise it runs on Windows itself, on llama.cpp. No administrator rights and no restart.
#   - WSL is SET UP only when the person asks for it (-SetupWsl, which the app's Start page offers on a PC with an NVIDIA card).
#     Windows then asks for administrator approval, and the first time it needs a restart; this script carries on after it.
#   -Native keeps the team on Windows itself; -Wsl moves it to WSL when WSL is there.
# ON WINDOWS ITSELF it is myfamilyoffice.sh step for step:
#   1. finds Node.js 22.19 or newer on this machine. If there is none, it fetches Node's own build from nodejs.org into
#      %USERPROFILE%\.familyoffice\node and checks it against the checksum Node publishes beside it. No administrator rights, and
#      nothing outside that folder is touched: not your PATH, not a Node you already have.
#   2. keeps that private copy current: when a newer 22.x is out it is fetched the same way. A Node.js you installed is never touched.
#   3. hands over to myfamilyoffice.mjs, which fetches the app from the site, checks every file against the site's list, starts it
#      on 127.0.0.1 and opens it in your browser.
# The checksum in step 1 comes from the same server as the download: it catches a broken or cut-off download, not a compromised nodejs.org.
param([string]$Site = '', [switch]$Native, [switch]$Wsl, [switch]$SetupWsl)

function Invoke-FamilyOffice {
  param([string]$Site, [bool]$Native, [bool]$Wsl, [bool]$SetupWsl)
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'   # the progress bar makes a download many times slower in Windows PowerShell

  function Say([string]$t) { Write-Host "Family Office: $t" }
  function Die([string]$t) { throw "FO-STOP:$t" }   # caught at the bottom: said in red, and the script ends there

  if (-not $Site -and $env:FO_SITE) { $Site = $env:FO_SITE }   # pasted with "irm | iex", the address comes this way
  $HomeDir = if ($env:FO_HOME) { $env:FO_HOME } else { Join-Path $env:USERPROFILE '.familyoffice' }
  $Priv = Join-Path $HomeDir 'node'
  $PrivNode = Join-Path $Priv 'node.exe'
  $Dist = if ($env:FO_NODE_DIST) { $env:FO_NODE_DIST } else { 'https://nodejs.org/dist/latest-v22.x' }
  $Launcher = Join-Path $HomeDir 'myfamilyoffice.mjs'
  $Installed = Join-Path (Join-Path $HomeDir 'app') 'myfamilyoffice.mjs'
  $UseWsl = Join-Path $HomeDir 'use-wsl'       # written when the person asked for WSL: the team runs there from then on
  $WslRoot = Join-Path $HomeDir 'wsl-as-root'  # written when this script set the Linux up itself: it has no user of its own yet
  $WslExe = Join-Path $env:SystemRoot 'System32\wsl.exe'
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }

  if ($Site) {
    if ($Site -notmatch '^https://' -and $Site -notmatch '^http://(localhost|127\.0\.0\.1|[^/:]+\.localhost)([:/]|$)') {
      Die "the app is only fetched over https (or from this machine): $Site"
    }
    if ($Site -match "['`"\s]") { Die "that is not an address: $Site" }
    if (-not $Site.EndsWith('/')) { $Site = "$Site/" }
  }
  New-Item -ItemType Directory -Force -Path $HomeDir | Out-Null

  # EVERY DOWNLOAD SAYS WHO IS ASKING. Windows' own downloader sends no User-Agent, and the gateway this site is served through
  # answers 403 to a request without one (found on a real PC: Node was fetched, and then the site "could not be reached").
  function New-Web {
    $w = New-Object Net.WebClient
    $w.Headers['User-Agent'] = 'FamilyOffice-Start/1 (Windows PowerShell)'
    return $w
  }

  # ---------- Windows' Linux layer ----------
  # the Linux that WSL has, by name, or '' (wsl.exe answers in UTF-16, so its output arrives with a NUL after every letter)
  function Get-WslDistro {
    if (-not (Test-Path $WslExe)) { return '' }
    try {
      $out = (& $WslExe -l -q 2>$null) -join "`n"
      if ($LASTEXITCODE -ne 0) { return '' }
      $names = @(($out -replace "`0", '') -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch '^docker-desktop' })
      if ($names.Count) { return $names[0] }
    } catch { }
    return ''
  }

  # run the Linux start script inside WSL. It returns nothing (what a function returns here would swallow the app's own lines):
  # $script:FoRan says whether the team ran there, and $script:FoCode how it ended.
  function Start-InWsl([string]$distro) {
    $as = if (Test-Path $WslRoot) { @('-u', 'root') } else { @() }
    & $WslExe -d $distro @as -e sh -c 'command -v curl >/dev/null 2>&1'
    if ($LASTEXITCODE -ne 0 -and $as.Count) {
      Say "fetching curl inside $distro (the one thing the start script needs there)."
      & $WslExe -d $distro @as -e sh -c 'apt-get update -qq && apt-get install -y -qq curl ca-certificates'
      & $WslExe -d $distro @as -e sh -c 'command -v curl >/dev/null 2>&1'
    }
    if ($LASTEXITCODE -ne 0) {
      Say "the Linux on this PC ($distro) has no curl, so your team runs on Windows itself. Install curl there to move it."
      return
    }
    Say "this PC has Windows' Linux layer (WSL, $distro), so your team runs there. It opens in your usual browser."
    $inner = if ($Site) { "curl -fsSL '${Site}myfamilyoffice.sh' | sh -s '$Site'" } else { 'sh ~/.familyoffice/app/myfamilyoffice.sh' }
    & $WslExe -d $distro @as -e sh -c $inner
    $script:FoCode = $LASTEXITCODE
    $script:FoRan = $true
  }

  # the person asked for WSL: install it (Windows asks for administrator approval), and carry on after the restart it may need
  if ($SetupWsl) {
    $distro = Get-WslDistro
    if (-not $distro) {
      if (-not (Test-Path $WslExe)) { Die "this version of Windows has no WSL to set up. Your team carries on as it is." }
      Say "setting up Windows' Linux layer (WSL) with Ubuntu. Windows will now ask for administrator approval."
      try {
        Start-Process -FilePath $WslExe -ArgumentList '--install', '-d', 'Ubuntu', '--no-launch' -Verb RunAs -Wait | Out-Null
      } catch {
        Die "WSL was not set up: the approval was declined, or this account cannot give it. Your team carries on as it is."
      }
      Set-Content -Path $WslRoot -Value 'This script set the Linux up, so it runs there as its first user (root).'
      # a Linux that was installed without being opened is made ready as its root user, with no name or password to choose
      $ubuntu = Get-Command ubuntu.exe -ErrorAction SilentlyContinue
      if ($ubuntu) { try { & $ubuntu.Source install --root 2>$null | Out-Null } catch { } }
      $distro = Get-WslDistro
    }
    Set-Content -Path $UseWsl -Value 'The person asked for their team to run in WSL.'
    if (-not $distro) {
      if ($PSCommandPath) {
        $again = 'powershell -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Wsl ' + $Site
        Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' -Name 'FamilyOfficeWsl' -Value $again
        Say "WSL is installed. Restart this PC to finish: your team starts again by itself after the restart."
      } else {
        Say "WSL is installed. Restart this PC to finish, then run the start command again."
      }
      $script:FoCode = 0
      return
    }
    Start-InWsl $distro
    if ($script:FoRan) { return }
  }

  if (-not $Native) {
    $distro = Get-WslDistro
    $nativeHere = Test-Path $Installed
    if ($distro -and ($Wsl -or (Test-Path $UseWsl) -or -not $nativeHere)) {
      Start-InWsl $distro
      if ($script:FoRan) { return }
    } elseif ($Wsl) { Say "WSL is not ready on this PC yet, so your team runs on Windows itself." }
  }

  # ---------- on Windows itself ----------
  function Fits([string]$node) {
    try {
      & $node -e 'var v=process.versions.node.split(".").map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=19)?0:1)' 2>$null | Out-Null
      return $LASTEXITCODE -eq 0
    } catch { return $false }
  }

  # Node's own build for this machine's processor, checked against Node's published checksum, into the private folder. Throws on any
  # failure and leaves the private folder exactly as it was.
  function Install-Node {
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' }
      elseif ([Environment]::Is64BitOperatingSystem) { 'x64' }
      else { throw 'Node has no build this script knows for this processor. Install Node.js 22 from https://nodejs.org and run the command again.' }
    $tmp = Join-Path $HomeDir 'tmp'
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    try {
      $sums = (New-Web).DownloadString("$Dist/SHASUMS256.txt")
      $line = ($sums -split "`n") | Where-Object { $_.Trim() -match " node-v[0-9.]+-win-$arch\.zip$" } | Select-Object -First 1
      if (-not $line) { throw "Node's list has no build for Windows on $arch." }
      $want, $name = ($line.Trim() -split '\s+')
      $zip = Join-Path $tmp $name
      (New-Web).DownloadFile("$Dist/$name", $zip)
      $got = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLower()
      if ($got -ne $want.ToLower()) { throw "the Node.js download does not match Node's published checksum. Nothing was installed." }
      Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp 'unpacked') -Force
      $inner = Get-ChildItem -Path (Join-Path $tmp 'unpacked') -Directory | Select-Object -First 1
      if (-not $inner -or -not (Test-Path (Join-Path $inner.FullName 'node.exe'))) { throw 'the Node.js download could not be unpacked.' }
      & (Join-Path $inner.FullName 'node.exe') -v | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'the fetched Node.js does not run on this machine.' }
      Remove-Item -Recurse -Force $Priv -ErrorAction SilentlyContinue
      Move-Item -Path $inner.FullName -Destination $Priv
      # which build this is, by the name on Node's list: what a later look for a newer one is compared with
      if ($name -match '^node-(v[0-9.]+)-') { Set-Content -Path (Join-Path $Priv '.fetched') -Value $Matches[1] }
    } finally {
      Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }
  }

  $Node = ''
  if ((Test-Path $PrivNode) -and (Fits $PrivNode)) { $Node = $PrivNode }   # the copy this script fetched before
  if (-not $Node -and $env:FO_OWN_NODE -ne '1') {
    $found = Get-Command node -ErrorAction SilentlyContinue
    if ($found -and (Fits $found.Source)) { $Node = $found.Source }
  }
  if (-not $Node) {
    Say "no Node.js 22.19 or newer on this machine, so fetching a private copy from $Dist (about 35 MB). Nothing outside $HomeDir is changed."
    try { Install-Node } catch { Die $_.Exception.Message }
    $Node = $PrivNode
    Say "Node.js $(& $Node -v) is in $Priv, for this app only."
  } elseif ($Node -eq $PrivNode -and $env:FO_NO_NODE_UPDATE -ne '1') {
    # the private copy is kept current; a look or a fetch that fails changes nothing
    try {
      $sums = (New-Web).DownloadString("$Dist/SHASUMS256.txt")
      $newest = if ($sums -match ' node-(v[0-9.]+)-') { $Matches[1] } else { '' }
      $stamp = Join-Path $Priv '.fetched'
      $have = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim() } else { (& $Node -v) }
      if ($newest -and $have -and $newest -ne $have) {
        Say "a newer Node.js is out ($newest; this app's own copy is $have). Updating that copy."
        try { Install-Node } catch { Say "the update did not go through ($($_.Exception.Message)). Carrying on with $have." }
      }
    } catch { }
  }

  if ($Site) {
    $fetched = $false
    try {
      (New-Web).DownloadFile("${Site}myfamilyoffice.mjs", "$Launcher.part")
      Move-Item -Force -Path "$Launcher.part" -Destination $Launcher
      $fetched = $true
    } catch {
      Remove-Item -Force "$Launcher.part" -ErrorAction SilentlyContinue
      $why = $_.Exception.Message   # said, so a refusal is told from a site that is down
      if (-not (Test-Path $Installed)) { Die "could not reach $Site ($why)" }
      Say "could not reach $Site ($why). Starting the copy already on this machine."
    }
    if ($fetched) {
      & $Node $Launcher $Site
      $script:FoCode = $LASTEXITCODE
      return
    }
  }
  if (-not (Test-Path $Installed)) { Die 'say where the app comes from: set $env:FO_SITE to the address of the site, then run the command again.' }
  & $Node $Installed
  $script:FoCode = $LASTEXITCODE
}

# nothing the function writes is captured: what the app says goes straight to the window
$script:FoCode = 1
$script:FoRan = $false
try {
  Invoke-FamilyOffice -Site $Site -Native ([bool]$Native) -Wsl ([bool]$Wsl) -SetupWsl ([bool]$SetupWsl)
} catch {
  $foSaid = "$($_.Exception.Message)"
  if ($foSaid.StartsWith('FO-STOP:')) { $foSaid = $foSaid.Substring(8) }
  Write-Host "Family Office: $foSaid" -ForegroundColor Red
}
# run as a file, it says how it ended; pasted into a window, it leaves the window as it was
if ($PSCommandPath) { exit ([int]$script:FoCode) }
