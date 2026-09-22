# MPC5777M PEmicro Debug & Flash

VS Code extension for **NXP MPC5777M / e200 VLE** using PEmicro tools.

## Features

- HSM-safe **Attach Only (No Reset)** using `[CWDBG] Connect=1`
- GDB Download / Download + Reset Debug
- Integrated Flash & Debug panel
- Direct PEmicro POWER GDB Server flash operations: erase, program+verify, verify-only, erase+program+verify
- USB Multilink hardware detection
- Configurable ELF, image, PCP algorithm, GDB and PEmicro server paths

## Runtime files

This public repository does **not** redistribute NXP/PEmicro binaries.

Run:

```powershell
.\scripts\prepare-runtime.ps1
```

The script copies the required files from your locally installed S32 Design Studio / PEmicro installation into the ignored `resources/gdb` and `resources/pemicro` folders before packaging.

Typical local sources:

- NXP GDB: `S32DS\build_tools\powerpc-eabivle-4_9`
- PEmicro Power plugin: `com.pemicro.debug.gdbjtag.ppc_2.0.5.202210261806`
- CPROGPPCNEXUS: normally `C:\PEMicro\PROGPPNEXUS_C\cprogppcnexus.exe`

## Required VS Code extension

Keep **CDT GDB Debug Adapter** (`eclipse-cdt.cdt-gdb-vscode`) installed.

## Commands

- `MPC5777M: Open Flash & Debug Panel`
- `MPC5777M: Attach Only (No Reset)`
- `MPC5777M: GDB Download Only`
- `MPC5777M: GDB Download + Reset Debug`
- GDB Server flash erase/program/verify operations
- `MPC5777M: Detect PEmicro Hardware`

## Defaults

- Device: `MPC5777M`
- Interface: `USBMULTILINK`
- Port: `USB1`
- Debug speed: `5000 KHz`
- GDB server port: `7224`
- GDB/MI port: `6224`
- ELF/image: `Bin/Project.elf`

## HSM note

For a running HSM-enabled ECU, use **Attach Only (No Reset)**. Programming operations intentionally take ownership of the Multilink and may reset or erase the target.

Flash operations use `pegdbserver_power_console.exe` directly with `-flashobjectfile`, `-programmingtype`, and `-quitafterprogramming`. PEmicro POWER GDB Server does not expose standalone range erase/blank-check operations; use PROGPPNEXUS when those are required.

## GitHub Release

The GitHub Release publishes a **source/lite VSIX**. It does not redistribute NXP or PEmicro proprietary binaries.

After installing the VSIX, configure these settings when the runtimes are not bundled locally:

```json
{
  "mpc5777mDebug.gdbPath": "C:\\NXP\\S32DS_Power_v2.1\\S32DS\\build_tools\\powerpc-eabivle-4_9\\bin\\powerpc-eabivle-gdb.exe",
  "mpc5777mDebug.serverPath": "C:\\NXP\\S32DS_Power_v2.1\\eclipse\\plugins\\com.pemicro.debug.gdbjtag.ppc_2.0.5.202210261806\\win32\\pegdbserver_power_console.exe"
}
```

For a private/offline bundle that includes the local runtime files, run `scripts/prepare-runtime.ps1` before packaging locally.
