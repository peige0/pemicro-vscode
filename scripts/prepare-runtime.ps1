param(
  [string]$S32Root = "D:\Program\NXP\s32dspower",
  [string]$PEmicroPlugin = ""
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$gdbSrc = Join-Path $S32Root "S32DS\build_tools\powerpc-eabivle-4_9"
if (-not (Test-Path $gdbSrc)) { throw "GDB toolchain not found: $gdbSrc" }

if (-not $PEmicroPlugin) {
  $plugins = Join-Path $S32Root "eclipse\plugins"
  $PEmicroPlugin = Get-ChildItem $plugins -Directory -Filter "com.pemicro.debug.gdbjtag.ppc_*" |
    Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $PEmicroPlugin -or -not (Test-Path $PEmicroPlugin)) { throw "PEmicro PPC plugin not found." }

$gdbDst = Join-Path $repo "resources\gdb"
$peDst  = Join-Path $repo "resources\pemicro"
New-Item -ItemType Directory -Force $gdbDst,$peDst | Out-Null

Copy-Item "$gdbSrc\*" $gdbDst -Recurse -Force
Copy-Item "$PEmicroPlugin\win32\*" (Join-Path $peDst "win32") -Recurse -Force

Write-Host "Runtime prepared."
Write-Host "GDB: $gdbDst"
Write-Host "PEmicro: $peDst"
