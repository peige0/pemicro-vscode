const vscode=require('vscode');
const cp=require('child_process');
const fs=require('fs');
const path=require('path');
const net=require('net');
let output,statusItem,panel;
let pemicroRuntimeRoot;
function cfg(){return vscode.workspace.getConfiguration('mpc5777mDebug');}
function ws(){const e=vscode.window.activeTextEditor;if(e){const f=vscode.workspace.getWorkspaceFolder(e.document.uri);if(f)return f;}return vscode.workspace.workspaceFolders&&vscode.workspace.workspaceFolders[0];}
function rp(f,p){return path.isAbsolute(p)?p:path.join(f.uri.fsPath,p);}
function rt(context){
  const pe=pemicroRuntimeRoot||path.join(context.extensionPath,'resources','pemicro','win32');
  return{
    gdb:cfg().get('gdbPath','').trim()||path.join(context.extensionPath,'resources','gdb','bin','powerpc-eabivle-gdb.exe'),
    server:cfg().get('serverPath','').trim()||path.join(pe,'pegdbserver_power_console.exe'),
    peRoot:pe,
    attach:path.join(context.extensionPath,'resources','config','pemicro_attach.ini'),
    download:path.join(context.extensionPath,'resources','config','pemicro_download.ini'),
    reset:path.join(context.extensionPath,'resources','config','pemicro_reset_debug.ini'),
    algo:path.join(pe,'gdi','P&E','nxp_mpc5777m_1x32x1984k_cflash.pcp')
  };
}
async function ensurePemicroRuntime(context){
  const configured=cfg().get('serverPath','').trim();
  if(configured)return;
  const root=path.join(context.globalStorageUri.fsPath,'pemicro-8.98');
  const pe=path.join(root,'win32');
  const server=path.join(pe,'pegdbserver_power_console.exe');
  if(fs.existsSync(server)){pemicroRuntimeRoot=pe;return;}
  const archive=path.join(context.extensionPath,'resources','pemicro','pemicro-power-win32.zip');
  need(archive,'Bundled PEmicro runtime archive');
  fs.mkdirSync(root,{recursive:true});
  output&&output.appendLine('[RUNTIME] Extracting full PEmicro 8.98 runtime...');
  const ps='Expand-Archive -LiteralPath '+JSON.stringify(archive)+' -DestinationPath '+JSON.stringify(root)+' -Force';
  await execText('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',ps],context.extensionPath);
  need(server,'Extracted PEmicro GDB Server');
  pemicroRuntimeRoot=pe;
  output&&output.appendLine('[RUNTIME] PEmicro runtime ready: '+pe);
}
function need(p,n){if(!fs.existsSync(p))throw new Error(n+' not found: '+p);}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function portOpen(port){return new Promise(resolve=>{const s=new net.Socket();let done=false;const end=v=>{if(done)return;done=true;try{s.destroy();}catch{}resolve(v);};s.setTimeout(250);s.once('connect',()=>end(true));s.once('timeout',()=>end(false));s.once('error',()=>end(false));s.connect(port,'127.0.0.1');});}
async function killServer(){await new Promise(r=>cp.exec('taskkill /F /IM pegdbserver_power_console.exe',{windowsHide:true},()=>r()));await wait(200);}
function execText(exe,args,cwd){return new Promise((resolve,reject)=>cp.execFile(exe,args,{cwd,windowsHide:true,maxBuffer:8*1024*1024},(e,a,b)=>{if(e){e.output=(a||'')+(b||'');reject(e);}else resolve((a||'')+(b||''));}));}
async function startServer(context,mode){
  await ensurePemicroRuntime(context);
  const p=rt(context),c=cfg();need(p.server,'PEmicro GDB Server');
  await killServer();
  const ini=mode==='attach'?p.attach:(mode==='resetdebug'?p.reset:p.download);
  const args=['-device='+c.get('device','MPC5777M'),'-startserver','-singlesession','-serverport='+c.get('serverPort',7224),'-gdbmiport='+c.get('gdbMiPort',6224),'-interface='+c.get('interface','USBMULTILINK'),'-speed='+c.get('speed',5000),'-port='+c.get('port','USB1'),'-corenum='+c.get('core',0),'-configfile='+ini];
  output.appendLine('[SERVER] '+p.server+' '+args.join(' '));
  output.show(true);
  const child=cp.spawn(p.server,args,{cwd:path.dirname(p.server),windowsHide:false,stdio:['ignore','pipe','pipe']});
  let exited=false,exitCode=null;
  child.stdout.on('data',d=>output.append(d.toString()));
  child.stderr.on('data',d=>output.append(d.toString()));
  child.on('exit',code=>{exited=true;exitCode=code;output.appendLine('[SERVER EXIT] code='+code);});
  child.on('error',e=>output.appendLine('[SERVER ERROR] '+e.message));
  for(let i=0;i<150;i++){
    await wait(200);
    if(await portOpen(c.get('serverPort',7224))){output.appendLine('[SERVER] GDB port '+c.get('serverPort',7224)+' is open');return;}
    if(exited)throw new Error('PEmicro server exited before opening port '+c.get('serverPort',7224)+' (code '+exitCode+'). See MPC5777M PEmicro output.');
  }
  throw new Error('PEmicro server did not open port '+c.get('serverPort',7224)+' within 30 seconds. See MPC5777M PEmicro output.');
}
async function debug(context,mode){const f=ws();if(!f)throw new Error('Open a workspace first.');const p=rt(context);need(p.gdb,'powerpc-eabivle-gdb.exe');output.appendLine('[GDB] Using: '+p.gdb);const elf=rp(f,cfg().get('elfPath','Bin/Project.elf'));need(elf,'ELF');await startServer(context,mode);const pre=[];if(mode==='download')pre.push('load');if(mode==='resetdebug')pre.push('load','monitor reset');const dc={name:'MPC5777M - '+mode,type:'gdbtarget',request:'attach',program:elf,gdb:p.gdb.replace(/\\/g,'/'),cwd:f.uri.fsPath,target:{type:'remote',host:'127.0.0.1',port:String(cfg().get('serverPort',7224))},gdbAsync:true,gdbNonStop:false,run:'all',updateThreadInfo:cfg().get('updateThreadInfo','when-requested'),preConnectCommands:['set backtrace limit 1'],preRunCommands:pre,verbose:cfg().get('verbose',false)};output.appendLine('[CDT CONFIG] '+JSON.stringify(dc,null,2));output.show(true);if(!await vscode.debug.startDebugging(f,dc))throw new Error('Could not start CDT GDB session. Check the CDT configuration printed above.');}
function flashImage(f){return rp(f,cfg().get('programImagePath','Bin/Project.elf'));}
async function runFlashServer(context,type,{runAfter=false}={}){
  const f=ws();if(!f)throw new Error('Open a workspace first.');
  await ensurePemicroRuntime(context);
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
    '-configfile='+p.download,
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
async function versions(context){await ensurePemicroRuntime(context);const p=rt(context);output.clear();try{output.appendLine('=== GDB ===\n'+await execText(p.gdb,['--version'],path.dirname(p.gdb)));}catch(e){output.appendLine('GDB ERROR: '+(e.output||e.message));}try{output.appendLine('\n=== PEmicro ===\n'+await execText(p.server,['-h'],path.dirname(p.server)));}catch(e){output.appendLine('PEmicro ERROR: '+(e.output||e.message));}output.show(true);}
async function detect(context){await ensurePemicroRuntime(context);const p=rt(context);need(p.server,'PEmicro GDB Server');await killServer();output.clear();output.appendLine(await execText(p.server,['-showhardware'],path.dirname(p.server)));output.show(true);}
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}
function html(){
  const c=cfg();
  return [
'<!doctype html><html><head><meta charset="utf-8"><style>',
'body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-foreground)}',
'.card{border:1px solid var(--vscode-panel-border);padding:12px;margin:10px 0;border-radius:6px}',
'.grid{display:grid;grid-template-columns:145px minmax(260px,1fr) auto;gap:7px;align-items:center}',
'.mini{display:grid;grid-template-columns:repeat(6,minmax(100px,1fr));gap:8px;margin-top:10px}',
'label{opacity:.9}button{margin:4px;padding:7px 10px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;cursor:pointer}',
'input{box-sizing:border-box;width:100%;padding:6px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border)}',
'.status{padding:8px;background:var(--vscode-textBlockQuote-background)}.muted{opacity:.7;font-size:12px;margin-top:6px}</style></head><body>',
'<h2>MPC5777M Flash & Debug</h2>',
'<div class="card"><b>Configuration</b><div class="grid">',
'<label>ELF</label><input id="elf" value="'+esc(c.get('elfPath','Bin/Project.elf'))+'"><button onclick="browse(&quot;elf&quot;)">Browse</button>',
'<label>Program image</label><input id="image" value="'+esc(c.get('programImagePath','Bin/Project.elf'))+'"><button onclick="browse(&quot;image&quot;)">Browse</button>',
'<label>GDB path</label><input id="gdb" value="'+esc(c.get('gdbPath',''))+'" placeholder="Empty = bundled GDB"><button onclick="browse(&quot;gdb&quot;)">Browse</button>',
'<label>PEmicro server</label><input id="server" value="'+esc(c.get('serverPath',''))+'" placeholder="Empty = bundled pegdbserver_power_console.exe"><button onclick="browse(&quot;server&quot;)">Browse</button>',
'</div><div class="mini">',
'<div><label>Device</label><input id="device" value="'+esc(c.get('device','MPC5777M'))+'"></div>',
'<div><label>Interface</label><input id="iface" value="'+esc(c.get('interface','USBMULTILINK'))+'"></div>',
'<div><label>Port</label><input id="port" value="'+esc(c.get('port','USB1'))+'"></div>',
'<div><label>Speed kHz</label><input id="speed" value="'+esc(c.get('speed',5000))+'"></div>',
'<div><label>Core</label><input id="core" value="'+esc(c.get('core',0))+'"></div>',
'<div><label>GDB port</label><input id="gdbport" value="'+esc(c.get('serverPort',7224))+'"></div>',
'</div><br><button onclick="save()">Save Configuration</button><button onclick="send(&quot;settings&quot;)">Open Settings</button><button onclick="send(&quot;versions&quot;)">Show Tool Versions</button><button onclick="send(&quot;detect&quot;)">Detect Multilink</button><div class="muted">Paths may be workspace-relative. Leave GDB/server blank to use bundled runtime.</div></div>',
'<div class="card"><b>Debug</b><br><button onclick="send(&quot;attach&quot;)">Attach Only (No Reset)</button><button onclick="send(&quot;download&quot;)">GDB Download</button><button onclick="send(&quot;resetdebug&quot;)">Download + Reset Debug</button><button onclick="send(&quot;stop&quot;)">Stop Server</button></div>',
'<div class="card"><b>Erase</b><br><button onclick="send(&quot;em&quot;)">Erase Entire Flash</button></div>',
'<div class="card"><b>Program / Verify</b><br><button onclick="send(&quot;pm&quot;)">Program + Verify</button><button onclick="send(&quot;vm&quot;)">Verify Only</button><button onclick="send(&quot;full&quot;)">Erase + Program + Verify</button><button onclick="send(&quot;go&quot;)">Erase + Program + Verify + Run</button></div>',
'<div class="status" id="status">Ready</div>',
'<script>',
'const vscode=acquireVsCodeApi();',
'const q=id=>document.getElementById(id);',
'function values(){return {elf:q("elf").value,image:q("image").value,gdb:q("gdb").value,server:q("server").value,device:q("device").value,iface:q("iface").value,port:q("port").value,speed:q("speed").value,core:q("core").value,gdbport:q("gdbport").value};}',
'function send(c){vscode.postMessage({command:c,...values()});}',
'function save(){vscode.postMessage({command:"save",...values()});}',
'function browse(kind){vscode.postMessage({command:"browse",kind});}',
'window.addEventListener("message",e=>{const m=e.data;if(m.type==="status")q("status").textContent=m.value;if(m.type==="path")q(m.kind).value=m.value;});',
'</script></body></html>'
].join('');
}
async function savePanelConfig(m){
  const c=cfg();
  const target=vscode.ConfigurationTarget.Workspace;
  const updates=[
    ['elfPath',m.elf],['programImagePath',m.image],['gdbPath',m.gdb],['serverPath',m.server],
    ['device',m.device],['interface',m.iface],['port',m.port],
    ['speed',Number(m.speed)||5000],['core',Number(m.core)||0],['serverPort',Number(m.gdbport)||7224]
  ];
  for(const [k,v] of updates)await c.update(k,v,target);
}
async function openPanel(context){
  const folder=ws();if(!folder){vscode.window.showErrorMessage('Open a workspace first.');return;}
  if(panel){panel.reveal();panel.webview.html=html();return;}
  panel=vscode.window.createWebviewPanel('mpc5777m','MPC5777M Flash & Debug',vscode.ViewColumn.One,{enableScripts:true,retainContextWhenHidden:true});
  panel.webview.html=html();
  panel.onDidDispose(()=>panel=undefined);
  panel.webview.onDidReceiveMessage(async m=>{
    const st=s=>panel&&panel.webview.postMessage({type:'status',value:s});
    try{
      if(m.command==='browse'){
        const filters=m.kind==='elf'?{'ELF':['elf'],'All files':['*']}:
          m.kind==='image'?{'Program images':['elf','s19','srec','hex','mot'],'All files':['*']}:
          {'Executable':['exe'],'All files':['*']};
        const u=await vscode.window.showOpenDialog({canSelectMany:false,filters,defaultUri:folder.uri});
        if(u&&u[0]){
          let v=u[0].fsPath;
          const rel=path.relative(folder.uri.fsPath,v);
          if((m.kind==='elf'||m.kind==='image')&&rel&&!rel.startsWith('..')&&!path.isAbsolute(rel))v=rel;
          panel&&panel.webview.postMessage({type:'path',kind:m.kind,value:v});
        }
        return;
      }
      if(m.command==='save'){await savePanelConfig(m);st('Configuration saved to workspace.');return;}
      if(m.command==='settings'){await vscode.commands.executeCommand('workbench.action.openSettings','mpc5777mDebug');return;}
      if(['attach','download','resetdebug','em','pm','vm','full','go'].includes(m.command))await savePanelConfig(m);
      st('Running '+m.command+'...');
      if(m.command==='attach'||m.command==='download'||m.command==='resetdebug')await debug(context,m.command);
      else if(m.command==='stop')await killServer();
      else if(m.command==='detect')await detect(context);
      else if(m.command==='versions')await versions(context);
      else if(m.command==='em')await flashGuard(()=>runFlashServer(context,3));
      else if(m.command==='pm')await flashGuard(()=>runFlashServer(context,1));
      else if(m.command==='vm')await flashGuard(()=>runFlashServer(context,2));
      else if(m.command==='full')await flashGuard(()=>runFlashServer(context,0,{runAfter:false}));
      else if(m.command==='go')await flashGuard(()=>runFlashServer(context,0,{runAfter:true}));
      st('Completed: '+m.command);
    }catch(e){
      output.appendLine('[ERROR] '+(e.stack||e));output.show(true);
      st('ERROR: '+(e.message||e));vscode.window.showErrorMessage(String(e.message||e));
    }
  });
}
function activate(context){pemicroRuntimeRoot=undefined;console.log('[MPC5777M] extension activate');output=vscode.window.createOutputChannel('MPC5777M PEmicro');context.subscriptions.push(output);statusItem=vscode.window.createStatusBarItem('mpc5777m.status',vscode.StatusBarAlignment.Left,10000);statusItem.name='MPC5777M PEmicro';statusItem.text='$(debug-alt) MPC5777M';statusItem.tooltip='Open MPC5777M PEmicro Flash & Debug';statusItem.command='mpc5777m.openPanel';statusItem.show();context.subscriptions.push(statusItem);const reg=(n,f)=>context.subscriptions.push(vscode.commands.registerCommand(n,async()=>{try{return await f();}catch(e){output.appendLine('[ERROR] '+(e.stack||e));output.show(true);vscode.window.showErrorMessage(String(e.message||e));}}));reg('mpc5777m.openPanel',()=>openPanel(context));reg('mpc5777m.attach',()=>debug(context,'attach'));reg('mpc5777m.download',()=>debug(context,'download'));reg('mpc5777m.resetDebug',()=>debug(context,'resetdebug'));reg('mpc5777m.eraseModule',()=>flashGuard(()=>runFlashServer(context,3)));reg('mpc5777m.eraseIfNotBlank',()=>unsupported('Erase If Not Blank'));reg('mpc5777m.blankCheckModule',()=>unsupported('Blank Check Module'));reg('mpc5777m.eraseRange',()=>unsupported('Erase Range'));reg('mpc5777m.blankCheckRange',()=>unsupported('Blank Check Range'));reg('mpc5777m.programModule',()=>flashGuard(()=>runFlashServer(context,1)));reg('mpc5777m.verifyModule',()=>flashGuard(()=>runFlashServer(context,2)));reg('mpc5777m.flashFull',()=>flashGuard(()=>runFlashServer(context,0,{runAfter:false})));reg('mpc5777m.resetRun',()=>flashGuard(()=>runFlashServer(context,0,{runAfter:true})));reg('mpc5777m.customCprog',()=>unsupported('Custom CPROG Sequence'));reg('mpc5777m.stopServer',()=>killServer());reg('mpc5777m.showVersions',()=>versions(context));reg('mpc5777m.detectHardware',()=>detect(context));}
function deactivate(){}
module.exports={activate,deactivate};
