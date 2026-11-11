"use strict";
/* =====================================================================
   Sherlock Paws · app.js
   Lo usan index.html (voluntarios) y reportar.html (público, SP_PUBLICO)
   ===================================================================== */
const PUBLICO = !!window.SP_PUBLICO;

const CFG = Object.assign({
  SUPABASE_URL:"", SUPABASE_ANON_KEY:"", CIUDAD:"Querétaro", CENTRO:[20.5888,-100.3899], ZOOM:12,
  CAJA_BUSQUEDA:[-100.62,20.85,-100.12,20.40],
  RADIO_POR_TAMANO:{ perro:{mini:1,chico:1.5,mediano:2.5,grande:4}, gato:{mini:0.3,chico:0.5,mediano:0.8,grande:1} },
  CRECIMIENTO_DIARIO:0.10, FACTOR_MAXIMO:3, DIAS_MAX_COINCIDENCIA:90,
  COMPARAR_FOTOS:true,
  CAPTURAS_PARA:"voluntarios",    // "voluntarios" o "admins"
  IA_PARA:"voluntarios"           // quién ve el botón "Mejorar con IA": "voluntarios", "admins" o "nadie"
}, window.SP_CONFIG || {});
// Compatibilidad con config.js de la versión 1 (radios sin especie)
if(typeof CFG.RADIO_POR_TAMANO.mini === "number"){
  CFG.RADIO_POR_TAMANO = { perro:CFG.RADIO_POR_TAMANO, gato:{mini:0.3,chico:0.5,mediano:0.8,grande:1} };
}

const ESPECIES = { perro:{label:"Perro", em:"🐕"}, gato:{label:"Gato", em:"🐈"} };
const TAM = {
  perro:{
    mini:    {label:"Mini",    desc:"menos de 5 kg · chihuahua, pomerania"},
    chico:   {label:"Chico",   desc:"5–10 kg · schnauzer mini, poodle"},
    mediano: {label:"Mediano", desc:"10–25 kg · beagle, mestizo típico"},
    grande:  {label:"Grande",  desc:"más de 25 kg · pastor, labrador"}
  },
  gato:{
    mini:    {label:"Gatito",  desc:"cachorro, menos de 6 meses"},
    chico:   {label:"Chico",   desc:"adulto pequeño o delgado"},
    mediano: {label:"Mediano", desc:"adulto promedio"},
    grande:  {label:"Grande",  desc:"adulto grande · maine coon"}
  }
};
const ORDEN_TAM = ["mini","chico","mediano","grande"];
const TIPOS = {
  perdido:   {label:"Perdido",       verbo:"se perdió",       pin:"perdido"},
  visto:     {label:"Visto",         verbo:"lo viste",        pin:"visto"},
  resguardo: {label:"En resguardo",  verbo:"lo encontraron",  pin:"resguardo"}
};
const RAZAS = {
  perro:["Mestizo / criollo","Chihuahua","Schnauzer","Poodle / french poodle","Pug","Yorkshire","Pomerania","Shih Tzu","Maltés","Beagle","Cocker","Dachshund (salchicha)","Bulldog francés","Pitbull","Bóxer","Labrador","Golden retriever","Pastor alemán","Pastor belga","Husky","Border collie","Rottweiler","Dálmata","Xoloitzcuintle","Galgo"],
  gato:["Doméstico / mestizo","Siamés","Persa","Angora","Maine coon","Bengalí","Ragdoll","Esfinge"]
};
const MODO_DEMO = !(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

/* =====================================================================
   Utilidades
   ===================================================================== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hoyISO = () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
function fechaLocal(iso){ const [y,m,d]=String(iso).slice(0,10).split("-").map(Number); return new Date(y,(m||1)-1,d||1); }
function diasDesde(iso){ return Math.max(0, Math.round((fechaLocal(hoyISO()) - fechaLocal(iso))/864e5)); }
function fmtFecha(iso){ return fechaLocal(iso).toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"}); }
function haceTexto(iso){ const d=diasDesde(iso); return d===0?"hoy":d===1?"ayer":`hace ${d} días`; }
const esp = r => r.especie==="gato" ? "gato" : "perro";
const tamLabel = r => TAM[esp(r)][r.tamano]?.label || "";
const radioSugerido = (especie,tam) => (CFG.RADIO_POR_TAMANO[especie]||CFG.RADIO_POR_TAMANO.perro)[tam] || 1;
function radioEf(r){
  if(r.tipo==="resguardo") return Number(r.radio_km);       // el animal ya está resguardado: no se mueve
  const f=Math.min(1 + CFG.CRECIMIENTO_DIARIO*diasDesde(r.fecha_evento), CFG.FACTOR_MAXIMO);
  return Number(r.radio_km)*f;
}
function distKm(a,b){
  const R=6371, toR=x=>x*Math.PI/180;
  const dLa=toR(b.lat-a.lat), dLo=toR(b.lng-a.lng);
  const h=Math.sin(dLa/2)**2 + Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
const fmtKm = k => k<1 ? `${Math.round(k*1000)} m` : `${k.toFixed(1)} km`;
function telWa(t){ let d=String(t||"").replace(/\D/g,""); if(!d) return ""; if(d.length===10) d="52"+d; return d; }
let toastT;
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("ver"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("ver"),3600); }
function cargando(on,txt){ const c=$("#cargando"); c.textContent=txt||"Guardando…"; c.style.display=on?"flex":"none"; }
async function copiar(txt){
  try{ await navigator.clipboard.writeText(txt); return true; }
  catch(e){ const ta=document.createElement("textarea"); ta.value=txt; document.body.appendChild(ta); ta.select(); let ok=false; try{ ok=document.execCommand("copy"); }catch(_){} ta.remove(); return ok; }
}
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)));

// Palabras clave de color/raza/señas
const STOP=new Set("de la el los las y con en un una unos unas color perro perra perrito perrita gato gata gatito gatita muy tiene lleva sin del al es su se le lo que por para como mas tipo poco algo esta este estaba trae".split(" "));
const SINON={marron:"cafe",chocolate:"cafe",cafecit:"cafe",cafe:"cafe",canel:"cafe",bayo:"cafe",dorad:"amarill",guer:"amarill",naranj:"amarill",crem:"blanc",hues:"blanc",plata:"gris",atigrad:"atigrad",manchad:"manch",pint:"manch",tricolor:"tricolor",carey:"tricolor"};
function tokens(txt){
  const out=new Set();
  String(txt||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").split(/[^a-z0-9ñ]+/).forEach(w=>{
    if(w.length<3 || STOP.has(w)) return;
    let s=w.replace(/(es|s)$/,""); if(s.length>4) s=s.replace(/[ao]$/,"");
    out.add(SINON[s]||s);
  });
  return out;
}
// Comprime una imagen a JPEG (Blob)
function comprimir(file, maxDim, calidad){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file), img=new Image();
    img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error("Formato de imagen no compatible")); };
    img.onload=()=>{
      const k=Math.min(1, maxDim/Math.max(img.width,img.height)), c=document.createElement("canvas");
      c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b=>b?res(b):rej(new Error("No se pudo comprimir")),"image/jpeg",calidad);
    };
    img.src=url;
  });
}
const blobADataURL = b => new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.readAsDataURL(b); });
function cargarImagen(src, cors){
  return new Promise((res,rej)=>{ const i=new Image(); if(cors) i.crossOrigin="anonymous"; i.onload=()=>res(i); i.onerror=()=>rej(new Error("No se pudo cargar la foto")); i.src=src; });
}
function cargarScript(src){
  return new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=()=>rej(new Error("No cargó "+src)); document.head.appendChild(s); });
}
const conLimite = (p,ms) => Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error("tiempo agotado")),ms))]);

/* =====================================================================
   Huella de foto (IA en el navegador, gratis: MobileNet + TensorFlow.js)
   Convierte cada foto en 1280 números; fotos parecidas → números parecidos.
   ===================================================================== */
let _modelo=null;
function cargarModelo(){
  if(!_modelo){
    _modelo=(async()=>{
      if(!window.tf) await cargarScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js");
      if(!window.mobilenet) await cargarScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js");
      return await window.mobilenet.load({version:2, alpha:1.0});
    })().catch(e=>{ _modelo=null; throw e; });
  }
  return _modelo;
}
async function huellaDeImagen(img){
  const m=await cargarModelo();
  const t=m.infer(img,true); const v=await t.data(); t.dispose();
  let n=0; for(const x of v) n+=x*x; n=Math.sqrt(n)||1;
  let mx=0; for(const x of v) mx=Math.max(mx,Math.abs(x/n));
  const q=new Int8Array(v.length); for(let i=0;i<v.length;i++) q[i]=Math.round((v[i]/n)/(mx||1)*127);
  let bin=""; for(let i=0;i<q.length;i++) bin+=String.fromCharCode(q[i]&255);
  return btoa(bin);
}
const _cacheH=new Map();
function decodHuella(b64){
  if(!b64) return null;
  if(_cacheH.has(b64)) return _cacheH.get(b64);
  try{ const s=atob(b64), a=new Int8Array(s.length); for(let i=0;i<s.length;i++) a[i]=(s.charCodeAt(i)<<24)>>24; _cacheH.set(b64,a); return a; }
  catch(e){ return null; }
}
function similitudFoto(a,b){
  const x=decodHuella(a), y=decodHuella(b); if(!x||!y||x.length!==y.length) return null;
  let d=0,nx=0,ny=0; for(let i=0;i<x.length;i++){ d+=x[i]*y[i]; nx+=x[i]*x[i]; ny+=y[i]*y[i]; }
  const cos=d/(Math.sqrt(nx*ny)||1);
  return Math.max(0, Math.min(1, (cos-0.55)/(0.92-0.55)));   // 0 = nada parecido · 1 = casi idéntico
}
async function huellaSegura(img){
  if(!CFG.COMPARAR_FOTOS) return null;
  try{ return await conLimite(huellaDeImagen(img), 30000); }
  catch(e){ console.warn("Huella no disponible:", e.message); return null; }
}

/* =====================================================================
   Almacenamiento: modo DEMO (navegador) o modo EQUIPO (Supabase)
   ===================================================================== */
const DemoStore = {
  _k:"sp_reportes_v1", _kd:"sp_descartes_v1",
  _leer(k){ try{ return JSON.parse(localStorage.getItem(k)||"[]"); }catch(e){ return []; } },
  _guardar(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){ throw new Error("El navegador no tiene espacio para guardar (modo demo). Conecta Supabase."); } },
  async iniciar(){ return {id:"demo", email:"modo demo"}; },
  async listar(){ return this._leer(this._k); },
  async crear(r){
    const arr=this._leer(this._k);
    const n=Object.assign({id:uuid(), created_at:new Date().toISOString(), created_by:"demo", estado:"activo", especie:"perro"}, r);
    arr.push(n); this._guardar(this._k,arr); return n;
  },
  async crearPublico(r){ const n=await this.crear(Object.assign({},r,{estado:"pendiente",created_by:null})); return n.id; },
  async actualizar(id,patch){
    const arr=this._leer(this._k), i=arr.findIndex(x=>x.id===id);
    if(i<0) throw new Error("No encontrado"); Object.assign(arr[i],patch); this._guardar(this._k,arr); return arr[i];
  },
  async borrar(id){ this._guardar(this._k, this._leer(this._k).filter(x=>x.id!==id)); },
  async subirFoto(blob){ return await blobADataURL(blob); },
  async borrarFoto(){},
  urlFoto(path){ return path || ""; },
  async listarDescartes(){ return this._leer(this._kd); },
  async descartar(p,v){ const d=this._leer(this._kd); d.push({perdido_id:p,visto_id:v}); this._guardar(this._kd,d); },
  async esAdmin(){ return true; },
  async esVoluntario(){ return true; },
  async leerConIA(){ throw new Error("La IA solo funciona con Supabase conectado (no en modo demo)."); },
  async avisar(){},
  async salir(){}
};

const SupaStore = {
  sb:null, user:null,
  async iniciar(){
    // En el formulario público nunca se usa la sesión de un voluntario: siempre envía como anónimo
    this.sb = PUBLICO
      ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false, storageKey:"sp-publico"}})
      : window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    if(PUBLICO) return null;
    const { data } = await this.sb.auth.getSession();
    this.user = data.session ? data.session.user : null;
    return this.user;
  },
  async entrar(email,pass){ const { data, error } = await this.sb.auth.signInWithPassword({email, password:pass}); if(error) throw error; this.user=data.user; return data.user; },
  async salir(){ await this.sb.auth.signOut(); this.user=null; },
  async listar(){ const { data, error } = await this.sb.from("sp_reportes").select("*").order("fecha_evento",{ascending:false}).limit(5000); if(error) throw error; return data; },
  async crear(r){ const { data, error } = await this.sb.from("sp_reportes").insert(r).select().single(); if(error) throw error; return data; },
  async crearPublico(r){
    const id=uuid();
    const { error } = await this.sb.from("sp_reportes").insert(Object.assign({}, r, {id, estado:"pendiente"}));   // sin .select(): el público no puede leer
    if(error) throw error; return id;
  },
  async actualizar(id,patch){ const { data, error } = await this.sb.from("sp_reportes").update(patch).eq("id",id).select().single(); if(error) throw error; return data; },
  async borrar(id){
    const { error, count } = await this.sb.from("sp_reportes").delete({count:"exact"}).eq("id",id);
    if(error) throw error; if(count===0) throw new Error("Solo quien lo creó o un administrador puede borrarlo.");
  },
  async subirFoto(blob){
    const carpeta = PUBLICO ? "publico" : this.user.id;
    const path=`${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.jpg`;
    const { error } = await this.sb.storage.from("sp-fotos").upload(path,blob,{contentType:"image/jpeg",upsert:false});
    if(error) throw error; return path;
  },
  async borrarFoto(path){ if(path && !/^(https?:|data:)/.test(path)) await this.sb.storage.from("sp-fotos").remove([path]); },
  urlFoto(path){ if(!path) return ""; if(/^(https?:|data:)/.test(path)) return path; return this.sb.storage.from("sp-fotos").getPublicUrl(path).data.publicUrl; },
  async listarDescartes(){ const { data, error } = await this.sb.from("sp_descartes").select("perdido_id,visto_id"); if(error) throw error; return data; },
  async descartar(p,v){ const { error } = await this.sb.from("sp_descartes").insert({perdido_id:p, visto_id:v}); if(error && error.code!=="23505") throw error; },
  async esAdmin(){ const { data } = await this.sb.from("sp_admins").select("user_id").eq("user_id",this.user.id).maybeSingle(); return !!data; },
  async esVoluntario(){ const { data, error } = await this.sb.rpc("sp_es_voluntario"); if(error) throw error; return data===true; },
  async leerConIA(imagen){
    const { data, error } = await this.sb.functions.invoke("sp-ia",{body:{imagen, mime:"image/jpeg", hoy:hoyISO()}});
    if(error){ let m=error.message; try{ const j=await error.context.json(); if(j && j.error) m=j.error; }catch(_){} throw new Error(m); }
    if(!data || !data.ok) throw new Error((data && data.error) || "Sin respuesta de la IA");
    return data;
  },
  async avisar(id){ try{ await this.sb.functions.invoke("sp-alertas",{body:{id}}); }catch(e){ console.warn("Alerta no enviada", e); } }
};
const Store = MODO_DEMO ? DemoStore : SupaStore;

/* =====================================================================
   Estado
   ===================================================================== */
const S = {
  reportes:[], descartes:new Set(), user:null, admin:false,
  tab:"lista", vista:"lista",          // lista | matches | revisar | form | detalle | gracias
  sel:null, editId:null, form:null, dups:[], coincid:[],
  f:{ perdido:true, visto:true, resguardo:true, reunidos:false, esp:new Set(["perro","gato"]), tam:new Set(ORDEN_TAM), periodo:"30", rangos:true, q:"" }
};
const activos = () => S.reportes.filter(r=>r.estado==="activo");
const pendientes = () => S.reportes.filter(r=>r.estado==="pendiente");

/* =====================================================================
   Coincidencias: perdido ↔ (visto | resguardo)
   ===================================================================== */
function evaluar(p,v){
  if(esp(p)!==esp(v)) return null;
  const dT=Math.abs(ORDEN_TAM.indexOf(p.tamano)-ORDEN_TAM.indexOf(v.tamano));
  if(dT>1) return null;
  const dd=(fechaLocal(v.fecha_evento)-fechaLocal(p.fecha_evento))/864e5;
  if(dd < -1 || dd > CFG.DIAS_MAX_COINCIDENCIA) return null;
  const d=distKm(p,v), lim=radioEf(p)+radioEf(v);
  if(d>lim) return null;
  const sDist=1-d/lim, sTam=dT===0?1:0.45;
  const a=tokens([p.color,p.raza,p.senas].join(" ")), b=tokens([v.color,v.raza,v.senas].join(" "));
  let sTxt=0.5;
  if(a.size && b.size){ let i=0; a.forEach(x=>{ if(b.has(x)) i++; }); sTxt=Math.min(1, i/Math.min(a.size,b.size)); }
  let fSexo=1;
  if(p.sexo && v.sexo && p.sexo!=="desconocido" && v.sexo!=="desconocido" && p.sexo!==v.sexo) fSexo=0.4;
  const sFoto=similitudFoto(p.huella, v.huella);
  const base = sFoto==null
    ? 0.45*sDist + 0.25*sTam + 0.30*sTxt
    : 0.35*sDist + 0.20*sTam + 0.20*sTxt + 0.25*sFoto;
  return {p, v, d, dd, sFoto, score:Math.round(100*base*fSexo)};
}
function calcularCoincidencias(){
  const act=activos(), P=act.filter(r=>r.tipo==="perdido"), V=act.filter(r=>r.tipo!=="perdido"), out=[];
  for(const p of P) for(const v of V){
    if(S.descartes.has(p.id+"|"+v.id)) continue;
    const m=evaluar(p,v); if(m && m.score>=25) out.push(m);
  }
  out.sort((x,y)=>(y.v.tipo==="resguardo")-(x.v.tipo==="resguardo") || y.score-x.score);
  S.coincid=out;
}
function posiblesDuplicados(F){
  return S.reportes.filter(r=> r.id!==S.editId && (r.estado==="activo"||r.estado==="pendiente") &&
    r.tipo===F.tipo && esp(r)===F.especie &&
    Math.abs(ORDEN_TAM.indexOf(r.tamano)-ORDEN_TAM.indexOf(F.tamano))<=1 &&
    distKm(r,F)<=1.5 && Math.abs((fechaLocal(r.fecha_evento)-fechaLocal(F.fecha_evento||hoyISO()))/864e5)<=21);
}

/* =====================================================================
   Mapa
   ===================================================================== */
let map, capaMarcas, capaRangos, capaMatch, pinNuevo=null, circNuevo=null;

function iniciarMapa(){
  map=L.map("map",{zoomControl:true}).setView(CFG.CENTRO, CFG.ZOOM);
  // Mapas gratuitos sin clave (OpenStreetMap)
  const osm=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  const hot=L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",{maxZoom:19, subdomains:"abc",
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, estilo HOT'});
  L.control.layers({"OpenStreetMap":osm,"Humanitario (más claro)":hot},null,{position:"topright"}).addTo(map);
  L.control.scale({imperial:false}).addTo(map);
  capaRangos=L.layerGroup().addTo(map); capaMatch=L.layerGroup().addTo(map); capaMarcas=L.layerGroup().addTo(map);
  map.on("click", e=>{ if(S.vista==="form"){ if(S.form) S.form.pinAuto=false; moverPin(e.latlng); } });
}
function emoji(r){
  if(r.estado==="reunido"||r.estado==="cerrado") return "🏠";
  if(r.tipo==="perdido") return ESPECIES[esp(r)].em;
  if(r.tipo==="resguardo") return "🤲";
  return "👀";
}
function claseEstado(r){ return (r.estado==="reunido"||r.estado==="cerrado") ? "reunido" : r.tipo; }
function icono(r, sel){
  return L.divIcon({className:"", html:`<div class="pin ${claseEstado(r)}${sel?" sel":""}"><span>${emoji(r)}</span></div>`, iconSize:[34,34], iconAnchor:[17,34]});
}
function filtrados(){
  const f=S.f, lim = f.periodo==="todo" ? Infinity : Number(f.periodo), q=f.q.trim().toLowerCase();
  return S.reportes.filter(r=>{
    if(r.estado==="pendiente") return false;
    if(r.estado!=="activo" && !f.reunidos) return false;
    if(r.estado==="activo" && !f[r.tipo]) return false;
    if(!f.esp.has(esp(r))) return false;
    if(!f.tam.has(r.tamano)) return false;
    if(diasDesde(r.fecha_evento)>lim) return false;
    if(q){ const t=[r.nombre_perro,r.raza,r.color,r.senas,r.zona,r.contacto_nombre].join(" ").toLowerCase(); if(!t.includes(q)) return false; }
    return true;
  });
}
function etiqueta(r){
  const t = r.estado!=="activo" ? "Reunido" : TIPOS[r.tipo].label;
  return `${t} · ${ESPECIES[esp(r)].label} ${tamLabel(r).toLowerCase()}${r.nombre_perro?" · "+r.nombre_perro:""}`;
}
const COLORES = {perdido:"#d93a2b", visto:"#2f6fb5", resguardo:"#7b4bb7"};
function pintarMapa(){
  capaMarcas.clearLayers(); capaRangos.clearLayers();
  if(PUBLICO) return;
  for(const r of filtrados()){
    const m=L.marker([r.lat,r.lng],{icon:icono(r, S.sel===r.id), title:etiqueta(r)});
    m.on("click",()=>abrirDetalle(r.id));
    m.bindTooltip(etiqueta(r),{direction:"top",offset:[0,-30]});
    m.addTo(capaMarcas);
    if(S.f.rangos && r.estado==="activo"){
      const col=COLORES[r.tipo];
      L.circle([r.lat,r.lng],{radius:radioEf(r)*1000, color:col, weight:1, opacity:.5, fillColor:col, fillOpacity:.07, interactive:false}).addTo(capaRangos);
    }
  }
}

/* ---------- Pin para nuevo reporte ---------- */
function ponerPin(latlng){
  quitarPin();
  pinNuevo=L.marker(latlng,{draggable:true, zIndexOffset:1000,
    icon:L.divIcon({className:"",html:'<div class="pin nuevo"><span>🐾</span></div>',iconSize:[40,40],iconAnchor:[20,40]})}).addTo(map);
  circNuevo=L.circle(latlng,{radius:(S.form?.radio_km||2)*1000,color:"#c8893f",weight:2,dashArray:"6 6",fillColor:"#c8893f",fillOpacity:.12,interactive:false}).addTo(map);
  pinNuevo.on("drag",e=>circNuevo.setLatLng(e.target.getLatLng()));
  pinNuevo.on("dragend",e=>{ if(S.form) S.form.pinAuto=false; fijarUbicacion(e.target.getLatLng()); });
  fijarUbicacion(latlng);
}
function moverPin(latlng){ if(!pinNuevo) return ponerPin(latlng); pinNuevo.setLatLng(latlng); circNuevo.setLatLng(latlng); fijarUbicacion(latlng); }
function quitarPin(){ if(pinNuevo){ map.removeLayer(pinNuevo); pinNuevo=null; } if(circNuevo){ map.removeLayer(circNuevo); circNuevo=null; } }
let geoT;
function fijarUbicacion(ll){
  if(!S.form) return;
  S.form.lat=+ll.lat.toFixed(6); S.form.lng=+ll.lng.toFixed(6); S.form.ubicada=true;
  const c=$("#fCoords"); if(c) c.textContent=`📍 ${S.form.lat}, ${S.form.lng}`;
  clearTimeout(geoT); geoT=setTimeout(()=>zonaInversa(S.form?.lat,S.form?.lng),700);
}
async function zonaInversa(lat,lng){
  if(lat==null) return;
  try{
    const j=await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&accept-language=es`)).json();
    const a=j.address||{};
    const zona=[a.neighbourhood||a.suburb||a.quarter||a.residential||a.hamlet||a.village, a.city||a.town||a.municipality].filter(Boolean).join(", ");
    if(!S.form || S.form.zonaManual || !zona) return;
    S.form.zona=zona; const inp=$("#fZona"); if(inp) inp.value=zona;
  }catch(e){ /* sin geocodificador: se escribe a mano */ }
}
async function buscarDireccion(){
  const q=$("#qDir").value.trim(); if(!q) return;
  const [o,n,e,s]=CFG.CAJA_BUSQUEDA, box=$("#resultados");
  try{
    const arr=await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=mx&accept-language=es&viewbox=${o},${n},${e},${s}&bounded=1&q=${encodeURIComponent(q)}`)).json();
    if(!arr.length){ box.innerHTML='<div>Sin resultados. Prueba otra referencia o toca el mapa.</div>'; box.style.display="block"; return; }
    box.innerHTML=arr.map((r,i)=>`<div data-i="${i}">${esc(r.display_name)}</div>`).join(""); box.style.display="block";
    box.querySelectorAll("[data-i]").forEach(el=>el.onclick=()=>{ const r=arr[+el.dataset.i], ll=L.latLng(+r.lat,+r.lon); map.setView(ll,16); if(S.form) S.form.pinAuto=false; moverPin(ll); box.style.display="none"; });
  }catch(err){ box.innerHTML='<div>No se pudo buscar ahora. Toca el mapa para marcar.</div>'; box.style.display="block"; }
}
function miUbicacion(){
  if(!navigator.geolocation) return toast("Tu navegador no permite ubicación");
  navigator.geolocation.getCurrentPosition(
    p=>{ const ll=L.latLng(p.coords.latitude,p.coords.longitude); map.setView(ll,16); if(S.vista==="form"){ if(S.form) S.form.pinAuto=false; moverPin(ll); } },
    ()=>toast("No se pudo obtener tu ubicación"), {enableHighAccuracy:true,timeout:10000});
}

/* =====================================================================
   Vistas
   ===================================================================== */
function render(){
  if(!PUBLICO){
    calcularCoincidencias();
    const lista=filtrados(), np=pendientes().length;
    $("#nLista").textContent=lista.length; $("#nMatch").textContent=S.coincid.length; $("#nRev").textContent=np;
    $("#tabRev").style.display = (np || S.tab==="revisar") ? "" : "none";
    document.querySelectorAll("#tabs button").forEach(b=>b.classList.toggle("activo", b.dataset.tab===S.tab && ["lista","matches","revisar"].includes(S.vista)));
  }
  $("#barraPick").style.display = S.vista==="form" ? "flex" : "none";
  if(S.vista!=="form") $("#resultados").style.display="none";
  pintarMapa();
  const v=$("#vista");
  v.innerHTML = ({lista:()=>vistaLista(filtrados()), matches:vistaMatches, revisar:vistaRevisar, detalle:vistaDetalle, form:vistaForm, gracias:vistaGracias})[S.vista]();
  enlazar();
}
function fotoMini(r){
  const u=Store.urlFoto(r.foto_path);
  return u ? `<img class="foto" src="${esc(u)}" alt="" loading="lazy">` : `<div class="foto">${emoji(r)}</div>`;
}
function badges(r){
  const t = r.estado==="pendiente" ? `<span class="badge b-pendiente">Por revisar</span>` :
            r.estado!=="activo" ? `<span class="badge b-reunido">Reunido</span>` :
            `<span class="badge b-${r.tipo}">${TIPOS[r.tipo].label}</span>`;
  return `${t} <span class="badge b-esp">${ESPECIES[esp(r)].em} ${ESPECIES[esp(r)].label}</span> <span class="badge b-tam">${esc(tamLabel(r))}</span>`;
}
function tarjeta(r){
  return `<div class="tarjeta" data-id="${esc(r.id)}">${fotoMini(r)}
    <div class="info"><div class="t1">${badges(r)}</div>
      <div class="t2"><b>${esc(r.nombre_perro||"")}</b> ${esc([r.raza,r.color].filter(Boolean).join(" · ")||"Sin descripción")}</div>
      <div class="t2">📍 ${esc(r.zona||"Sin zona")} · ${haceTexto(r.fecha_evento)}</div></div></div>`;
}
function vistaLista(lista){
  const f=S.f, ch=(k,txt,cls)=>`<button class="chip ${cls||""} ${f[k]?"on":""}" data-f="${k}">${txt}</button>`;
  let h="";
  if(MODO_DEMO) h+=`<div class="aviso"><b>Modo demo:</b> los datos se guardan solo en este navegador. Para trabajar en equipo conecta Supabase (ver LEEME). ${S.reportes.length?"":'<br><button class="btn chico" id="btnEjemplos" style="margin-top:6px">Cargar ejemplos de prueba</button>'}</div>`;
  h+=`<input class="buscar" id="q" placeholder="Buscar por nombre, color, raza, colonia…" value="${esc(f.q)}">`;
  h+=`<div class="filtros">${ch("perdido","Perdidos","perdido")}${ch("visto","👀 Vistos","visto")}${ch("resguardo","🤲 En resguardo","resguardo")}${ch("reunidos","🏠 Reunidos","reunido")}</div>`;
  h+=`<div class="filtros">${Object.keys(ESPECIES).map(e=>`<button class="chip ${f.esp.has(e)?"on":""}" data-esp="${e}">${ESPECIES[e].em} ${ESPECIES[e].label}s</button>`).join("")}
      ${ORDEN_TAM.map(t=>`<button class="chip ${f.tam.has(t)?"on":""}" data-tam="${t}">${TAM.perro[t].label}</button>`).join("")}</div>`;
  h+=`<div class="filtros" style="align-items:center"><select class="mini" id="periodo">
        ${[["7","Últimos 7 días"],["30","Últimos 30 días"],["90","Últimos 90 días"],["todo","Todo"]].map(([v,t])=>`<option value="${v}" ${f.periodo===v?"selected":""}>${t}</option>`).join("")}
      </select>${ch("rangos","◎ Rangos")}</div>`;
  if(!lista.length) return h+`<div class="vacio"><img src="logo.jpg" alt=""><p>${S.reportes.length?"Nada con estos filtros.":"Aún no hay reportes. Toca <b>+ Reportar</b> para crear el primero."}</p></div>`;
  return h+lista.slice().sort((a,b)=>(b.fecha_evento||"").localeCompare(a.fecha_evento||"")||(b.created_at||"").localeCompare(a.created_at||"")).map(tarjeta).join("");
}
function ladoMatch(r){
  const u=Store.urlFoto(r.foto_path);
  return `<div class="lado" data-id="${esc(r.id)}">
    ${u?`<img src="${esc(u)}" alt="" loading="lazy">`:`<div class="sinfoto">${emoji(r)}</div>`}
    <div style="margin-top:5px">${badges(r)}</div>
    <div class="t2">${esc([r.nombre_perro,r.raza,r.color].filter(Boolean).join(" · ")||"Sin descripción")}</div>
    <div class="t2">📍 ${esc(r.zona||"")} · ${fmtFecha(r.fecha_evento)}</div></div>`;
}
function tarjetaMatch(m){
  const n=Math.round(m.dd), cuando = n<=0 ? "el mismo día" : `${n} día${n===1?"":"s"} después`;
  const verbo = m.v.tipo==="resguardo" ? "encontrado" : "visto";
  return `<div class="match">
    <div class="par">${ladoMatch(m.p)}${ladoMatch(m.v)}</div>
    <div class="score"><b>${m.score}%</b><div class="barra"><i style="width:${m.score}%"></i></div></div>
    <div class="ayuda">A ${fmtKm(m.d)} · ${verbo} ${cuando}</div>
    ${m.sFoto!=null?`<div class="fotoSim">📷 Parecido de fotos (IA): ${Math.round(m.sFoto*100)}%</div>`:""}
    <div class="acciones"><button class="btn chico azul" data-vermatch="${esc(m.p.id)}|${esc(m.v.id)}">Ver en mapa</button>
    <button class="btn chico borde" data-descartar="${esc(m.p.id)}|${esc(m.v.id)}">No es el mismo</button></div></div>`;
}
function vistaMatches(){
  let h=`<p class="ayuda" style="margin:0 0 12px">Se comparan <b>perdidos</b> con <b>vistos</b> y <b>en resguardo</b> de la misma especie cuyos rangos se tocan, con tamaño parecido y fechas compatibles. Primero aparecen los que alguien ya tiene resguardados. <b>Siempre confirma con fotos y con la familia.</b></p>`;
  const sinH=activos().filter(r=>r.foto_path && !r.huella).length;
  if(CFG.COMPARAR_FOTOS && sinH) h+=`<div class="aviso">${sinH} foto${sinH>1?"s":""} sin analizar. <button class="btn chico" id="btnHuellas">📷 Analizar fotos con IA</button></div>`;
  if(!S.coincid.length) return h+`<div class="vacio"><img src="logo.jpg" alt=""><p>Sin coincidencias por ahora.</p></div>`;
  return h+S.coincid.map(tarjetaMatch).join("");
}
function vistaRevisar(){
  const p=pendientes();
  let h=`<p class="ayuda" style="margin:0 0 12px">Reportes enviados por el público con el formulario <b>reportar.html</b>. No aparecen en el mapa hasta que un voluntario los aprueba. Revisa que tengan sentido y que no estén repetidos.</p>`;
  if(!p.length) return h+`<div class="vacio"><img src="logo.jpg" alt=""><p>Nada pendiente por revisar. 🎉</p></div>`;
  return h+p.sort((a,b)=>(a.created_at||"").localeCompare(b.created_at||"")).map(tarjeta).join("");
}
function vistaDetalle(){
  const r=S.reportes.find(x=>x.id===S.sel);
  if(!r) return `<button class="volver" data-volver>← Volver</button><p>Reporte no encontrado.</p>`;
  const u=Store.urlFoto(r.foto_path), tel=telWa(r.contacto_telefono);
  const msg=encodeURIComponent(`Hola, te escribo por ${r.nombre_perro||"el "+ESPECIES[esp(r)].label.toLowerCase()} que reportaste (Sherlock Paws).`);
  const propios=S.coincid.filter(m=>m.p.id===r.id||m.v.id===r.id);
  const puedeBorrar = S.admin || (S.user && r.created_by===S.user.id);
  const titulo = r.nombre_perro || `${ESPECIES[esp(r)].label} ${TIPOS[r.tipo].label.toLowerCase()}`;
  const etiqContacto = {perdido:"Contacto de la familia", visto:"Quién lo reportó", resguardo:"Quién lo tiene en resguardo"}[r.tipo];
  let h=`<div class="detalle"><button class="volver" data-volver>← Volver</button>`;
  if(r.estado==="pendiente") h+=`<div class="revision"><b>Reporte del público pendiente de revisión.</b> Revisa los datos (puedes editarlos) y apruébalo para que aparezca en el mapa.
      <div class="acciones"><button class="btn chico verde" data-aprobar>✅ Aprobar</button><button class="btn chico rojo" data-rechazar>Rechazar y borrar</button></div></div>`;
  h+= u ? `<img class="fotoGrande" src="${esc(u)}" alt="Foto">` : "";
  h+=`<div>${badges(r)}</div><h2 style="margin-top:8px">${esc(titulo)}</h2>
    <dl class="datos">
      <dt>Fecha</dt><dd>${fmtFecha(r.fecha_evento)} (${haceTexto(r.fecha_evento)})</dd>
      <dt>Zona</dt><dd>${esc(r.zona||"—")}</dd>
      <dt>Raza</dt><dd>${esc(r.raza||"—")}</dd>
      <dt>Color</dt><dd>${esc(r.color||"—")}</dd>
      <dt>Sexo</dt><dd>${esc({macho:"Macho",hembra:"Hembra"}[r.sexo]||"No se sabe")}</dd>
      <dt>Señas</dt><dd>${esc(r.senas||"—")}</dd>
      <dt>Rango</dt><dd>${r.tipo==="resguardo"?fmtKm(Number(r.radio_km)):`${fmtKm(Number(r.radio_km))} inicial → hoy ${fmtKm(radioEf(r))}`}</dd>
      <dt>Foto IA</dt><dd>${r.huella?"✅ analizada":(r.foto_path?"pendiente":"sin foto")}</dd>
    </dl>`;
  if(r.contacto_nombre || r.contacto_telefono || r.contacto_notas){
    h+=`<div class="contacto"><b>${etiqContacto}</b><br>${esc(r.contacto_nombre||"")} ${r.contacto_telefono?`· <b>${esc(r.contacto_telefono)}</b>`:""}
        ${r.contacto_notas?`<div class="ayuda">${esc(r.contacto_notas)}</div>`:""}
        <div class="acciones">${tel?`<a class="btn verde chico" href="https://wa.me/${tel}?text=${msg}" target="_blank" rel="noopener">WhatsApp</a><a class="btn borde chico" href="tel:+${tel}">Llamar</a>`:""}</div></div>`;
  }
  if(r.fuente_url && /^https?:\/\//i.test(r.fuente_url)) h+=`<p><a href="${esc(r.fuente_url)}" target="_blank" rel="noopener">🔗 Ver publicación original</a></p>`;
  h+=`<p><a href="https://www.google.com/maps?q=${r.lat},${r.lng}" target="_blank" rel="noopener">🗺️ Abrir en Google Maps</a></p>
    <div class="acciones"><button class="btn chico" data-copiar>📋 Copiar ficha para compartir</button><button class="btn chico" data-editar>✏️ Editar</button></div>`;
  if(r.estado!=="pendiente"){
    h+=`<div class="acciones">${r.estado==="activo"
        ? `<button class="btn chico verde" data-estado="reunido">🏠 ${r.tipo==="perdido"?"¡Ya regresó a casa!":"Ya está con su familia / adoptado"}</button>`
        : `<button class="btn chico borde" data-estado="activo">Reabrir reporte</button>`}
      ${r.tipo==="visto"&&r.estado==="activo"?`<button class="btn chico" data-resguardar>🤲 Alguien ya lo resguardó</button>`:""}
      ${puedeBorrar?`<button class="btn chico rojo" data-borrar>Eliminar</button>`:""}</div>`;
  }
  if(r.estado==="activo"){
    h+=`<h3 style="color:var(--cafe);margin:18px 0 8px">Posibles coincidencias (${propios.length})</h3>`;
    h+= propios.length ? propios.map(tarjetaMatch).join("") : `<p class="ayuda">Ninguna por ahora. Se recalcula con cada nuevo reporte.</p>`;
  }
  h+=`<p class="ayuda" style="margin-top:14px">Registrado ${r.created_at?new Date(r.created_at).toLocaleString("es-MX"):""}${r.created_by?"":" · enviado por el público"}</p></div>`;
  return h;
}
function vistaForm(){
  const F=S.form, e=F.especie;
  const btnTam=k=>`<button type="button" class="${F.tamano===k?"on":""}" data-tamano="${k}"><b>${TAM[e][k].label}</b><small>${TAM[e][k].desc}</small></button>`;
  const contactoObligatorio = F.tipo!=="visto";
  const tituloContacto = {perdido:"Contacto de la familia (obligatorio)", visto:"Quién lo vio (opcional)", resguardo:"Quién lo tiene en resguardo (obligatorio)"}[F.tipo];
  const pregunta = {perdido:"¿Dónde se perdió?", visto:"¿Dónde lo viste?", resguardo:"¿Dónde lo encontraron?"}[F.tipo];
  let dups="";
  if(S.dups.length) dups=`<div class="dups" id="cajaDups"><b>⚠️ Puede que ya esté registrado:</b>
      <p class="ayuda">Mismo tipo, especie y tamaño parecido a menos de 1.5 km. Si es el mismo, ábrelo y edítalo en vez de duplicarlo.</p>
      ${S.dups.map(tarjeta).join("")}
      <button type="button" class="btn chico primario" data-dupok>Es otro, guardar de todos modos</button></div>`;
  return `<form class="form" id="formRep" autocomplete="off">
    ${PUBLICO?"":`<button type="button" class="volver" data-cancelar>← Cancelar</button>`}
    <h2>${S.editId?"Editar reporte":(PUBLICO?"Reportar un perrito o gatito":"Nuevo reporte")}</h2>
    ${PUBLICO?`<p class="ayuda" style="margin:-4px 0 12px">Un voluntario revisará tu reporte antes de publicarlo en el mapa. ¡Gracias por ayudar!</p>`:""}
    ${puedeCapturas()?`<div class="captura">
      <b>📸 Sube la publicación o el póster</b> (captura de Facebook, foto del cartel…). ${puedeIA()?"La IA lee todo, llena los datos y ubica el pin;":"Leo los datos y ubico el pin;"} tú solo confirmas el recorte del animal.
      <div class="acciones"><label class="btn chico primario">${F.capturaArchivo?"Subir otra imagen":"📸 Subir imagen"}<input type="file" id="fCaptura" accept="image/*" hidden></label>
        ${F.capturaArchivo ? `<button type="button" class="btn chico" data-recortar>✂️ ${F.fotoArchivo?"Cambiar recorte":"Recortar foto"}</button>`:""}
        ${F.capturaArchivo && puedeIA() && F.analisis!=="ia" ? `<button type="button" class="btn chico ia" data-ia>✨ Analizar con IA</button>`:""}</div>
      ${F.ocrTexto && F.analisis==="lectura"?`<details><summary>Texto leído de la imagen</summary><pre>${esc(F.ocrTexto)}</pre></details>`:""}
    </div>`:""}
    <div class="campo"><div class="seg">
      ${Object.keys(ESPECIES).map(k=>`<button type="button" class="esp ${e===k?"on":""}" data-especie="${k}">${ESPECIES[k].em} ${ESPECIES[k].label}</button>`).join("")}
    </div></div>
    <div class="campo"><div class="seg tres">
      <button type="button" class="perdido ${F.tipo==="perdido"?"on":""}" data-tipo="perdido">${ESPECIES[e].em} Se perdió</button>
      <button type="button" class="visto ${F.tipo==="visto"?"on":""}" data-tipo="visto">👀 Lo vi</button>
      <button type="button" class="resguardo ${F.tipo==="resguardo"?"on":""}" data-tipo="resguardo">🤲 Lo tengo / resguardado</button>
    </div></div>
    <div class="campo"><label>${pregunta}</label>
      <div class="ubic">Toca el mapa o arrastra el pin 🐾. También puedes buscar una dirección arriba del mapa o usar 📍.
        <div class="coords" id="fCoords">${F.ubicada?`📍 ${F.lat}, ${F.lng}`:"Aún sin ubicación"}</div></div></div>
    <div class="campo"><label for="fZona">Colonia / referencia</label><input type="text" id="fZona" maxlength="200" value="${esc(F.zona||"")}" placeholder="ej. Juriquilla, cerca del parque"></div>
    <div class="campo"><label>Tamaño</label><div class="tams">${ORDEN_TAM.map(btnTam).join("")}</div></div>
    ${PUBLICO?"":`<div class="campo"><label>Rango de búsqueda</label>
      <div class="rango"><input type="range" id="fRadio" min="0.1" max="15" step="0.1" value="${F.radio_km}"><output id="oRadio">${fmtKm(Number(F.radio_km))}</output></div>
      <p class="ayuda">${F.tipo==="resguardo"?"Para animales resguardados el rango no crece: indica la zona donde lo encontraron.":`Sugerido según especie y tamaño; ajústalo si es muy miedoso, muy andariego, etc. Crece ${Math.round(CFG.CRECIMIENTO_DIARIO*100)}% cada día (hasta ${CFG.FACTOR_MAXIMO}×).`}</p></div>`}
    <div class="campo"><label for="fFecha">Fecha</label><input type="date" id="fFecha" value="${esc(F.fecha_evento)}" max="${hoyISO()}"></div>
    <div class="campo"><label>Foto ${F.capturaArchivo?"(recorte de la imagen que subiste)":""}</label>
      <img class="fotoPrev" id="fPrev" alt="">
      ${F.capturaArchivo
        ? `<p class="ayuda">${F.fotoArchivo?(F.cajaIA?"La IA eligió esta foto; es la que se publicará.":"Esta es la foto que se publicará."):"Aún no hay recorte."} Usa <b>✂️ ${F.fotoArchivo?"Cambiar recorte":"Recortar foto"}</b> arriba para ajustarla.</p>`
        : `<input type="file" id="fFoto" accept="image/*"><p class="ayuda">Una foto clara del animal ayuda muchísimo.</p>`}</div>
    ${F.tipo==="perdido"?`<div class="campo"><label for="fNombre">Nombre</label><input type="text" id="fNombre" maxlength="80" value="${esc(F.nombre_perro||"")}"></div>`:""}
    <div class="campo"><label for="fRaza">Raza o tipo</label><input type="text" id="fRaza" maxlength="80" list="razas" value="${esc(F.raza||"")}">
      <datalist id="razas">${RAZAS[e].map(x=>`<option value="${esc(x)}">`).join("")}</datalist></div>
    <div class="campo"><label for="fColor">Color(es)</label><input type="text" id="fColor" maxlength="120" value="${esc(F.color||"")}" placeholder="ej. negro con café, pecho blanco"></div>
    <div class="campo"><label for="fSexo">Sexo</label><select id="fSexo">${[["desconocido","No se sabe"],["macho","Macho"],["hembra","Hembra"]].map(([v,t])=>`<option value="${v}" ${F.sexo===v?"selected":""}>${t}</option>`).join("")}</select></div>
    <div class="campo"><label for="fSenas">Señas particulares</label><textarea id="fSenas" maxlength="1000" placeholder="collar rojo, placa, cojea, oreja caída, muy asustadizo…">${esc(F.senas||"")}</textarea></div>
    <div class="grupo"><h3>${tituloContacto}</h3>
      <div class="campo"><label for="fCNombre">Nombre</label><input type="text" id="fCNombre" maxlength="80" value="${esc(F.contacto_nombre||"")}"></div>
      <div class="campo"><label for="fCTel">Teléfono / WhatsApp</label><input type="tel" id="fCTel" maxlength="20" value="${esc(F.contacto_telefono||"")}" placeholder="10 dígitos"${contactoObligatorio?" required":""}></div>
      <div class="campo"><label for="fCNotas">Notas de contacto</label><input type="text" id="fCNotas" maxlength="200" value="${esc(F.contacto_notas||"")}" placeholder="horario, recompensa, etc."></div>
    </div>
    <div class="campo"><label for="fFuente">Liga de la publicación (Facebook, grupo, etc.)</label><input type="url" id="fFuente" maxlength="500" value="${esc(F.fuente_url||"")}" placeholder="https://facebook.com/…"></div>
    ${PUBLICO?`<div class="campo oculto" aria-hidden="true"><label>Sitio web</label><input type="text" id="fWeb" tabindex="-1" autocomplete="off"></div>
      <div class="campo"><label class="consent"><input type="checkbox" id="fConsent" ${F.consent?"checked":""}> <span>Acepto que los voluntarios de Sherlock Paws vean estos datos de contacto para ayudar a reunir al animal con su familia.</span></label></div>`:""}
    ${dups}
    <div class="acciones"><button type="submit" class="btn primario">${S.editId?"Guardar cambios":(PUBLICO?"Enviar reporte":"Guardar reporte")}</button></div>
  </form>`;
}
function vistaGracias(){
  return `<div class="gracias"><img src="logo.jpg" alt=""><h2 style="color:var(--cafe)">¡Gracias! 🐾</h2>
    <p>Recibimos tu reporte. Un voluntario lo revisará y, si encontramos una coincidencia, te contactaremos.</p>
    <button class="btn primario" data-otro>Hacer otro reporte</button></div>`;
}

/* =====================================================================
   Eventos
   ===================================================================== */
function enlazar(){
  const v=$("#vista"), on=(sel,fn)=>v.querySelectorAll(sel).forEach(el=>el.onclick=e=>fn(el,e));
  on("[data-f]", b=>{ S.f[b.dataset.f]=!S.f[b.dataset.f]; render(); });
  on("[data-tam]", b=>{ const t=b.dataset.tam; S.f.tam.has(t)?S.f.tam.delete(t):S.f.tam.add(t); render(); });
  on("[data-esp]", b=>{ const t=b.dataset.esp; S.f.esp.has(t)?S.f.esp.delete(t):S.f.esp.add(t); render(); });
  const per=$("#periodo"); if(per) per.onchange=()=>{ S.f.periodo=per.value; render(); };
  const q=$("#q"); if(q) q.oninput=()=>{ S.f.q=q.value; const pos=q.selectionStart; render(); const nq=$("#q"); nq.focus(); nq.setSelectionRange(pos,pos); };
  const ej=$("#btnEjemplos"); if(ej) ej.onclick=cargarEjemplos;
  const bh=$("#btnHuellas"); if(bh) bh.onclick=analizarFotosPendientes;
  on(".tarjeta[data-id], .lado[data-id]", el=>{ if(S.vista==="form"){ cerrarForm(); } abrirDetalle(el.dataset.id); });
  on("[data-volver]", ()=>{ S.sel=null; capaMatch.clearLayers(); S.vista=S.tab; limpiarHash(); render(); });
  on("[data-vermatch]", (b,e)=>{ e.stopPropagation(); const [p,vv]=b.dataset.vermatch.split("|"); verMatch(p,vv); });
  on("[data-descartar]", async (b,e)=>{ e.stopPropagation(); const [p,vv]=b.dataset.descartar.split("|");
    try{ await Store.descartar(p,vv); S.descartes.add(p+"|"+vv); capaMatch.clearLayers(); render(); toast("Coincidencia descartada"); }catch(err){ toast("Error: "+err.message); } });
  on("[data-copiar]", async ()=>{ const r=S.reportes.find(x=>x.id===S.sel); toast(await copiar(ficha(r))?"Ficha copiada: pégala en Facebook o WhatsApp":"No se pudo copiar"); });
  on("[data-editar]", ()=>abrirForm(S.sel));
  on("[data-estado]", b=>cambiar(S.sel,{estado:b.dataset.estado}, b.dataset.estado==="reunido"?"¡Qué alegría! Marcado como reunido 🏠":"Reporte reabierto"));
  on("[data-resguardar]", ()=>abrirForm(S.sel, {tipo:"resguardo"}));
  on("[data-borrar]", b=>confirmar(b, ()=>borrar(S.sel)));
  on("[data-aprobar]", ()=>aprobar(S.sel));
  on("[data-rechazar]", b=>confirmar(b, ()=>rechazar(S.sel)));
  on("[data-otro]", ()=>abrirForm(null));
  if(S.vista==="form") enlazarForm();
}
function enlazarForm(){
  const F=S.form, v=$("#vista");
  const c=v.querySelector("[data-cancelar]"); if(c) c.onclick=()=>cerrarForm();
  v.querySelectorAll("[data-especie]").forEach(b=>b.onclick=()=>{ leerForm(); F.especie=b.dataset.especie; if(!F.radioTocado) F.radio_km=radioSugerido(F.especie,F.tamano); actualizarCirculo(); S.dups=[]; render(); });
  v.querySelectorAll("[data-tipo]").forEach(b=>b.onclick=()=>{ leerForm(); F.tipo=b.dataset.tipo; S.dups=[]; render(); });
  v.querySelectorAll("[data-tamano]").forEach(b=>b.onclick=()=>{ leerForm(); F.tamano=b.dataset.tamano; if(!F.radioTocado) F.radio_km=radioSugerido(F.especie,F.tamano); actualizarCirculo(); render(); });
  const rad=$("#fRadio");
  if(rad) rad.oninput=()=>{ F.radio_km=Number(rad.value); F.radioTocado=true; $("#oRadio").textContent=fmtKm(F.radio_km); actualizarCirculo(); };
  $("#fZona").oninput=()=>{ F.zonaManual=true; };
  const foto=$("#fFoto"), prev=$("#fPrev");
  if(F.fotoArchivo || F.foto_path){ prev.src = F.fotoArchivo ? URL.createObjectURL(F.fotoArchivo) : Store.urlFoto(F.foto_path); prev.style.display="block"; }
  if(foto) foto.onchange=()=>{ const f=foto.files[0]; if(!f) return; F.fotoArchivo=f; F.fotoPropia=true; prev.src=URL.createObjectURL(f); prev.style.display="block"; };
  const dok=v.querySelector("[data-dupok]"); if(dok) dok.onclick=()=>{ F.dupOk=true; guardar(); };
  const cap=$("#fCaptura"); if(cap) cap.onchange=()=>{ const f=cap.files[0]; if(f) procesarCaptura(f); };
  const bia=v.querySelector("[data-ia]"); if(bia) bia.onclick=()=>reanalizarConIA();
  const brc=v.querySelector("[data-recortar]"); if(brc) brc.onclick=async()=>{ leerForm(); await recortarDesdeCaptura(true); };
  $("#formRep").onsubmit=e=>{ e.preventDefault(); guardar(); };
}
function actualizarCirculo(){ if(circNuevo && S.form) circNuevo.setRadius(Number(S.form.radio_km)*1000); }
function leerForm(){
  const F=S.form, val=id=>{ const el=$(id); return el?el.value.trim():undefined; };
  const m={zona:"#fZona",fecha_evento:"#fFecha",nombre_perro:"#fNombre",raza:"#fRaza",color:"#fColor",sexo:"#fSexo",senas:"#fSenas",contacto_nombre:"#fCNombre",contacto_telefono:"#fCTel",contacto_notas:"#fCNotas",fuente_url:"#fFuente",web:"#fWeb"};
  for(const k in m){ const x=val(m[k]); if(x!==undefined) F[k]=x; }
  const cs=$("#fConsent"); if(cs) F.consent=cs.checked;
}
function abrirForm(id, extra){
  const base = id ? S.reportes.find(r=>r.id===id) : null;
  S.editId = id || null; S.dups=[];
  S.form = base ? Object.assign({}, base, {especie:esp(base), radioTocado:true, zonaManual:!!base.zona, ubicada:true}, extra||{}) : {
    especie:"perro", tipo:"perdido", tamano:"mediano", radio_km:radioSugerido("perro","mediano"), fecha_evento:hoyISO(), sexo:"desconocido", lat:null, lng:null
  };
  S.vista="form"; if(capaMatch) capaMatch.clearLayers();
  panelEstado("mid"); render();
  const ll = base ? L.latLng(base.lat,base.lng) : map.getCenter();
  if(base){ ponerPin(ll); map.setView(ll, Math.max(map.getZoom(),14)); }
  else { ponerPin(ll); clearTimeout(geoT); S.form.ubicada=false; const c=$("#fCoords"); if(c) c.textContent="Mueve el pin al lugar exacto 👆"; }
}
function cerrarForm(){ quitarPin(); S.form=null; S.editId=null; S.dups=[]; S.vista = S.sel ? "detalle" : S.tab; render(); }

/* ---------- Capturas de Facebook ---------- */
function puedeCapturas(){ return !PUBLICO && !!window.SP_Captura && (CFG.CAPTURAS_PARA!=="admins" || S.admin); }
const TIPOS_GENERICOS=/^(city|town|state|country|county|municipality|administrative|region|province)$/;
function dentroDeCaja(lat,lng){ const [o,n,e,s]=CFG.CAJA_BUSQUEDA; return lng>=o && lng<=e && lat>=s && lat<=n; }
async function geoNominatim(q){
  const [o,n,e,s]=CFG.CAJA_BUSQUEDA;
  try{
    const arr=await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=mx&accept-language=es&viewbox=${o},${n},${e},${s}&bounded=1&q=${encodeURIComponent(q)}`)).json();
    const r=(arr||[]).find(x=>!TIPOS_GENERICOS.test(x.addresstype||x.type||""));
    return r ? L.latLng(+r.lat,+r.lon) : null;
  }catch(err){ return null; }
}
async function geoPhoton(q){
  const [o,n,e,s]=CFG.CAJA_BUSQUEDA, c=CFG.CENTRO;
  try{
    const j=await (await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lat=${c[0]}&lon=${c[1]}&bbox=${o},${s},${e},${n}`)).json();
    const f=(j.features||[]).find(x=>{ const [lng,lat]=x.geometry.coordinates; return dentroDeCaja(lat,lng) && !TIPOS_GENERICOS.test((x.properties||{}).type||""); });
    return f ? L.latLng(f.geometry.coordinates[1], f.geometry.coordinates[0]) : null;
  }catch(err){ return null; }
}
async function geocodificar(q){ return (await geoNominatim(q)) || (await geoPhoton(q)); }
// Intenta varias combinaciones con dos buscadores gratuitos. Regresa {ll, como} o null.
async function ubicarDireccion({calle, colonia, municipio, lat, lng}){
  const mun=municipio||CFG.CIUDAD, consultas=[];
  if(calle && colonia) consultas.push(`${calle}, ${colonia}, ${mun}`);
  if(colonia){ consultas.push(`${colonia}, ${mun}`); consultas.push(`${colonia}, ${CFG.CIUDAD}`); consultas.push(`Fraccionamiento ${colonia}, ${mun}`); }
  if(calle) consultas.push(`${calle}, ${mun}`);
  for(const q of [...new Set(consultas)]){ const ll=await geocodificar(q); if(ll) return {ll, como:"buscador"}; }
  if(typeof lat==="number" && typeof lng==="number" && dentroDeCaja(lat,lng)) return {ll:L.latLng(lat,lng), como:"ia"};
  return null;
}
// Coloca el pin (o deja la búsqueda lista para que el voluntario elija)
async function ponerPinDesdeTexto(datos){
  const F=S.form; if(!F || (F.ubicada && !F.pinAuto)) return "";
  if(!datos.calle && !datos.colonia && datos.lat==null) return "";
  cargando(true,"Buscando la ubicación en el mapa…");
  const r=await ubicarDireccion(datos);
  cargando(false);
  if(!S.form) return "";
  if(r){ map.setView(r.ll, r.como==="ia"?15:16); moverPin(r.ll); S.form.pinAuto=true;
    return r.como==="ia" ? "📍 Ubicación APROXIMADA (calculada por la IA): revísala y mueve el pin." : "📍 Pin colocado: revisa que esté en el lugar exacto."; }
  const q=[datos.calle,datos.colonia].filter(Boolean).join(", ");
  if(q){ $("#qDir").value=q; buscarDireccion(); }
  return "📍 No encontré el lugar exacto: elige una opción de la lista de arriba del mapa o toca el mapa.";
}
// Un solo paso: se sube la imagen → la IA la analiza sola (o la lectura gratuita si no hay IA)
// → se llenan los datos y el pin → solo se pide confirmar el recorte del animal.
async function procesarCaptura(file){
  leerForm(); const F=S.form; if(!F) return;
  F.capturaArchivo=file; F.cajaIA=null; F.fotoArchivo=null; F.fotoPropia=false; F.analisis=null;
  let res=null;
  if(puedeIA()) res=await analizarConIA(true);
  if(!res) res=await analizarConLectura();
  if(!res || !S.form) return;
  await recortarDesdeCaptura(false);
  toast(res.msg + (S.form && S.form.fotoArchivo && S.form.cajaIA ? " 📷 La IA eligió la foto del animal; si no te gusta, usa ✂️ Cambiar recorte." : ""));
}
// Recorta con la caja que propuso la IA (sin preguntar y sin gastar otra consulta)
async function recorteAutomatico(file, caja){
  try{
    const url=URL.createObjectURL(file), img=await cargarImagen(url,false); URL.revokeObjectURL(url);
    const [y0,x0,y1,x1]=caja, pad=0.01;
    const sx=Math.max(0,(x0/1000-pad)*img.width), sy=Math.max(0,(y0/1000-pad)*img.height);
    const sw=Math.min(img.width-sx,((x1-x0)/1000+2*pad)*img.width), sh=Math.min(img.height-sy,((y1-y0)/1000+2*pad)*img.height);
    if(sw<40 || sh<40) return null;
    const c=document.createElement("canvas"); c.width=Math.round(sw); c.height=Math.round(sh);
    c.getContext("2d").drawImage(img,sx,sy,sw,sh,0,0,c.width,c.height);
    const b=await new Promise(r=>c.toBlob(r,"image/jpeg",0.92));
    return b ? new File([b],"recorte.jpg",{type:"image/jpeg"}) : null;
  }catch(e){ return null; }
}
async function recortarDesdeCaptura(preguntar){
  const F=S.form; if(!F || !F.capturaArchivo) return;
  if(!preguntar && F.cajaIA){
    const auto=await recorteAutomatico(F.capturaArchivo, F.cajaIA);
    if(auto && S.form){ S.form.fotoArchivo=auto; S.form.fotoPropia=false; render(); return; }
  }
  const foto=await abrirRecorte(F.capturaArchivo, F.cajaIA);
  if(foto && S.form){ S.form.fotoArchivo=foto; S.form.fotoPropia=false; render(); }
}
async function analizarConLectura(){
  const F=S.form; let texto="";
  try{
    cargando(true,"Leyendo la imagen… (la primera vez tarda un poco)");
    texto=await window.SP_Captura.leerTexto(F.capturaArchivo, p=>cargando(true,`Leyendo la imagen… ${p}%`));
  }catch(err){ cargando(false); toast("No se pudo leer la imagen: "+err.message); return {msg:"Llena los datos a mano."}; }
  cargando(false);
  if(!S.form) return null;
  const d=window.SP_Captura.parsear(texto, hoyISO());
  F.ocrTexto=texto.trim(); F.analisis="lectura";
  for(const k of ["tipo","especie","tamano","sexo","fecha_evento"]) if(d[k]) F[k]=d[k];
  for(const k of ["raza","color","senas","nombre_perro","contacto_telefono","contacto_nombre","contacto_notas","fuente_url","zona"]) if(d[k] && !F[k]) F[k]=d[k];
  if(d.zona) F.zonaManual=true;
  if(!F.radioTocado) F.radio_km=radioSugerido(F.especie,F.tamano);
  actualizarCirculo(); S.dups=[]; render();
  const z=(d.zonaBusqueda||"").split(",").map(x=>x.trim()).filter(Boolean);
  const msgPin=await ponerPinDesdeTexto({calle:z.length>1?z[0]:null, colonia:z.length>1?z[z.length-1]:z[0]});
  const n=d.detectados.length;
  return {msg: n ? `Llené ${n} dato${n>1?"s":""} (lectura gratuita). ${msgPin||"Marca la ubicación en el mapa."} Revisa todo antes de guardar.` : "No encontré datos claros en la imagen; llénalos a mano."};
}
function puedeIA(){ return !PUBLICO && !MODO_DEMO && CFG.IA_PARA!=="nadie" && (CFG.IA_PARA!=="admins" || S.admin); }
// automatico=true: si falla, no molesta con error (se usa la lectura gratuita en su lugar)
async function analizarConIA(automatico){
  const F=S.form; if(!F || !F.capturaArchivo) return null;
  let d, aviso="";
  try{
    cargando(true,"✨ La IA está analizando la imagen…");
    const blob=await comprimir(F.capturaArchivo,1600,0.85);
    const b64=(await blobADataURL(blob)).split(",")[1];
    const r=await Store.leerConIA(b64); d=r.datos;
    if(typeof r.restantes==="number" && r.restantes<=5) aviso=` Te quedan ${r.restantes} análisis con IA hoy.`;
  }catch(err){
    cargando(false);
    if(automatico){ toast("IA no disponible ("+err.message+"). Uso la lectura gratuita."); await new Promise(r=>setTimeout(r,1200)); }
    else toast("IA: "+err.message);
    return null;
  }
  cargando(false);
  if(!S.form) return null;
  F.analisis="ia";
  const map1={tipo:"tipo",especie:"especie",tamano:"tamano",sexo:"sexo",fecha:"fecha_evento",raza:"raza",color:"color",senas:"senas",telefono:"contacto_telefono",contacto_nombre:"contacto_nombre"};
  let n=0;
  for(const k in map1){ if(d[k] && !(k==="sexo" && d[k]==="desconocido")){ F[map1[k]]=d[k]; n++; } }
  if(d.nombre){ F.nombre_perro=d.nombre; n++; }
  const zona=[d.calle,d.colonia].filter(Boolean).join(", ");
  if(zona){ F.zona=zona; F.zonaManual=true; n++; }
  if(d.recompensa && !/recompensa/i.test(F.contacto_notas||"")) F.contacto_notas=[F.contacto_notas,"Ofrecen recompensa"].filter(Boolean).join(" · ");
  if(!F.radioTocado) F.radio_km=radioSugerido(F.especie,F.tamano);
  F.cajaIA=d.foto_animal||null;
  actualizarCirculo(); S.dups=[]; render();
  const msgPin=await ponerPinDesdeTexto({calle:d.calle, colonia:d.colonia, municipio:d.municipio, lat:d.lat, lng:d.lng});
  return {msg:`✨ La IA llenó ${n} dato${n===1?"":"s"}. ${msgPin} Revisa todo antes de guardar.${aviso}`};
}
// Botón manual "Analizar con IA" (cuando se usó la lectura gratuita)
async function reanalizarConIA(){
  leerForm(); const r=await analizarConIA(false);
  if(r && S.form){ await recortarDesdeCaptura(false); toast(r.msg + (S.form && S.form.cajaIA ? " 📷 La IA eligió la foto del animal; si no te gusta, usa ✂️ Cambiar recorte." : "")); }
}
function abrirRecorte(file, caja){
  return new Promise(async res=>{
    let img; const url=URL.createObjectURL(file);
    try{ img=await cargarImagen(url,false); }catch(e){ URL.revokeObjectURL(url); return res(null); }
    const ov=document.createElement("div"); ov.id="recorte";
    ov.innerHTML=`<div class="caja"><b>✂️ Recorta la foto del animal</b>
      <p class="ayuda">Arrastra el dedo o el mouse sobre la foto del perrito o gatito. Solo ese recorte se publica como foto del reporte (la captura completa no se guarda).</p>
      <canvas></canvas>
      <div class="acciones"><button class="btn primario" data-r="ok" disabled>Usar recorte</button>
      <button class="btn borde" data-r="no">Sin foto por ahora</button></div></div>`;
    document.body.appendChild(ov);
    const cv=ov.querySelector("canvas"), ctx=cv.getContext("2d"), ok=ov.querySelector('[data-r="ok"]');
    const k=Math.min((Math.min(window.innerWidth,700)-48)/img.width, (window.innerHeight-230)/img.height, 1);
    cv.width=Math.max(1,Math.round(img.width*k)); cv.height=Math.max(1,Math.round(img.height*k));
    let sel=null, ini=null;
    const dibujar=()=>{ ctx.drawImage(img,0,0,cv.width,cv.height);
      if(sel){ ctx.fillStyle="rgba(0,0,0,.5)"; ctx.fillRect(0,0,cv.width,cv.height);
        ctx.drawImage(img, sel.x/k, sel.y/k, sel.w/k, sel.h/k, sel.x, sel.y, sel.w, sel.h);
        ctx.strokeStyle="#c8893f"; ctx.lineWidth=3; ctx.strokeRect(sel.x,sel.y,sel.w,sel.h); } };
    if(Array.isArray(caja) && caja.length===4){
      sel={x:caja[1]/1000*cv.width, y:caja[0]/1000*cv.height, w:(caja[3]-caja[1])/1000*cv.width, h:(caja[2]-caja[0])/1000*cv.height};
      ok.disabled=false; ov.querySelector(".ayuda").textContent="La IA marcó la foto del animal. Si no quedó bien, vuelve a arrastrar para ajustarla. Solo este recorte se publica.";
    }
    dibujar();
    const pos=e=>{ const r=cv.getBoundingClientRect();
      return {x:Math.max(0,Math.min(cv.width,(e.clientX-r.left)*cv.width/r.width)), y:Math.max(0,Math.min(cv.height,(e.clientY-r.top)*cv.height/r.height))}; };
    cv.onpointerdown=e=>{ e.preventDefault(); ini=pos(e); sel=null; try{ cv.setPointerCapture(e.pointerId); }catch(_){} };
    cv.onpointermove=e=>{ if(!ini) return; const p=pos(e); sel={x:Math.min(ini.x,p.x), y:Math.min(ini.y,p.y), w:Math.abs(p.x-ini.x), h:Math.abs(p.y-ini.y)}; dibujar(); };
    cv.onpointerup=()=>{ ini=null; ok.disabled=!(sel && sel.w>15 && sel.h>15); };
    const cerrar=v=>{ ov.remove(); URL.revokeObjectURL(url); res(v); };
    ov.querySelector('[data-r="no"]').onclick=()=>cerrar(null);
    ok.onclick=()=>{
      const c=document.createElement("canvas"); c.width=Math.round(sel.w/k); c.height=Math.round(sel.h/k);
      c.getContext("2d").drawImage(img, sel.x/k, sel.y/k, sel.w/k, sel.h/k, 0, 0, c.width, c.height);
      c.toBlob(b=>cerrar(b ? new File([b],"recorte.jpg",{type:"image/jpeg"}) : null), "image/jpeg", 0.92);
    };
  });
}

async function guardar(){
  leerForm(); const F=S.form;
  if(!F.ubicada) return toast("Mueve el pin o toca el mapa en el lugar exacto");
  if(F.tipo!=="visto" && !F.contacto_telefono) return toast("El teléfono de contacto es obligatorio para este tipo de reporte");
  if(PUBLICO && F.contacto_telefono && !F.consent) return toast("Marca la casilla de consentimiento para compartir tu contacto");
  if(F.fuente_url && !/^https?:\/\//i.test(F.fuente_url)) F.fuente_url="https://"+F.fuente_url;
  if(!PUBLICO && !S.editId && !F.dupOk){
    S.dups=posiblesDuplicados(F);
    if(S.dups.length){ render(); const c=$("#cajaDups"); if(c) c.scrollIntoView({behavior:"smooth",block:"center"}); return; }
  }
  if(PUBLICO){
    if(F.web) { S.vista="gracias"; quitarPin(); return render(); }                // trampa para bots
    try{ const n=JSON.parse(localStorage.getItem("sp_envios")||"[]").filter(t=>Date.now()-t<36e5); if(n.length>=5) return toast("Has enviado varios reportes seguidos; espera un rato, por favor."); }catch(e){}
  }
  cargando(true, F.fotoArchivo?"Subiendo foto…":"Guardando…");
  try{
    let foto_path=F.foto_path||null, huella=F.huella||null;
    if(F.fotoArchivo && F.fotoArchivo===F.capturaArchivo) F.fotoArchivo=null;   // la captura completa nunca se publica
    if(F.fotoArchivo){
      const blob=await comprimir(F.fotoArchivo, MODO_DEMO?800:1280, MODO_DEMO?0.7:0.75);
      foto_path=await Store.subirFoto(blob);
      if(!PUBLICO){
        cargando(true,"Analizando foto con IA… (la primera vez tarda un poco)");
        const url=URL.createObjectURL(blob);
        try{ huella=await huellaSegura(await cargarImagen(url,false)); } finally { URL.revokeObjectURL(url); }
      } else huella=null;
    }
    const reg={
      especie:F.especie, tipo:F.tipo, tamano:F.tamano, lat:F.lat, lng:F.lng,
      radio_km:Number(F.radio_km)||radioSugerido(F.especie,F.tamano), fecha_evento:F.fecha_evento||hoyISO(),
      zona:F.zona||null, raza:F.raza||null, color:F.color||null, sexo:F.sexo||"desconocido", senas:F.senas||null,
      nombre_perro:F.tipo==="perdido"?(F.nombre_perro||null):null, foto_path,
      contacto_nombre:F.contacto_nombre||null, contacto_telefono:F.contacto_telefono||null, contacto_notas:F.contacto_notas||null,
      fuente_url:F.fuente_url||null
    };
    if(PUBLICO){
      reg.radio_km=radioSugerido(F.especie,F.tamano);
      const id=await Store.crearPublico(reg);
      try{ const n=JSON.parse(localStorage.getItem("sp_envios")||"[]"); n.push(Date.now()); localStorage.setItem("sp_envios",JSON.stringify(n)); }catch(e){}
      Store.avisar(id);
      quitarPin(); S.form=null; S.vista="gracias"; render(); return;
    }
    reg.huella=huella;
    let r;
    if(S.editId){ r=await Store.actualizar(S.editId, reg); S.reportes=S.reportes.map(x=>x.id===r.id?r:x); Store.avisar(r.id); }
    else { r=await Store.crear(reg); S.reportes.push(r); Store.avisar(r.id); }
    quitarPin(); S.form=null; S.editId=null; S.dups=[]; S.vista=S.tab;
    calcularCoincidencias();
    const n=S.coincid.filter(m=>m.p.id===r.id||m.v.id===r.id).length;
    toast(n ? `Guardado. ¡Hay ${n} posible${n>1?"s":""} coincidencia${n>1?"s":""}! 🔎` : "Reporte guardado");
    abrirDetalle(r.id);
  }catch(err){ console.error(err); toast("No se pudo guardar: "+(err.message||err)); }
  finally{ cargando(false); }
}
async function cambiar(id,patch,msg){
  try{ const r=await Store.actualizar(id,patch); S.reportes=S.reportes.map(x=>x.id===id?r:x); toast(msg); render(); }
  catch(err){ toast("Error: "+err.message); }
}
function confirmar(btn, accion){
  if(btn.dataset.confirmar){ accion(); return; }
  const txt=btn.textContent; btn.dataset.confirmar="1"; btn.textContent="¿Seguro? Toca otra vez";
  setTimeout(()=>{ if(btn.isConnected){ delete btn.dataset.confirmar; btn.textContent=txt; } },4000);
}
async function borrar(id){
  try{ await Store.borrar(id); S.reportes=S.reportes.filter(x=>x.id!==id); S.sel=null; S.vista=S.tab; limpiarHash(); toast("Reporte eliminado"); render(); }
  catch(err){ toast("Error: "+err.message); }
}
async function aprobar(id){
  const r=S.reportes.find(x=>x.id===id); if(!r) return;
  cargando(true, r.foto_path&&!r.huella ? "Analizando foto con IA…" : "Aprobando…");
  try{
    const patch={estado:"activo"};
    if(r.foto_path && !r.huella){ try{ patch.huella=await huellaSegura(await cargarImagen(Store.urlFoto(r.foto_path), true)); }catch(e){} }
    const n=await Store.actualizar(id,patch); S.reportes=S.reportes.map(x=>x.id===id?n:x);
    Store.avisar(id);
    toast("Aprobado: ya aparece en el mapa"); render();
  }catch(err){ toast("Error: "+err.message); }
  finally{ cargando(false); }
}
async function rechazar(id){
  const r=S.reportes.find(x=>x.id===id); if(!r) return;
  try{ await Store.borrar(id); try{ await Store.borrarFoto(r.foto_path); }catch(e){}
    S.reportes=S.reportes.filter(x=>x.id!==id); S.sel=null; S.vista="revisar"; S.tab="revisar"; toast("Reporte rechazado"); render(); }
  catch(err){ toast("Error: "+err.message); }
}
async function analizarFotosPendientes(){
  const lista=activos().filter(r=>r.foto_path && !r.huella);
  let ok=0;
  for(let i=0;i<lista.length;i++){
    cargando(true, `Analizando fotos con IA… ${i+1} de ${lista.length}`);
    try{
      const h=await huellaSegura(await cargarImagen(Store.urlFoto(lista[i].foto_path), true));
      if(h){ const n=await Store.actualizar(lista[i].id,{huella:h}); S.reportes=S.reportes.map(x=>x.id===n.id?n:x); ok++; }
    }catch(e){ console.warn(e); }
  }
  cargando(false); toast(ok?`Listo: ${ok} foto${ok>1?"s":""} analizada${ok>1?"s":""}`:"No se pudieron analizar (revisa tu conexión)"); render();
}
function abrirDetalle(id){
  if(S.vista==="form") return;
  S.sel=id; S.vista="detalle"; if(capaMatch) capaMatch.clearLayers();
  const r=S.reportes.find(x=>x.id===id);
  try{ history.replaceState(null,"","#r-"+id); }catch(e){}
  render();
  if(r) map.panTo([r.lat,r.lng]);
  $("#vista").scrollTop=0;
  if(panelEs("min")) panelEstado("mid");
}
function limpiarHash(){ try{ history.replaceState(null,"",location.pathname+location.search); }catch(e){} }
function verMatch(pid,vid){
  const p=S.reportes.find(x=>x.id===pid), v=S.reportes.find(x=>x.id===vid); if(!p||!v) return;
  capaMatch.clearLayers();
  L.polyline([[p.lat,p.lng],[v.lat,v.lng]],{color:"#5b3a1e",weight:3,dashArray:"8 8"}).addTo(capaMatch);
  [p,v].forEach(r=>{ const c=COLORES[r.tipo]; L.circle([r.lat,r.lng],{radius:radioEf(r)*1000,color:c,weight:2,fillOpacity:.12,fillColor:c,interactive:false}).addTo(capaMatch); });
  map.fitBounds(L.latLngBounds([[p.lat,p.lng],[v.lat,v.lng]]).pad(0.6));
  if(panelEs("max")) panelEstado("mid");
}
function ficha(r){
  const e=ESPECIES[esp(r)];
  const L1 = {perdido:`🐾 SE BUSCA · ${e.label.toUpperCase()} PERDIDO`, visto:`🐾 ${e.label.toUpperCase()} VISTO · ¿ES TUYO?`, resguardo:`🐾 ${e.label.toUpperCase()} ENCONTRADO · BUSCAMOS A SU FAMILIA`}[r.tipo];
  const partes=[L1];
  if(r.nombre_perro) partes.push(`Nombre: ${r.nombre_perro}`);
  partes.push(`Tamaño: ${tamLabel(r)}${r.raza?" · "+r.raza:""}${r.color?" · "+r.color:""}`);
  if(r.senas) partes.push(`Señas: ${r.senas}`);
  partes.push(`📍 ${r.zona||CFG.CIUDAD} · ${fmtFecha(r.fecha_evento)}`);
  if(r.contacto_telefono) partes.push(`📞 ${r.contacto_nombre?r.contacto_nombre+": ":""}${r.contacto_telefono}`);
  partes.push(`Mapa: https://www.google.com/maps?q=${r.lat},${r.lng}`);
  partes.push("#SherlockPaws #PerrosPerdidosQro #GatosPerdidosQro");
  return partes.join("\n");
}

/* ---------- Panel móvil ---------- */
function panelEstado(e){ const p=$("#panel"); p.classList.remove("min","max"); if(e!=="mid") p.classList.add(e); setTimeout(()=>map&&map.invalidateSize(),250); }
function panelEs(e){ const p=$("#panel"); return e==="mid" ? !p.classList.contains("min")&&!p.classList.contains("max") : p.classList.contains(e); }

/* ---------- Ejemplos (modo demo) ---------- */
async function cargarEjemplos(){
  const menos=n=>{ const d=fechaLocal(hoyISO()); d.setDate(d.getDate()-n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
  const ej=[
    {especie:"perro",tipo:"perdido",tamano:"mediano",lat:20.6105,lng:-100.4062,radio_km:2.5,fecha_evento:menos(3),zona:"Jurica, Querétaro",nombre_perro:"Canela",raza:"Mestizo",color:"café claro, pecho blanco",sexo:"hembra",senas:"collar rojo con placa",contacto_nombre:"Laura",contacto_telefono:"4421234567"},
    {especie:"perro",tipo:"visto",tamano:"mediano",lat:20.6262,lng:-100.3925,radio_km:2.5,fecha_evento:menos(1),zona:"Juriquilla",raza:"Mestizo",color:"café con blanco",sexo:"desconocido",senas:"traía collar rojo, asustada"},
    {especie:"perro",tipo:"resguardo",tamano:"mediano",lat:20.6190,lng:-100.4010,radio_km:1,fecha_evento:menos(0),zona:"Jurica",raza:"Mestizo",color:"café claro",sexo:"hembra",senas:"collar rojo",contacto_nombre:"Mario",contacto_telefono:"4425550000"},
    {especie:"perro",tipo:"perdido",tamano:"mini",lat:20.5755,lng:-100.3711,radio_km:1,fecha_evento:menos(2),zona:"Centro Sur",nombre_perro:"Toby",raza:"Chihuahua",color:"negro y fuego",sexo:"macho",contacto_nombre:"Pedro",contacto_telefono:"4429876543"},
    {especie:"perro",tipo:"visto",tamano:"chico",lat:20.5801,lng:-100.3790,radio_km:1.5,fecha_evento:menos(1),zona:"Álamos",raza:"Chihuahua",color:"negro",senas:"muy pequeño, corría por la avenida"},
    {especie:"gato",tipo:"perdido",tamano:"mediano",lat:20.5925,lng:-100.3925,radio_km:0.8,fecha_evento:menos(2),zona:"Centro",nombre_perro:"Michi",raza:"Doméstico",color:"atigrado gris",sexo:"macho",contacto_nombre:"Ana",contacto_telefono:"4421112233"},
    {especie:"gato",tipo:"visto",tamano:"mediano",lat:20.5960,lng:-100.3890,radio_km:0.8,fecha_evento:menos(1),zona:"Centro",color:"gris atigrado",senas:"en una azotea"}
  ];
  for(const r of ej) S.reportes.push(await Store.crear(r));
  // un reporte "del público" pendiente de revisión
  const id=await Store.crearPublico({especie:"perro",tipo:"visto",tamano:"grande",lat:20.556,lng:-100.411,radio_km:4,fecha_evento:menos(0),zona:"Corregidora",raza:"Pastor alemán",color:"negro y café"});
  S.reportes=await Store.listar();
  toast("Ejemplos cargados: revisa Coincidencias y Por revisar");
  render();
}

/* =====================================================================
   Arranque
   ===================================================================== */
async function cargarDatos(){
  const [reps, desc] = await Promise.all([Store.listar(), Store.listarDescartes()]);
  S.reportes=reps||[]; S.descartes=new Set((desc||[]).map(d=>d.perdido_id+"|"+d.visto_id));
}
async function arrancarApp(){
  const lg=$("#login"); if(lg) lg.style.display="none";
  if(!map) iniciarMapa();
  if(PUBLICO){ abrirForm(null); return; }
  let autorizado=false; try{ autorizado=await Store.esVoluntario(); }catch(e){ console.error(e); }
  if(!autorizado){
    await Store.salir(); S.user=null;
    if(lg){ lg.style.display="flex"; $("#lErr").textContent="Tu cuenta no está autorizada como voluntario de Sherlock Paws. Pide acceso al administrador."; }
    $("#btnSalir").style.display="none"; return;
  }
  try{ S.admin=await Store.esAdmin(); }catch(e){ S.admin=false; }
  try{ await cargarDatos(); }catch(err){ console.error(err); toast("No se pudieron cargar los reportes: "+err.message); }
  render();
  const m=/^#r-(.+)$/.exec(location.hash);
  if(m && S.reportes.some(r=>r.id===m[1])) abrirDetalle(m[1]);
  if(!MODO_DEMO){
    const refrescar=async()=>{ if(S.vista==="form") return; try{ await cargarDatos(); render(); }catch(e){} };
    setInterval(refrescar,120000);
    document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") refrescar(); });
  }
}
async function inicio(){
  const sub=$("#subtitulo"); if(sub) sub.textContent = PUBLICO ? `Reporta un perrito o gatito perdido o encontrado · ${CFG.CIUDAD}` : `Mapa de perritos y gatitos perdidos · ${CFG.CIUDAD}`;
  const bn=$("#btnNuevo"); if(bn) bn.onclick=()=>{ if(S.vista!=="form") abrirForm(null); };
  $("#btnBuscarDir").onclick=buscarDireccion;
  $("#qDir").onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); buscarDireccion(); } };
  $("#btnMiUbic").onclick=miUbicacion;
  $("#asa").onclick=()=>panelEstado(panelEs("max")?"min":panelEs("min")?"mid":"max");
  document.querySelectorAll("#tabs button").forEach(b=>b.onclick=()=>{
    if(S.vista==="form") return toast("Termina o cancela el reporte primero");
    S.tab=b.dataset.tab; S.vista=S.tab; S.sel=null; capaMatch.clearLayers(); limpiarHash(); render();
  });
  if(typeof L==="undefined"){ document.body.innerHTML='<p style="padding:20px">No se pudo cargar el mapa. Revisa tu conexión a internet y recarga.</p>'; return; }
  if(MODO_DEMO){ S.user=await Store.iniciar(); return arrancarApp(); }
  if(!window.supabase){ toast("No se pudo cargar Supabase. Revisa tu conexión."); return; }
  S.user=await Store.iniciar();
  if(PUBLICO) return arrancarApp();
  $("#btnSalir").onclick=async()=>{ await Store.salir(); location.reload(); };
  if(S.user){ $("#btnSalir").style.display=""; return arrancarApp(); }
  $("#login").style.display="flex";
  $("#formLogin").onsubmit=async e=>{
    e.preventDefault(); $("#lErr").textContent="";
    try{ S.user=await Store.entrar($("#lCorreo").value.trim(), $("#lPass").value); $("#btnSalir").style.display=""; arrancarApp(); }
    catch(err){ $("#lErr").textContent = /invalid/i.test(err.message) ? "Correo o contraseña incorrectos" : err.message; }
  };
}
inicio();
