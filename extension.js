const vscode=require('vscode');
const cp=require('child_process');
const fs=require('fs');
const path=require('path');
const net=require('net');
let output,statusItem,panel;
function cfg(){return vscode.workspace.getConfiguration('mpc5777mDebug');}
function ws(){const e=vscode.window.activeTextEditor;if(e){const f=vscode.workspace.getWorkspaceFolder(e.document.uri);if(f)return f;}return vscode.workspace.workspaceFolders&&vscode.workspace.workspaceFolders[0];}
function rp(f,p){return path.isAbsolute(p)?p:path.join(f.uri.fsPath,p);}
function rt(context){const pe=path.join(context.extensionPath,'resources','pemicro','win32');return{gdb:cfg().get('gdbPath','').trim()||path.join(context.extensionPath,'resources','gdb','bin','powerpc-eabivle-gdb.exe'),server:cfg().get('serverPath','').trim()||path.join(pe,'pegdbserver_power_console.exe'),peRoot:pe,attach:path.join(context.extensionPath,'resources','config','pemicro_attach.ini'),download:path.join(context.extensionPath,'resources','config','pemicro_download.ini'),reset:path.join(context.extensionPath,'resources','config','pemicro_reset_debug.ini'),algo:path.join(pe,'gdi','P&E','nxp_mpc5777m_1x32x1984k_cflash.pcp')};}
function need(p,n){if(!fs.existsSync(p))throw new Error(n+' not found: '+p);}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function portOpen(port){return new Promise(resolve=>{const s=new net.Socket();let done=false;const end=v=>{if(done)return;done=true;try{s.destroy();}catch{}resolve(v);};s.setTimeout(250);s.once('connect',()=>end(true));s.once('timeout',()=>end(false));s.once('error',()=>end(false));s.connect(port,'127.0.0.1');});}
async function killServer(){await new Promise(r=>cp.exec('taskkill /F /IM pegdbserver_power_console.exe',{windowsHide:true},()=>r()));await wait(200);}
function execText(exe,args,cwd){return new Promise((resolve,reject)=>cp.execFile(exe,args,{cwd,windowsHide:true,maxBuffer:8*1024*1024},(e,a,b)=>{if(e){e.output=(a||'')+(b||'');reject(e);}else resolve((a||'')+(b||''));}));}
async function startServer(context,mode){const p=rt(context),c=cfg();need(p.server,'PEmicro GDB Server');await killServer();const ini=mode==='attach'?p.attach:(mode==='resetdebug'?p.reset:p.download);const args=['-device='+c.get('device','MPC5777M'),'-startserver','-singlesession','-serverport='+c.get('serverPort',7224),'-gdbmiport='+c.get('gdbMiPort',6224),'-interface='+c.get('interface','USBMULTILINK'),'-speed='+c.get('speed',5000),'-port='+c.get('port','USB1'),'-corenum='+c.get('core',0),'-configfile='+ini];output.appendLine('[SERVER] '+p.server+' '+args.join(' '));const child=cp.spawn(p.server,args,{cwd:path.dirname(p.server),windowsHide:false,detached:true,stdio:'ignore'});child.unref();for(let i=0;i<50;i++){await wait(200);if(await portOpen(c.get('serverPort',7224)))return;}throw new Error('PEmicro server did not open port '+c.get('serverPort',7224));}
async function debug(context,mode){const f=ws();if(!f)throw new Error('Open a workspace first.');const p=rt(context);need(p.gdb,'powerpc-eabivle-gdb.exe');const elf=rp(f,cfg().get('elfPath','Bin/Project.elf'));need(elf,'ELF');await startServer(context,mode);const pre=[];if(mode==='download')pre.push('load');if(mode==='resetdebug')pre.push('load','monitor reset');const dc={name:'MPC5777M - '+mode,type:'gdbtarget',request:'attach',program:elf,gdb:p.gdb.replace(/\\/g,'/'),cwd:f.uri.fsPath,target:{type:'remote',host:'127.0.0.1',port:String(cfg().get('serverPort',7224))},gdbAsync:true,gdbNonStop:false,run:'all',updateThreadInfo:cfg().get('updateThreadInfo','missing'),preConnectCommands:['set backtrace limit 1'],preRunCommands:pre,verbose:cfg().get('verbose',false)};if(!await vscode.debug.startDebugging(f,dc))throw new Error('Could not start CDT GDB session.');}
function flashImage(f){return rp(f,cfg().get('programImagePath','Bin/Project.elf'));}
async function runFlashServer(context,type,{runAfter=false}={}){
  const f=ws();if(!f)throw new Error('Open a workspace first.');
  const p=rt(context),c=cfg();need(p.server,'PEmicro GDB Server');
  const image=flashImage(f);
  if(type!==3)need(image,'Program image');
  await killServer();
  const args=[
    '-device='+c.get('device','MPC5777M'),
    '-startserver','-singlesession',
    '-serverport='+c.get('serverPort',7224),
    '-gdbmiport='+c.get('gdbMiPort',6224),
    '-interface='+c.get('interface','USBMULTILINK'),
    '-speed='+c.get('speed',5000),
    '-port='+c.get('port','USB1'),
    '-corenum='+c.get('core',0),
    '-programmingtype='+type,
    type===3?'-flashobjectfile=':'-flashobjectfile='+image,
    '-quitafterprogramming',
    '-showflashstatus'
  ];
  if(runAfter)args.push('-runafterprogramming');
  output.clear();
  output.appendLine('[FLASH SERVER] '+p.server+' '+args.join(' '));
  output.show(true);
  const code=await new Promise((resolve,reject)=>{
    const child=cp.spawn(p.server,args,{cwd:path.dirname(p.server),windowsHide:false});
    child.stdout.on('data',d=>output.append(d.toString()));
    child.stderr.on('data',d=>output.append(d.toString()));
    child.on('error',reject);
    child.on('exit',resolve);
  });
  if(code!==0)throw new Error('PEmicro flash operation failed with exit code '+code);
}
async function unsupported(name){
  throw new Error(name+' is not exposed as a standalone operation by the PEmicro POWER GDB Server. Use PROGPPNEXUS for that operation.');
}
async function flashGuard(fn){const x=await vscode.window.showWarningMessage('This may erase/program/reset the target. Continue?',{modal:true},'Continue');if(x==='Continue')return fn();}
async function range(){const a=await vscode.window.showInputBox({prompt:'Start address (hex)',value:'00400000'});if(!a)return;const b=await vscode.window.showInputBox({prompt:'End address (hex)',value:'005FFFFF'});if(!b)return;return[hx(a),hx(b)];}
async function versions(context){const p=rt(context);output.clear();try{output.appendLine('=== GDB ===\n'+await execText(p.gdb,['--version'],path.dirname(p.gdb)));}catch(e){output.appendLine('GDB ERROR: '+(e.output||e.message));}try{output.appendLine('\n=== PEmicro ===\n'+await execText(p.server,['-h'],path.dirname(p.server)));}catch(e){output.appendLine('PEmicro ERROR: '+(e.output||e.message));}output.show(true);}
async function detect(context){const p=rt(context);need(p.server,'PEmicro GDB Server');await killServer();output.clear();output.appendLine(await execText(p.server,['-showhardware'],path.dirname(p.server)));output.show(true);}
function html(){return [
'<!doctype html><html><head><meta charset="utf-8"><style>',
'body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-foreground)}',
'.card{border:1px solid var(--vscode-panel-border);padding:12px;margin:10px 0;border-radius:6px}',
'button{margin:4px;padding:7px 10px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0}',
'input{padding:6px;margin:4px;width:180px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border)}',
'.status{padding:8px;background:var(--vscode-textBlockQuote-background)}</style></head><body>',
'<h2>MPC5777M Flash & Debug</h2>',
'<div class="card"><b>Debug</b><br><button onclick="send(&quot;attach&quot;)">Attach Only (No Reset)</button><button onclick="send(&quot;download&quot;)">GDB Download</button><button onclick="send(&quot;resetdebug&quot;)">Download + Reset Debug</button><button onclick="send(&quot;stop&quot;)">Stop Server</button><button onclick="send(&quot;detect&quot;)">Detect Multilink</button><button onclick="send(&quot;versions&quot;)">Tool Versions</button></div>',
'<div class="card"><b>Erase / Blank</b><br><button onclick="send(&quot;em&quot;)">Erase Entire Flash</button><button disabled title="Requires PROGPPNEXUS">Erase If Not Blank (PROG only)</button><button disabled title="Requires PROGPPNEXUS">Blank Check (PROG only)</button></div>',
'<div class="card"><b>Program / Verify</b><br><button onclick="send(&quot;pm&quot;)">Program + Verify</button><button onclick="send(&quot;vm&quot;)">Verify Only</button><button onclick="send(&quot;full&quot;)">Erase + Program + Verify</button><button onclick="send(&quot;go&quot;)">Erase + Program + Verify + Run</button></div>',
'<div class="status" id="status">Ready</div>',
'<script>const vscode=acquireVsCodeApi();function send(c){vscode.postMessage({command:c});}window.addEventListener("message",e=>document.getElementById("status").textContent=e.data);</script>',
'</body></html>'
].join('');}
async function openPanel(context){if(panel){panel.reveal();return;}panel=vscode.window.createWebviewPanel('mpc5777m','MPC5777M Flash & Debug',vscode.ViewColumn.One,{enableScripts:true});panel.webview.html=html();panel.onDidDispose(()=>panel=undefined);panel.webview.onDidReceiveMessage(async m=>{const st=s=>panel&&panel.webview.postMessage(s);try{st('Running '+m.command+'...');if(m.command==='attach'||m.command==='download'||m.command==='resetdebug')await debug(context,m.command);else if(m.command==='stop')await killServer();else if(m.command==='detect')await detect(context);else if(m.command==='versions')await versions(context);else if(m.command==='em')await flashGuard(()=>runFlashServer(context,3));else if(m.command==='pm')await flashGuard(()=>runFlashServer(context,1));else if(m.command==='vm')await flashGuard(()=>runFlashServer(context,2));else if(m.command==='full')await flashGuard(()=>runFlashServer(context,0,{runAfter:false}));else if(m.command==='go')await flashGuard(()=>runFlashServer(context,0,{runAfter:true}));else if(m.command==='en')await unsupported('Erase If Not Blank');else if(m.command==='bm')await unsupported('Blank Check Module');else if(m.command==='er')await unsupported('Erase Range');else if(m.command==='br')await unsupported('Blank Check Range');st('Completed: '+m.command);}catch(e){output.appendLine('[ERROR] '+(e.stack||e));output.show(true);st('ERROR: '+(e.message||e));vscode.window.showErrorMessage(String(e.message||e));}});}
function activate(context){output=vscode.window.createOutputChannel('MPC5777M PEmicro');context.subscriptions.push(output);statusItem=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,50);statusItem.text='$(debug-alt) MPC5777M';statusItem.command='mpc5777m.openPanel';statusItem.show();context.subscriptions.push(statusItem);const reg=(n,f)=>context.subscriptions.push(vscode.commands.registerCommand(n,async()=>{try{return await f();}catch(e){output.appendLine('[ERROR] '+(e.stack||e));output.show(true);vscode.window.showErrorMessage(String(e.message||e));}}));reg('mpc5777m.openPanel',()=>openPanel(context));reg('mpc5777m.attach',()=>debug(context,'attach'));reg('mpc5777m.download',()=>debug(context,'download'));reg('mpc5777m.resetDebug',()=>debug(context,'resetdebug'));reg('mpc5777m.eraseModule',()=>flashGuard(()=>runFlashServer(context,3)));reg('mpc5777m.eraseIfNotBlank',()=>unsupported('Erase If Not Blank'));reg('mpc5777m.blankCheckModule',()=>unsupported('Blank Check Module'));reg('mpc5777m.eraseRange',()=>unsupported('Erase Range'));reg('mpc5777m.blankCheckRange',()=>unsupported('Blank Check Range'));reg('mpc5777m.programModule',()=>flashGuard(()=>runFlashServer(context,1)));reg('mpc5777m.verifyModule',()=>flashGuard(()=>runFlashServer(context,2)));reg('mpc5777m.flashFull',()=>flashGuard(()=>runFlashServer(context,0,{runAfter:false})));reg('mpc5777m.resetRun',()=>flashGuard(()=>runFlashServer(context,0,{runAfter:true})));reg('mpc5777m.customCprog',()=>unsupported('Custom CPROG Sequence'));reg('mpc5777m.stopServer',()=>killServer());reg('mpc5777m.showVersions',()=>versions(context));reg('mpc5777m.detectHardware',()=>detect(context));}
function deactivate(){}
module.exports={activate,deactivate};
