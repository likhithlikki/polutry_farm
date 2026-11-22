(()=>{
const C=window.CONFIG,$=(s,e=document)=>e.querySelector(s),$$=(s,e=document)=>[...e.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const p2=n=>String(n).padStart(2,'0'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MOCK=C.MOCK===true||/[?&]mock=1/.test(location.search);
let ROLE='unknown',busy=false,SNAP=null,SET=null,offline=false,pinsPending=false,pollTimer=null;const ACT=[];
// ---------- time (IST, UTC+05:30) ----------
function ist(d){const t=new Date(d.getTime()+19800000),Y=t.getUTCFullYear(),M=p2(t.getUTCMonth()+1),D=p2(t.getUTCDate()),
 T=`${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}:${p2(t.getUTCSeconds())}`;return{h:`${D}-${M}-${Y} ${T} IST`,iso:`${Y}-${M}-${D}T${T}+05:30`}}
const dateFromTs=ts=>{const n=Number(ts);return new Date(n<(1e12)?n*1000:n)};
const fmt=ts=>ts!==null&&ts!==undefined&&ts!==''?ist(dateFromTs(ts)).h:'—';
const mmss=s=>`${p2(Math.floor(s/60))}:${p2(Math.floor(s%60))}`;
setInterval(()=>{const t=ist(new Date());$('#clk').textContent=t.h;$('#clkiso').textContent=t.iso;tickCycle()},1000);
// ---------- API (POST text/plain: no CORS preflight; key in body, never in URL) ----------
const KEY=()=>localStorage.getItem('pk')||'';
async function call(action,data={}){
 if(MOCK)return mock(action,data);
 const r=await fetch(C.APPS_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({key:KEY(),action,...data})});
 return r.json()}
async function api(a,d){try{if(!MOCK&&!C.APPS_SCRIPT_URL)throw new Error('Apps Script URL is not configured in config.js');const r=await call(a,d);offline=false;if(r.role)ROLE=r.role;if(r.ok===false&&(r.error==='auth'||r.error==='unauthorized'))askKey();return r}catch(e){offline=true;return{ok:false,error:e.message||'network'}}finally{banner()}}
function askKey(){const k=prompt('Enter access key:',KEY());if(k!==null){localStorage.setItem('pk',k.trim());refresh(true)}}
$('#keybtn').onclick=askKey;
$('#theme').onclick=()=>{const r=document.documentElement,d=r.dataset.theme==='dark'||(!r.dataset.theme&&matchMedia('(prefers-color-scheme:dark)').matches);r.dataset.theme=d?'light':'dark'};
// ---------- banners / lock / activity ----------
function banner(){const b=$('#banner');let m='',cl='';
 if(MOCK){m='MOCK DATA — simulated values only; no hardware command is sent';cl='mock'}
 else if(!C.APPS_SCRIPT_URL){m='CONFIGURATION REQUIRED — add the deployed Apps Script /exec URL to config.js';cl='bad'}
 else if(offline||!navigator.onLine){m='⚠ No cloud connection — showing last known data';cl='warn'}
 else if(SNAP&&!SNAP.online){m=`⚠ Board OFFLINE — last report ${fmt(SNAP.last_report_ts)}. New commands remain queued until it returns.`;cl='warn'}
 b.hidden=!m;b.className=cl;b.textContent=m}
function lock(){$$('[data-ctl]').forEach(e=>e.disabled=busy||!['operator','admin'].includes(ROLE));$$('[data-admin]').forEach(e=>e.hidden=ROLE!=='admin')}
function log(m){ACT.unshift(`${ist(new Date()).h}  ${m}`);ACT.length=Math.min(ACT.length,100);const e=$('#act');if(e)e.innerHTML=ACT.map(esc).join('<br>')}
function stage(t,c=''){const b=$('#cmdbar');b.hidden=!t;b.className=c;b.textContent=t}
function canonicalCommand(type,params={}){
 if(type==='feed_now')return{cmd:'feed_start',args:{}};
 if(type==='generator')return{cmd:params.state==='start'?'gen_start':'gen_stop',args:{}};
 if(type==='light')return{cmd:'set_light_mode',args:{value:params.mode}};
 if(type==='ack_alarms')return{cmd:'ack_alarm',args:{value:'all'}};
 if(type==='sync_clock')return{cmd:'sync_clock',args:{value:Math.floor(Date.now()/1000)}};
 return{cmd:type,args:params};
}
async function pollRequest(id,label,t0){
 for(;;){if((Date.now()-t0)/1000>C.CMD_TIMEOUT_S)throw new Error('still pending on the board; check Logs before retrying');
  await sleep(C.CMD_POLL_MS);const st=await api('command_status',{id});
  if(!st.ok)throw new Error(st.error||'could not read command status');
  if(st.state==='applied'){const n=Math.round((Date.now()-t0)/1000);stage(`Done in ${n} s: ${label}`,'ok');log(`${label}: done in ${n} s (applied ${fmt(st.applied_at)})`);return st}
  if(['rejected','expired','failed','unknown'].includes(st.state))throw new Error(st.result||st.error||st.state);
  stage(`Waiting for board: ${label}…`);
 }
}
async function run(type,params,confirmMsg,label){
 if(busy||!['operator','admin'].includes(ROLE))return;if(confirmMsg&&!confirm(confirmMsg))return;
 label=label||type;busy=true;lock();const t0=Date.now();stage(`Sending: ${label}…`);log(`${label}: sending`);
 try{const payload=canonicalCommand(type,params);const r=await api('command',payload);if(!r.ok)throw new Error(r.error||'rejected');
  stage(`Sent: ${label}`);log(`${label}: sent (id ${r.id})`);await pollRequest(r.id,label,t0);
 }catch(e){const pending=/still pending/.test(e.message);stage(`${pending?'Pending': 'Failed'}: ${label} — ${e.message}`,pending?'warn':'bad');log(`${label}: ${pending?'PENDING':'FAILED'} ${e.message}`)}
 finally{busy=false;lock();setTimeout(()=>stage(''),8000);refresh(true)}}
// ---------- router ----------
const V={};let cur='';
function route(){cur=(location.hash||'#dashboard').slice(1);if(!V[cur])cur='dashboard';
 $$('#nav a').forEach(a=>a.classList.toggle('on',a.hash==='#'+cur));refresh(true)}
addEventListener('hashchange',route);
function normaliseSnapshot(s){
 const n=Object.assign({},s),sensor=s.sensor||{},power=s.power||{},net=s.net||s.network||{},feed=s.feed||{},clock=s.clock||{};
 n.temp=sensor.temp??s.temp;n.rh=sensor.rh??s.rh;n.target=s.target_c??s.target;
 n.power_detail=power;n.power=typeof power==='object'?(power.source||power.state||'UNKNOWN'):power;
 n.command_source=s.cmd_source||s.command_source||'UNKNOWN';n.network=net;n.sensor=sensor;
 n.pad=typeof s.pad==='object'?!!s.pad.on:!!s.pad;n.heater=typeof s.heater==='object'?!!s.heater.on:!!s.heater;
 n.light=typeof s.lights==='object'?!!s.lights.on:!!s.light;
 n.fans=(Array.isArray(s.fans)?s.fans:[]).map(f=>Object.assign({},f,{on:f.commanded===true||f.actual===true||f.desired===true||f.on===true}));
 n.feed=Object.assign({},feed,{last_ts:feed.last_start_ts??feed.last_ts,next:feed.next_ts??feed.next});
 n.clock=Object.assign({},clock,{synced:clock.synced??clock.ok,source:clock.source||'unknown'});
 return n;
}
function settingsView(r){
 const d=r.settings||{};
 if(!Object.keys(d).length)return null;
 const fans=Array.isArray(d.fans)?d.fans:[];const c=d.cycle||{},t=d.temp||{},h=d.humidity||{},pad=d.pad||{},heater=d.heater||{},lights=d.lights||{},limits=d.limits||{},power=d.power||{};
 const prog=Array.isArray(lights.program)?lights.program:[];
 const fmtTime=x=>{const mins=Math.max(0,Number(x)||0);return `${p2(Math.floor(mins/60)%24)}:${p2(mins%60)}`};
 const oldFan={list:fans.map(f=>({id:f.id,installed:!!f.installed,role:f.role,mode:f.mode,offset:f.offset_c??0,group:f.group??0})),cycle:{on_min:c.x_on_min??1,off_min:c.y_off_min??1,anchor_ts:Math.floor(Date.now()/1000)},temp:{step_c:t.step_c??1,hyst_c:t.hysteresis_c??0.5}};
 const cv=Array.isArray(t.age_curve)?t.age_curve.map(x=>({age:x.day,temp:x.target_c})):[];
 const oldSp={mode:cv.length?'curve':'target',target_c:t.target_c??25,flock_start:d.flock_start_date||'',curve:cv,rh_min:h.rh_low_limit??0,rh_max:h.pad_rh_block??100,
  pad:{on_above_c:pad.temp_limit_c??25,off_below_c:(pad.temp_limit_c??25)-1,block_rh:h.pad_rh_block??100},
  heater:{on_below_c:heater.on_offset_c??0,off_above_c:heater.off_offset_c??0},
  light:{on:prog[0]?fmtTime(prog[0].on_h*60):'06:00',off:prog[0]?fmtTime(prog[0].off_h*60):'20:00'},
  feed:Array.isArray(d.feed?.schedule)?d.feed.schedule:[],safe_min_c:limits.safe_min_c??5,safe_max_c:limits.safe_max_c??45,engine_stop_mode:power.engine_stop_mode||'amf'};
 return {doc:JSON.parse(JSON.stringify(d)),version:Number(r.version)||0,applied_version:Number(r.applied_version)||0,pending:!!r.pending,ready:true,
  fans:oldFan,sp:oldSp};
}
async function refresh(force){
 // Pins has its own complete status action; do not spend a second Apps Script round trip
 // on dashboard status/settings during the 2.5 s pending GPIO poll cadence.
 if(cur==='pins'){if(V.pins)await V.pins();lock();schedulePoll();return;}
 const s=await api('status');if(s.ok){SNAP=normaliseSnapshot(s);banner()}
 else if(!SNAP){view(`<div class="card"><h2>Controller status unavailable</h2><p>${esc(s.error||'The backend did not return a status snapshot.')}</p><p>Configure the Apps Script URL and access key, then retry.</p><button id="retry">Retry</button></div>`);$('#retry').onclick=()=>refresh(true);return;}
 if(force||!SET){const r=await api('settings_get');if(r.ok)SET=settingsView(r);else SET=null;}
 if(!SNAP)return;
 if(V[cur]&&(force||cur==='dashboard'))await V[cur]();lock();schedulePoll()}
function schedulePoll(){if(pollTimer)clearTimeout(pollTimer);if(!['dashboard','pins'].includes(cur))return;const ms=cur==='pins'&&pinsPending?Math.max(2000,Math.min(3000,Number(C.GPIO_PENDING_POLL_MS)||2500)):C.POLL_MS;pollTimer=setTimeout(async()=>{if(!busy)await refresh(false);else schedulePoll()},ms)}
const view=h=>{const v=$('#view');v.oninput=v.onclick=null;v.innerHTML=h};
async function saveSettingsDocument(next,label,confirmMsg){
 if(ROLE!=='admin'){alert('Only an administrator can change settings.');return;}
 if(busy)return;if(confirmMsg&&!confirm(confirmMsg))return;
 busy=true;lock();const base=SET.version;stage(`Sending: ${label}…`);
 try{const r=await api('settings_put',{settings:next,base_version:base});
  if(!r.ok){if(r.error==='version_conflict'){SET=null;await refresh(true);throw new Error('settings changed on another session; reloaded. Review and save again.');}throw new Error(r.error||'settings rejected');}
  SET.doc=next;SET.version=r.version;SET.pending=true;stage(`Sent: ${label} (version ${r.version})`);log(`${label}: queued as ${r.id}`);
  await pollRequest(r.id,label,Date.now());
 }catch(e){stage(`Failed: ${label} — ${e.message}`,'bad');log(`${label}: FAILED ${e.message}`)}
 finally{busy=false;lock();setTimeout(()=>stage(''),8000);SET=null;refresh(true)}
}
function requireSettings(){if(SET&&SET.ready)return true;view('<div class="card"><h2>Settings are not initialized</h2><p>The cloud has no complete settings document yet. No defaults have been invented by the website. Initialize a validated settings document from the board/administrator workflow before editing.</p></div>');return false;}

// ---------- Dashboard ----------
function gauge(v,min,max,u,tg,lab){const f=Math.max(0,Math.min(1,(v-min)/(max-min))),L=157.08;
 return`<div class="card"><h3>${lab}</h3><svg viewBox="0 0 120 72" width="100%"><path d="M10 60A50 50 0 0 1 110 60" fill="none" stroke="var(--bd)" stroke-width="10" stroke-linecap="round"/>
 <path d="M10 60A50 50 0 0 1 110 60" fill="none" stroke="var(--ac)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${f*L} ${L}"/>
 <text x="60" y="52" text-anchor="middle" style="font-size:20px;font-weight:700;fill:var(--fg)">${v==null?'—':v.toFixed(1)}${u}</text><text x="10" y="70">${min}</text><text x="110" y="70" text-anchor="end">${max}</text></svg>
 <div class="mut" style="text-align:center">${tg!=null?'target '+tg+u:''}</div></div>`}
function trend(tr){if(!tr||tr.length<2)return'<div class="mut">No trend data</div>';const W=600,H=140,n=tr.length,
 line=(k,a,b)=>tr.map((p,i)=>`${(i/(n-1)*W).toFixed(1)},${(H-(p[k]-a)/(b-a)*H).toFixed(1)}`).join(' ');
 return`<svg viewBox="0 0 ${W} ${H+14}" width="100%"><polyline fill="none" stroke="var(--bad)" stroke-width="2" points="${line('temp',15,40)}"/>
 <polyline fill="none" stroke="var(--ac)" stroke-width="2" points="${line('rh',20,100)}"/><text x="4" y="${H+12}">last ${n} min · <tspan style="fill:var(--bad)">temp 15–40 °C</tspan> · <tspan style="fill:var(--ac)">RH 20–100 %</tspan></text></svg>`}
const tile=(h,v,c='')=>`<div class="card"><h3>${h}</h3><div class="big ${c}">${v}</div></div>`;
V.dashboard=async()=>{const s=SNAP,n=s.network||{},cl=s.clock||{},al=(s.alarms||[]).filter(a=>String(a.state||'').toUpperCase()==='ACTIVE'||a.active===true);
 view(`<div class="grid">${gauge(s.temp,15,40,'°C',s.target,'Temperature')}${gauge(s.rh,20,100,'%',null,'Humidity')}
 ${tile('Stage',esc(s.stage))}${tile('Power source',s.power==='GEN'?'⚡ Generator':'Grid',s.power==='GEN'?'warn':'ok')}
 ${tile('Last transfer',fmt(s.power_detail?.last_transfer_ts))}${tile('Command source',esc(s.command_source))}${tile('Clock sync',cl.synced?`OK (${esc(cl.source)})`:'NOT SYNCED',cl.synced?'ok':'bad')}</div>
 <div class="card" style="margin-top:10px"><h3>Trend</h3>${trend(s.trend)}</div>
 <div class="card" style="margin-top:10px"><h3>Fans (16)</h3><div class="fans">${(s.fans||[]).map(f=>`<div class="fan ${f.on?'on':''} ${f.installed?'':'na'}"><b>F${f.id}</b>${esc(f.role)}<br>${esc(f.mode)}<br>${f.installed?`cmd ${f.commanded===true?'ON':'OFF'} / actual ${f.actual===true?'ON':f.actual===false?'OFF':'—'}`:'n/i'}</div>`).join('')}</div></div>
 <div class="grid" style="margin-top:10px">${tile('Pad',s.pad?'ON':'off',s.pad?'ok':'')}${tile('Heater',s.heater?'ON':'off',s.heater?'warn':'')}${tile('Light',s.light?'ON':'off')}
 ${tile('Feed',`last ${fmt(s.feed?.last_ts).slice(11,16)}<br><small class=mut>next ${esc(s.feed?.next||'—')}</small>`)}
 ${tile('Alarms',al.length?al.length+' active':'none',al.length?'bad':'ok')}${tile('Buzzer / alarm relay',`${s.buzzer?.on?'ON':'off'} / ${s.alarm_relay?'ON':'off'}`)}${tile('Sensor age',s.sensor?.age_s==null?'unknown':`${s.sensor.age_s} s`)}${tile('Network',`${esc(n.eth0??n.type??'unknown')} · ${esc(n.ip??'no IP')}<br><small class=mut>gw ${esc(n.gw??'—')} · DHCP ${esc(n.dhcp??'—')} · internet ${esc(n.internet??'—')} · cloud ${n.cloud_ok?'OK':'DOWN'}</small>`,n.cloud_ok?'':'bad')}</div>
 <div class="card" style="margin-top:10px"><h3>Controls ${ROLE==='viewer'?'(viewer: read-only)':''}</h3><div class="row">
 <button data-ctl id="bfeed">🌾 Feed now</button><button data-ctl id="bgon" class="dng">Generator START</button><button data-ctl id="bgoff">Generator STOP</button>
 <select data-ctl id="lsel"><option>AUTO</option><option>ON</option><option>OFF</option></select><button data-ctl id="blt">Set light</button>
 <button data-ctl id="back">Acknowledge alarms</button><button data-ctl id="bclk">Sync clock</button></div></div>
 <div class="card" style="margin-top:10px"><h3>Activity log</h3><div class="log" id="act">${ACT.map(esc).join('<br>')}</div></div>
 <p class="mut">Board time ${esc(fmt(s.ts))} · received by cloud ${fmt(s.last_report_ts)} · role ${esc(ROLE)}</p>`);
 $('#bfeed').onclick=()=>run('feed_now',{},'Run a feed cycle now?','Feed now');
 $('#bgon').onclick=()=>run('generator',{state:'start'},'START the generator? Make sure fuel and area are safe.','Generator start');
 $('#bgoff').onclick=()=>run('generator',{state:'stop'},'STOP the generator?','Generator stop');
 $('#blt').onclick=()=>run('light',{mode:$('#lsel').value},null,'Light '+$('#lsel').value);
 $('#back').onclick=()=>run('ack_alarms',{},null,'Acknowledge alarms');
 $('#bclk').onclick=()=>run('sync_clock',{epoch_ms:Date.now()},null,'Sync clock')};
// ---------- Fan settings ----------
function cycleState(c){const tot=(c.on_min+c.off_min)*60;if(!tot)return{on:false,left:0};const pos=((Date.now()/1000-c.anchor_ts)%tot+tot)%tot,on=pos<c.on_min*60;return{on,left:on?c.on_min*60-pos:tot-pos}}
function tickCycle(){const e=$('#cprev');if(!e||!SET)return;const c=SET.fans.cycle,v=+$('#con')?.value||c.on_min,w=+$('#coff')?.value||c.off_min,s=cycleState({...c,on_min:v,off_min:w});
 e.innerHTML=`CYCLE fans: <b class="${s.on?'ok':''}">${s.on?'ON':'OFF'}</b> — next change in <b>${mmss(s.left)}</b> (${v} min ON / ${w} min OFF)`}
const sel=(cls,opts,v)=>`<select data-ctl class="${cls}">${opts.map(o=>`<option ${o===v?'selected':''}>${o}</option>`).join('')}</select>`;
V.fans=async()=>{if(!requireSettings())return;const f=SET.fans;
 view(`<div id="fwarn"></div><div class="card sc"><h3>Fans</h3><table><tr><th>#</th><th>Installed</th><th>Role</th><th>Mode</th><th>TEMP offset °C</th></tr>
 ${f.list.map((x,i)=>`<tr data-i="${i}"><td>F${x.id}</td><td><input data-ctl type="checkbox" class="ins" ${x.installed?'checked':''}></td><td>${sel('role',['CYCLE','TEMP'],x.role)}</td>
 <td>${sel('mode',['AUTO','MANUAL_ON','MANUAL_OFF'],x.mode)}</td><td><input data-ctl type="number" step="0.1" class="off" value="${x.offset}"></td></tr>`).join('')}</table></div>
 <div class="grid g2" style="margin-top:10px"><div class="card"><h3>Cycle X/Y</h3><label class="f">ON minutes (X)<input data-ctl id="con" type="number" min="0" value="${f.cycle.on_min}"></label>
 <label class="f">OFF minutes (Y)<input data-ctl id="coff" type="number" min="0" value="${f.cycle.off_min}"></label><div id="cprev"></div></div>
 <div class="card"><h3>TEMP staging</h3><label class="f">Step °C<input data-ctl id="stp" type="number" step="0.1" value="${f.temp.step_c}"></label>
 <label class="f">Hysteresis °C<input data-ctl id="hys" type="number" step="0.1" value="${f.temp.hyst_c}"></label></div></div>
 <div class="row"><button data-ctl class="pri" id="save">Save fan settings</button></div>`);
 const warn=()=>{const n=$$('tr[data-i]').filter(r=>$('.ins',r).checked&&$('.role',r).value==='TEMP').length;
  $('#fwarn').innerHTML=n?'':'<div class="alert">⚠ No installed fan has role TEMP — temperature control will not start any fan.</div>'};
 $('#view').oninput=()=>{warn();tickCycle()};warn();tickCycle();
 $('#save').onclick=()=>{const o=JSON.parse(JSON.stringify(f));
  o.list=$$('tr[data-i]').map(r=>({...f.list[+r.dataset.i],installed:$('.ins',r).checked,role:$('.role',r).value,mode:$('.mode',r).value,offset:+$('.off',r).value}));
  o.cycle.on_min=+$('#con').value;o.cycle.off_min=+$('#coff').value;o.temp={step_c:+$('#stp').value,hyst_c:+$('#hys').value};
  if(!o.list.some(x=>x.installed)&&!confirm('No fans installed. Save anyway?'))return;
  const doc=JSON.parse(JSON.stringify(SET.doc));doc.fans=o.list.map(x=>({id:x.id,installed:x.installed,role:x.role,mode:x.mode,offset_c:x.offset,group:x.group||0}));
  doc.cycle=Object.assign({},doc.cycle,{x_on_min:o.cycle.on_min,y_off_min:o.cycle.off_min});doc.temp=Object.assign({},doc.temp,{step_c:o.temp.step_c,hysteresis_c:o.temp.hyst_c});
  saveSettingsDocument(doc,'Save fan settings')}};
// ---------- Setpoints ----------
const nf=(id,l,v,st=0.1)=>`<label class="f">${l}<input data-ctl id="${id}" type="number" step="${st}" value="${v}"></label>`;
const tf=(id,l,v)=>`<label class="f">${l}<input data-ctl id="${id}" type="time" value="${v}"></label>`;
V.setpoints=async()=>{if(!requireSettings())return;const s=SET.sp;
 const rowC=(c)=>`<tr><td><input data-ctl class="ca" type="number" value="${c.age}"></td><td><input data-ctl class="ct" type="number" step="0.1" value="${c.temp}"></td><td><button data-ctl class="x">✕</button></td></tr>`;
 const rowF=(c)=>`<tr><td><input data-ctl class="ft" type="time" value="${c.time}"></td><td><input data-ctl class="fd" type="number" value="${c.secs}"></td><td><button data-ctl class="x">✕</button></td></tr>`;
 view(`<div class="grid g2"><div class="card"><h3>Temperature</h3><label class="f">Mode<select data-ctl id="mode"><option value="target" ${s.mode==='target'?'selected':''}>Fixed target</option><option value="curve" ${s.mode==='curve'?'selected':''}>Age curve</option></select></label>
 ${nf('tg','Target °C',s.target_c)}<label class="f">Flock start date<input data-ctl id="fs" type="date" value="${s.flock_start}"></label></div>
 <div class="card"><h3>Age curve (day → °C)</h3><table id="cv">${s.curve.map(rowC).join('')}</table><button data-ctl id="addc">+ row</button></div>
 <div class="card"><h3>Humidity limits</h3>${nf('rl','RH low %',s.rh_min,1)}${nf('rh','RH high %',s.rh_max,1)}</div>
 <div class="card"><h3>Pad rules</h3>${nf('pon','Pad temperature limit °C',s.pad.on_above_c)}${nf('prh','Block if RH above %',s.pad.block_rh,1)}</div>
 <div class="card"><h3>Heater</h3>${nf('hon','Heater ON offset °C',s.heater.on_below_c)}${nf('hoff','Heater OFF offset °C',s.heater.off_above_c)}</div>
 <div class="card"><h3>Light program</h3>${tf('lon','ON at',s.light.on)}${tf('loff','OFF at',s.light.off)}</div>
 <div class="card"><h3>Feed schedule (time, seconds)</h3><table id="fd">${s.feed.map(rowF).join('')}</table><button data-ctl id="addf">+ row</button></div>
 <div class="card"><h3>Sensor safety range</h3>${nf('smin','Minimum valid temperature °C',s.safe_min_c)}${nf('smax','Maximum valid temperature °C',s.safe_max_c)}<p class="mut">Outside this range, the sensor is treated as invalid and the daemon enters its sensor-loss safety behaviour.</p></div>
 <div class="card"><h3>Generator stop policy</h3><label class="f">Engine stop mode<select data-ctl id="esm"><option value="amf" selected>AMF — external generator controller</option></select></label><p class="mut">Board-driven GEN_STOP is disabled until its wiring and stop sequence are confirmed and commissioned.</p></div></div>
 <div class="row"><button data-ctl class="pri" id="save">Save setpoints</button></div>`);
 $('#view').onclick=e=>{if(e.target.classList.contains('x'))e.target.closest('tr').remove()};
 $('#addc').onclick=()=>{$('#cv').insertAdjacentHTML('beforeend',rowC({age:0,temp:25}));lock()};
 $('#addf').onclick=()=>{$('#fd').insertAdjacentHTML('beforeend',rowF({time:'08:00',secs:60}));lock()};
 $('#save').onclick=()=>{const v=id=>+$('#'+id).value,doc=JSON.parse(JSON.stringify(SET.doc));
  if(!doc.temp)doc.temp={};if(!doc.humidity)doc.humidity={};if(!doc.pad)doc.pad={};if(!doc.heater)doc.heater={};if(!doc.lights)doc.lights={};
  doc.flock_start_date=$('#fs').value;doc.temp.target_c=v('tg');doc.temp.age_curve=$('#mode').value==='curve'?$$('#cv tr').map(r=>({day:+$('.ca',r).value,target_c:+$('.ct',r).value})).sort((a,b)=>a.day-b.day):[];
  doc.humidity.rh_low_limit=v('rl');doc.humidity.pad_rh_block=v('prh');doc.pad.temp_limit_c=v('pon');
  doc.heater.on_offset_c=v('hon');doc.heater.off_offset_c=v('hoff');
  if(!doc.limits)doc.limits={};doc.limits.safe_min_c=v('smin');doc.limits.safe_max_c=v('smax');
  if(!doc.power)doc.power={};doc.power.engine_stop_mode=$('#esm').value;
  const existing=Array.isArray(doc.lights.program)?doc.lights.program:[],onH=+$('#lon').value.split(':')[0],offH=+$('#loff').value.split(':')[0];if(existing.length)existing[0]=Object.assign({},existing[0],{on_h:onH,off_h:offH});doc.lights.program=existing.length?existing:[{from_day:0,on_h:onH,off_h:offH}];
  if(!doc.feed)doc.feed={};doc.feed.schedule=$$('#fd tr').map(r=>({time:$('.ft',r).value,secs:+$('.fd',r).value})).filter(x=>x.time&&Number.isFinite(x.secs));
  saveSettingsDocument(doc,'Save setpoints','Save the changed temperature, humidity, pad, heater, light and feed settings?')};
};
// ---------- Alarms / Logs / Board ----------
V.alarms=async function(){
 const r=await api('alarms');
 const active=r.active||[];
 const history=r.alarms||[];
 const activeRows=active.map((alarm,index)=>{
  const id=alarm.id||alarm.name||('alarm_'+index);
  return `<tr><td>${fmt(alarm.since??alarm.ts)}</td><td>${esc(alarm.text||alarm.name||id)}</td><td>${esc(alarm.level||'')}</td><td class="bad">${esc(alarm.state||'ACTIVE')}</td><td><button data-ctl data-ack="${esc(id)}">Acknowledge</button><select data-ctl data-mute="${esc(id)}"><option value="15">15 min</option><option value="60">60 min</option><option value="240">240 min</option></select><button data-ctl data-mb="${esc(id)}">Mute</button></td></tr>`;
 }).join('');
 const historyRows=history.map(alarm=>`<tr><td>${fmt(alarm.ts)}</td><td>${esc(alarm.name||alarm.text||'')}</td><td>${esc(alarm.level||'')}</td><td>${esc(alarm.state||alarm.status||'')}</td></tr>`).join('');
 view(`<div class="card sc"><h3>Active alarms</h3><table><tr><th>Time</th><th>Alarm</th><th>Level</th><th>State</th><th>Action</th></tr>${activeRows||'<tr><td colspan="5">No active alarms</td></tr>'}</table></div>
 <div class="card sc"><h3>Alarm history</h3><table><tr><th>Time</th><th>Alarm</th><th>Level</th><th>Result</th></tr>${historyRows}</table></div>`);
 $$('[data-ack]').forEach(btn=>{btn.onclick=()=>run('ack_alarm',{value:btn.dataset.ack},null,'Acknowledge '+btn.dataset.ack);});
 $$('[data-mb]').forEach(btn=>{btn.onclick=()=>{
  const id=btn.dataset.mb;
  const select=document.querySelector(`[data-mute="${CSS.escape(id)}"]`);
  const mins=select?Number(select.value):15;
  run('mute_alarm',{value:mins},null,'Mute alarm for '+mins+' minutes');
 };});
};
let logOffset=0,logRows=[];
V.logs=async function(reset=true){
 const tabs=['telemetry','commands','alarms','power_events','feed_events','config_changes','board_health'];
 const t=sessionStorage.getItem('lt')||tabs[0];
 if(reset)logOffset=0;
 const r=await api('logs',{tab:t,n:100,offset:logOffset});
 const rows=r.rows||[],cols=r.header||Object.keys(rows[0]||{});
 if(reset)logRows=rows;else logRows=logRows.concat(rows);
 logOffset=r.next_offset||logRows.length;
 view(`<div class="row">${tabs.map(x=>`<button class="${x===t?'pri':''}" data-t="${x}">${x}</button>`).join('')}<button id="csv">Download CSV</button><button id="more">Load more</button></div>
 <div class="card sc"><table><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr>${logRows.map(x=>`<tr>${cols.map(c=>`<td>${/(^ts$|_ts$|_at$)/.test(c)?fmt(x[c]):esc(x[c])}</td>`).join('')}</tr>`).join('')}</table></div>`);
 $$('[data-t]').forEach(btn=>{btn.onclick=()=>{sessionStorage.setItem('lt',btn.dataset.t);V.logs(true);};});
 $('#more').onclick=()=>V.logs(false);
 $('#csv').onclick=function(){
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv=[cols.map(q).join(','),...logRows.map(x=>cols.map(c=>q(x[c])).join(','))].join('\r\n');
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  link.download=t+'.csv';link.click();URL.revokeObjectURL(link.href);
 };
};
V.board=async()=>{const r=await api('board'),b=r.board||{},g=r.gpio||[];
 view(`<div class="card sc"><h3>Board details</h3><table>${Object.entries(b).filter(([k])=>k!=='gpio_lines').map(([k,v])=>`<tr><th>${esc(k)}</th><td>${/_ts$|sampled_at/.test(k)?fmt(v):esc(v)}</td></tr>`).join('')}
 <tr><th>your role</th><td>${esc(ROLE)}</td></tr><tr><th>mode</th><td>${MOCK?'MOCK data (no backend)':'live via Apps Script'}</td></tr></table></div>
 <div class="card sc"><h3>GPIO read-back (no pin assumptions)</h3><table><tr><th>Line</th></tr>${g.map(x=>`<tr><td>${esc(typeof x==='string'?x:JSON.stringify(x))}</td></tr>`).join('')||'<tr><td>No GPIO diagnostic lines reported</td></tr>'}</table></div>`)};
// ---------- Generic GPIO Pins (desired state is never presented as read-back) ----------
const level=v=>v===true?'HIGH':v===false?'LOW':'—';
function pinBadge(p,online){if(!online)return['Offline','offline'];const s=String(p.state||'UNKNOWN').toUpperCase();
 if(s==='CONFIRMED')return['Confirmed','ok'];if(s==='PENDING')return['Pending','pending'];if(s==='MISMATCH')return['Mismatch','bad'];if(s==='ERROR')return['Error','bad'];return['Unknown','muted']}
async function setPin(pin,value){
 if(busy||ROLE==='viewer'||!['operator','admin'].includes(ROLE))return;
 if(value===true&&!confirm(`Turn ${pin.label||pin.id} ON? Confirm that only a test LED with a series resistor is connected and no load, relay or motor is attached.`))return;
 busy=true;lock();stage(`Sending GPIO ${pin.id} ${value?'HIGH':'LOW'}…`);log(`GPIO ${pin.id}: request ${value?'HIGH':'LOW'}`);
 try{const r=await api('gpio_set',{pin:pin.id,value:value?'HIGH':'LOW'});if(!r.ok)throw new Error(r.error||'GPIO request rejected');
  stage(`GPIO ${pin.id}: pending read-back`,'warn');log(`GPIO ${pin.id}: request ${r.request_id||''} queued`);pinsPending=true;
 }catch(e){stage(`GPIO ${pin.id}: failed — ${e.message}`,'bad');log(`GPIO ${pin.id}: FAILED ${e.message}`)}
 finally{busy=false;lock();await refresh(true);schedulePoll();setTimeout(()=>stage(''),8000)}
}
V.pins=async()=>{
 const r=await api('gpio_status');
 if(!r.ok){pinsPending=false;view(`<div class="card"><h2>GPIO status unavailable</h2><p>${esc(r.error||'No pin status was returned.')}</p><p class="mut">The board must report its configured pin inventory before any pin can be controlled.</p></div>`);return}
 const online=r.board_online===true,pins=Array.isArray(r.pins)?r.pins:[];
 if(SNAP){SNAP.online=online;if(r.last_report_ts!==undefined)SNAP.last_report_ts=r.last_report_ts;}
 banner();
 pinsPending=pins.some(p=>String(p.state).toUpperCase()==='PENDING');
 const rows=pins.map(p=>{const [label,cl]=pinBadge(p,online),canWrite=p.dir==='out'&&p.allow_write===true&&['operator','admin'].includes(ROLE),target=p.desired===true||p.desired===null&&p.actual===true?false:true;
  const disabled=!canWrite||busy||String(p.state).toUpperCase()==='PENDING';
  const control=canWrite?`<button class="pin-toggle ${target?'turn-on':'turn-off'}" data-pin="${esc(p.id)}" ${disabled?'disabled':''}>Set ${target?'ON':'OFF'}</button>`:'<span class="mut">Read only</span>';
  const readbackNote=p.backend==='led'?'LED driver state (not an independent pin measurement)':'';
  const hardReadOnly=(p.backend==='led'&&['mmc0::','mmc1::'].includes(String(p.led||'')));
  const safeControl=canWrite&&!hardReadOnly?control:'<span class="mut">Read only</span>';
  return `<tr><td><b>${esc(p.label||p.id)}</b><small class="mut pin-id">${esc(p.id)}</small>${readbackNote?`<small class="mut">${readbackNote}</small>`:''}</td><td>${esc(String(p.dir||'—').toUpperCase())}</td><td>${level(p.desired)}</td><td>${level(p.actual)}</td><td><span class="pin-badge ${cl}">${label}</span>${p.error?`<small class="pin-error">${esc(p.error)}</small>`:''}</td><td>${fmt(p.last_change_ts)}</td><td>${safeControl}</td></tr>`;
 }).join('');
 view(`<div class="card pin-overview"><div><h2>Pins</h2><p class="mut">Desired values are requests. Actual values come only from board-side GPIO read-back.</p></div><div class="board-state ${online?'online':'offline'}"><span class="state-dot"></span>Board ${online?'online':'offline'}</div></div>
 <div class="card sc"><table class="pin-table"><thead><tr><th>Pin</th><th>Direction</th><th>Desired</th><th>Actual</th><th>Status</th><th>Last change</th><th>Control</th></tr></thead><tbody>${rows||'<tr><td colspan="7">No pins reported by the board. Add only verified Linux GPIO resources to gpio_pins.json; do not guess connector pin numbers.</td></tr>'}</tbody></table></div>
 <p class="mut">${online?'Board report received '+esc(fmt(r.last_report_ts)):'The board has not reported within 15 seconds. Commands will remain queued.'} · Role ${esc(ROLE)} · ${pinsPending?'Checking pending commands every 2.5 seconds':'Checking status every 15 seconds'}</p>
 <p class="mut">All new pins are shipped disabled. Output controls are available only for board-verified USER-owned pins marked allow_write=true. LED-class read-back is the Linux LED driver state, not an independent electrical measurement; debug GPIO disagreement is reported as Mismatch.</p>`);
 $$('[data-pin]').forEach(btn=>{btn.onclick=()=>{const p=pins.find(x=>x.id===btn.dataset.pin);if(p)setPin(p,p.desired===true||p.desired===null&&p.actual===true?false:true)}});
 lock();
};

// ---------- Mock backend ----------
const M={cmds:{},logs:[],applied:{},gpio:{pins:[{id:'SIM_LED',label:'Demo LED (simulation)',backend:'sysfs',dir:'out',allow_write:true,owner:'user',desired:false,actual:false,state:'CONFIRMED',last_change_ts:Math.floor(Date.now()/1000),request_id:'',error:''},{id:'SIM_INPUT',label:'Demo input (simulation)',backend:'gpiod',dir:'in',allow_write:false,owner:'TODO_USER',desired:null,actual:false,state:'UNKNOWN',last_change_ts:null,request_id:'',error:''}],online:true}};
function defaults(){const L=[];for(let i=1;i<=16;i++)L.push({id:i,installed:i<=14,role:i<=8?'TEMP':'CYCLE',mode:'AUTO',offset:i<=8?+((i-1)*0.5).toFixed(1):0});
 return{fans:{list:L,cycle:{on_min:5,off_min:10,anchor_ts:Math.floor(Date.now()/1000)-137},temp:{step_c:0.5,hyst_c:0.3}},
 sp:{mode:'curve',target_c:27,flock_start:ist(new Date(Date.now()-12*864e5)).iso.slice(0,10),curve:[{age:0,temp:33},{age:7,temp:30},{age:14,temp:27},{age:21,temp:25},{age:28,temp:23},{age:35,temp:22}],
 rh_min:45,rh_max:75,pad:{on_above_c:30,off_below_c:28,block_rh:80},heater:{on_below_c:24,off_above_c:26},light:{on:'06:00',off:'20:00'},feed:[{time:'07:00',secs:90},{time:'12:00',secs:90},{time:'17:00',secs:90}]}}}
M.set=defaults();M.light='AUTO';M.gen=false;M.acked=false;
function mockSnap(){const now=Date.now(),sp=M.set.sp,age=Math.max(0,Math.floor((now-new Date(sp.flock_start))/864e5)),
 tgt=sp.mode==='target'?sp.target_c:(([...sp.curve].reverse().find(c=>c.age<=age))||sp.curve[0]||{temp:27}).temp,
 T=t=>27.5+2.5*Math.sin(t/6e5)+0.4*Math.sin(t/37e3),RH=t=>62+8*Math.cos(t/9e5),cs=cycleState({...M.set.fans.cycle}),temp=T(now),
 fans=M.set.fans.list.map(f=>({id:f.id,installed:f.installed,role:f.role,mode:f.mode,on:f.installed&&(f.mode==='MANUAL_ON'||f.mode==='AUTO'&&(f.role==='CYCLE'&&cs.on||f.role==='TEMP'&&temp>tgt+f.offset))})),
 tr=[];for(let i=59;i>=0;i--)tr.push({temp:T(now-i*6e4),rh:RH(now-i*6e4)});
 const hh=ist(new Date(now)).iso.slice(11,16);
 return{ok:true,role:'admin',ts:Math.floor(now/1000),last_report_ts:Math.floor(now/1000)-20,online:true,temp,rh:RH(now),target:tgt,stage:`Day ${age} (curve)`,power:M.gen?'GEN':'GRID',power_detail:{source:M.gen?'GEN':'EB',last_transfer_ts:Math.floor(now/1000)-86400},sensor:{age_s:1,valid:true},buzzer:{on:false},alarm_relay:false,
 command_source:'ONLINE_WEB',clock:{synced:true,source:'NTP',offset_s:0.2},fans,pad:temp>sp.pad.on_above_c,heater:temp<sp.heater.on_below_c,
 light:M.light==='ON'||M.light==='AUTO'&&hh>=sp.light.on&&hh<sp.light.off,feed:{last_ts:Math.floor(now/1000)-5*3600,next:sp.feed.find(f=>f.time>hh)?.time||sp.feed[0]?.time},
 network:{type:'LTE',rssi:-79,cloud_ok:true},trend:tr,alarms:M.acked?[]:[{active:true,name:'High humidity (demo)',level:'WARN',ts:Math.floor(now/1000)-600}],
 board:{device_id:'POULTRY-001',firmware:'1.0.0-mock',daemon:'0.9.0',agent:'0.1.0',ip:'192.168.1.50',uptime_s:123456,free_mem_kb:5120,queue_depth:0,last_boot_ts:Math.floor(now/1000)-123456}}}
function applyMock(c){if(M.applied[c.id])return;M.applied[c.id]=1;const{type,params:p}=c;
 if(type==='set_fan_mode'){const f=M.set.fans.list.find(x=>'fan'+x.id===p.channel);if(f)f.mode=p.value;}if(type==='set_light_mode')M.light=p.value;if(type==='ack_alarm')M.acked=true;if(type==='gen_start')M.gen=true;if(type==='gen_stop')M.gen=false;
 M.logs.unshift({ts:Math.floor(Date.now()/1000),type,params:JSON.stringify(p).slice(0,80),by:'web'})}
async function mock(a,d){await sleep(250+Math.random()*350);
 if(a==='status')return mockSnap();if(a==='settings_get')return{ok:true,role:'admin',settings:{fans:M.set.fans.list.map(f=>({id:f.id,installed:f.installed,role:f.role,mode:f.mode,offset_c:f.offset})),cycle:{x_on_min:M.set.fans.cycle.on_min,y_off_min:M.set.fans.cycle.off_min},temp:{target_c:M.set.sp.target_c,step_c:M.set.fans.temp.step_c,hysteresis_c:M.set.fans.temp.hyst_c,age_curve:M.set.sp.curve.map(c=>({day:c.age,target_c:c.temp}))},flock_start_date:M.set.sp.flock_start,humidity:{rh_low_limit:M.set.sp.rh_min,pad_rh_block:M.set.sp.pad.block_rh},pad:{temp_limit_c:M.set.sp.pad.on_above_c},heater:{on_offset_c:M.set.sp.heater.on_below_c,off_offset_c:M.set.sp.heater.off_above_c},lights:{program:[{from_day:0,on_h:6,off_h:20}]}} ,version:1,applied_version:1,pending:false};
 if(a==='alarms')return{ok:true,active:[...(M.acked?[]:[{id:'humidity_high',active:true,name:'High humidity (demo)',level:'WARN',ts:Math.floor(Date.now()/1000)-600}])],alarms:[...(M.acked?[]:[{active:true,name:'High humidity (demo)',level:'WARN',ts:Math.floor(Date.now()/1000)-600}]),{active:false,name:'Grid power lost',level:'CRIT',ts:Math.floor(Date.now()/1000)-86400,cleared_ts:Math.floor(Date.now()/1000)-85500}]};
 if(a==='logs'){const n=Date.now(),rows=d.tab==='commands'||d.tab==='config_changes'?M.logs:Array.from({length:12},(_,i)=>({ts:Math.floor(n/1000)-i*60,temp:+(27+Math.sin(i)).toFixed(1),rh:Math.round(60+5*Math.cos(i))}));return{ok:true,rows}}
 if(a==='command'){const id='C'+Date.now();M.cmds[id]={id,t0:Date.now(),cmd:d.cmd,args:d.args};return{ok:true,role:'admin',id,status:'queued'}}
 if(a==='command_status'){const c=M.cmds[d.id];if(!c)return{ok:false,error:'not_found'};const e=(Date.now()-c.t0)/1e3;if(e<2)return{ok:true,role:'admin',state:'queued'};if(e<5)return{ok:true,role:'admin',state:'delivered'};applyMock(c);return{ok:true,role:'admin',state:'applied',applied_at:Math.floor(Date.now()/1000)}}
 if(a==='settings_put'){return{ok:true,role:'admin',id:'V'+Date.now(),version:(d.base_version||1)+1,status:'queued'}}
 if(a==='board')return{ok:true,role:'admin',board:mockSnap().board,gpio:[]}
 if(a==='gpio_status')return{ok:true,role:ROLE==='unknown'?'admin':ROLE,board_online:M.gpio.online,last_report_ts:Math.floor(Date.now()/1000),pins:M.gpio.pins.map(p=>({...p}))};
 if(a==='gpio_set'){const p=M.gpio.pins.find(x=>x.id===d.pin);if(!p)return{ok:false,error:'unknown_pin'};if(ROLE==='viewer')return{ok:false,error:'forbidden'};if(p.dir!=='out'||!p.allow_write||p.owner!=='user')return{ok:false,error:'pin_read_only'};const v=d.value==='HIGH'||d.value===true;if(!(v||d.value==='LOW'||d.value===false))return{ok:false,error:'bad_value'};p.desired=v;p.state='PENDING';p.request_id='GM'+Date.now();p.last_change_ts=Math.floor(Date.now()/1000);const id=p.request_id;setTimeout(()=>{if(p.request_id===id){p.actual=v;p.state='CONFIRMED';p.last_change_ts=Math.floor(Date.now()/1000)}},2200);return{ok:true,role:ROLE,pin:p.id,desired:v,request_id:id,state:'PENDING'};}
 return{ok:false,error:'unknown_action'}}
if(MOCK)log('MOCK mode: simulated data, no backend');
if(!MOCK&&!KEY())setTimeout(askKey,300);
route();
})();
