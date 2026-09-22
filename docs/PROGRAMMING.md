# PEmicro programming backend

The extension generates a temporary CPROG configuration under the workspace `.vscode` directory and launches `cprogppcnexus.exe`.

Typical full-program sequence:

```text
:RESETDELAY 0
CM /PARAM1
EM
BM
SS /PARAM2
PM
VM
QU
```

Typical invocation:

```text
cprogppcnexus.exe <cfg> INTERFACE=USBMULTILINK PORT=USB1 /PARAM1=<pcp> /PARAM2=<elf-or-s19> /logfile <log>
```

Range commands use hexadecimal addresses without a `0x` prefix:

```text
ER 00400000 005FFFFF
BR 00400000 005FFFFF
```

Availability of each operation depends on the selected PCP algorithm.
