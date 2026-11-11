"use strict";
/* =====================================================================
   Sherlock Paws · adopta.js  (página pública de adopción)
   Catálogo de animales en adopción + solicitud paso a paso.
   ===================================================================== */
const CFG = Object.assign({SUPABASE_URL:"", SUPABASE_ANON_KEY:"", CIUDAD:"Querétaro"}, window.SP_CONFIG || {});
const MODO_DEMO = !(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
const AD = window.SP_Adopcion;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16)));
const TAM = {mini:"Mini",chico:"Chico",mediano:"Mediano",grande:"Grande"};
let toastT;
function toast(m){ const t=$("#toast"); t.textContent=m; t.classList.add("ver"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("ver"),4000); }
function cargando(on,txt){ const c=$("#cargando"); c.textContent=txt||"Enviando…"; c.style.display=on?"flex":"none"; }
function comprimir(file, maxDim, q){
  return new Promise((res,rej)=>{ const url=URL.createObjectURL(file), img=new Image();
    img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error("No se pudo leer la imagen")); };
    img.onload=()=>{ const k=Math.min(1,maxDim/Math.max(img.width,img.height)), c=document.createElement("canvas");
      c.width=Math.round(img.width*k); c.height=Math.round(img.height*k); c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      URL.revokeObjectURL(url); c.toBlob(b=>b?res(b):rej(new Error("No se pudo procesar la imagen")),"image/jpeg",q); };
    img.src=url; });
}

/* ---------- Datos ---------- */
const DEMO_K="sp_adop_demo_v1", DEMO_S="sp_solicitudes_demo_v1";
const leerLS=(k)=>{ try{ return JSON.parse(localStorage.getItem(k)||"[]"); }catch(e){ return []; } };
const Datos = MODO_DEMO ? {
  async animales(){ return leerLS(DEMO_K).filter(a=>a.estado==="disponible"||a.estado==="en_proceso"); },
  urlFoto(p){ return p||""; },
  async subirDocumento(f){ return "solicitudes/demo/"+f.name; },
  async enviar(s){ const arr=leerLS(DEMO_S); arr.push(Object.assign({created_at:new Date().toISOString(),estado:"nueva"},s)); try{ localStorage.setItem(DEMO_S,JSON.stringify(arr)); }catch(e){} },
  async avisar(){}
} : {
  sb: window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false, storageKey:"sp-adopta"}}),
  async animales(){
    const { data, error } = await this.sb.from("sp_adopcion_animales").select("*").in("estado",["disponible","en_proceso"]).order("created_at",{ascending:false});
    if(error) throw error; return data||[];
  },
  urlFoto(p){ if(!p) return ""; if(/^(https?:|data:)/.test(p)) return p; return this.sb.storage.from("sp-fotos").getPublicUrl(p).data.publicUrl; },
  async subirDocumento(file, carpeta, nombre){
    let blob=file, ext="pdf", tipo="application/pdf";
    if(file.type!=="application/pdf"){ blob=await comprimir(file,2000,0.85); ext="jpg"; tipo="image/jpeg"; }
    if(blob.size>8*1024*1024) throw new Error("El archivo pesa más de 8 MB.");
    const path=`solicitudes/${carpeta}/${nombre}.${ext}`;
    const { error } = await this.sb.storage.from("sp-documentos").upload(path, blob, {contentType:tipo, upsert:false});
    if(error) throw error; return path;
  },
  async enviar(s){ const { error } = await this.sb.from("sp_solicitudes").insert(s); if(error) throw error; },
  async avisar(id){ try{ await this.sb.functions.invoke("sp-alertas",{body:{solicitud_id:id}}); }catch(e){} }
};

/* ---------- Estado ---------- */
const S = { animales:[], vista:"catalogo", sel:null, paso:0, r:{}, docs:{ine:null, comprobante:null}, f:{especie:"todos"} };
const PASOS = () => [...AD.SECCIONES.map(s=>({id:s.id, titulo:s.titulo, seccion:s})), {id:"documentos", titulo:"Documentos"}, {id:"condiciones", titulo:"Condiciones"}];
function borrador(guardar){
  try{
    if(guardar) localStorage.setItem("sp_adop_borrador", JSON.stringify({r:S.r, animal:S.sel?S.sel.id:null}));
    else { const b=JSON.parse(localStorage.getItem("sp_adop_borrador")||"null"); if(b && b.r) S.r=b.r; }
  }catch(e){}
}

/* ---------- Vistas ---------- */
function render(){
  const v=$("#contenido");
  v.innerHTML = ({catalogo:vCatalogo, detalle:vDetalle, form:vForm, gracias:vGracias})[S.vista]();
  enlazar(); window.scrollTo(0,0);
}
function etiquetas(a){
  const e=[];
  e.push(`<span class="badge b-esp">${a.especie==="gato"?"🐈 Gato":"🐕 Perro"}</span>`);
  e.push(`<span class="badge b-tam">${esc(TAM[a.tamano]||"")}</span>`);
  if(a.sexo!=="desconocido") e.push(`<span class="badge b-tam">${a.sexo==="macho"?"Macho":"Hembra"}</span>`);
  if(a.estado==="en_proceso") e.push(`<span class="badge b-pendiente">Adopción en proceso</span>`);
  return e.join(" ");
}
function vCatalogo(){
  const lista=S.animales.filter(a=>S.f.especie==="todos"||a.especie===S.f.especie);
  let h=`<section class="hero"><h1>Adopta, cambia una vida 🐾</h1>
    <p>Estos animalitos fueron rescatados por voluntarios de <b>Sherlock Paws</b> en ${esc(CFG.CIUDAD)} y buscan un hogar responsable para siempre.</p>
    <div class="filtros">${[["todos","Todos"],["perro","🐕 Perros"],["gato","🐈 Gatos"]].map(([k,t])=>`<button class="chip ${S.f.especie===k?"on":""}" data-esp="${k}">${t}</button>`).join("")}</div></section>`;
  if(!lista.length) h+=`<div class="vacio"><img src="logo.jpg" alt=""><p>${S.animales.length?"No hay animalitos con este filtro.":"Por ahora no hay animalitos publicados. ¡Vuelve pronto!"}</p></div>`;
  else h+=`<div class="rejilla">${lista.map(a=>`<article class="card-adop" data-id="${esc(a.id)}">
      ${a.fotos&&a.fotos[0]?`<img src="${esc(Datos.urlFoto(a.fotos[0]))}" alt="${esc(a.nombre)}" loading="lazy">`:`<div class="sinfoto">${a.especie==="gato"?"🐈":"🐕"}</div>`}
      <div class="cuerpo"><h3>${esc(a.nombre)}</h3><div>${etiquetas(a)}</div>
      <p class="ayuda">${esc([a.edad, a.raza].filter(Boolean).join(" · "))}</p></div></article>`).join("")}</div>`;
  h+=`<div class="aviso" style="margin-top:18px">¿Quieres adoptar pero aún no eliges? <button class="btn chico" data-adoptar="">Llenar solicitud general</button></div>`;
  return h;
}
const sn={si:"Sí",no:"No",no_se:"No se sabe"};
function vDetalle(){
  const a=S.sel; if(!a) return vCatalogo();
  const fotos=(a.fotos||[]).map(p=>Datos.urlFoto(p));
  return `<button class="volver" data-volver>← Ver todos</button>
    <div class="det-adop">
      <div class="galeria">${fotos.length?fotos.map(u=>`<img src="${esc(u)}" alt="${esc(a.nombre)}">`).join(""):`<div class="sinfoto grande">${a.especie==="gato"?"🐈":"🐕"}</div>`}</div>
      <div>
        <h1>${esc(a.nombre)}</h1><div>${etiquetas(a)}</div>
        <dl class="datos">
          <dt>Edad</dt><dd>${esc(a.edad||"—")}</dd><dt>Raza</dt><dd>${esc(a.raza||"—")}</dd><dt>Color</dt><dd>${esc(a.color||"—")}</dd>
          <dt>Salud</dt><dd>${[a.esterilizado?"✅ Esterilizado":"⏳ Por esterilizar", a.vacunado?"✅ Vacunado":"⏳ Por vacunar", a.desparasitado?"✅ Desparasitado":""].filter(Boolean).join(" · ")}</dd>
          <dt>Con niños</dt><dd>${sn[a.convive_ninos]}</dd><dt>Con perros</dt><dd>${sn[a.convive_perros]}</dd><dt>Con gatos</dt><dd>${sn[a.convive_gatos]}</dd>
          ${a.zona?`<dt>Zona</dt><dd>${esc(a.zona)}</dd>`:""}
        </dl>
        ${a.caracter?`<p><b>Carácter:</b> ${esc(a.caracter)}</p>`:""}
        ${a.necesidades?`<p><b>Cuidados especiales:</b> ${esc(a.necesidades)}</p>`:""}
        ${a.descripcion?`<p>${esc(a.descripcion).replace(/\n/g,"<br>")}</p>`:""}
        <button class="btn primario grande" data-adoptar="${esc(a.id)}">🏡 Quiero adoptar a ${esc(a.nombre)}</button>
        <p class="ayuda">Llenarás una solicitud (10–15 min). Ten a la mano foto de tu INE y de tu comprobante de domicilio.</p>
      </div></div>`;
}
function campo(p){
  const val=S.r[p.id], req=p.req?" *":"";
  const lab=`<label${p.tipo!=="opcion"&&p.tipo!=="multi"?` for="q_${p.id}"`:""}>${esc(p.etiqueta)}${req}</label>`;
  if(p.tipo==="opcion") return `<div class="campo" data-q="${p.id}">${lab}<div class="opciones">${p.opciones.map(([k,t])=>`<label class="op"><input type="radio" name="q_${p.id}" value="${k}" ${val===k?"checked":""}> <span>${esc(t)}</span></label>`).join("")}</div></div>`;
  if(p.tipo==="multi") return `<div class="campo" data-q="${p.id}">${lab}<div class="opciones">${p.opciones.map(([k,t])=>`<label class="op"><input type="checkbox" name="q_${p.id}" value="${k}" ${Array.isArray(val)&&val.includes(k)?"checked":""}> <span>${esc(t)}</span></label>`).join("")}</div></div>`;
  if(p.tipo==="parrafo") return `<div class="campo" data-q="${p.id}">${lab}<textarea id="q_${p.id}" maxlength="${p.max||800}">${esc(val||"")}</textarea></div>`;
  const tipo={numero:"number",tel:"tel",email:"email"}[p.tipo]||"text";
  return `<div class="campo" data-q="${p.id}">${lab}<input id="q_${p.id}" type="${tipo}" ${p.max&&tipo==="text"?`maxlength="${p.max}"`:""} ${p.tipo==="numero"?`min="${p.min??0}" max="${p.max??999}" inputmode="numeric"`:""} value="${esc(val??"")}"></div>`;
}
function vForm(){
  const pasos=PASOS(), paso=pasos[S.paso], esp=S.sel?S.sel.especie:null;
  let h=`<button class="volver" data-cancelar>← ${S.sel?"Volver a "+esc(S.sel.nombre):"Volver al catálogo"}</button>
    <h2>Solicitud de adopción${S.sel?` · ${esc(S.sel.nombre)}`:""}</h2>
    <div class="progreso"><i style="width:${Math.round((S.paso)/(pasos.length)*100)}%"></i></div>
    <p class="ayuda">Paso ${S.paso+1} de ${pasos.length}: <b>${esc(paso.titulo)}</b> · Tus respuestas se guardan en este celular mientras llenas.</p>
    <form id="formAdop" autocomplete="on">`;
  if(paso.seccion) h+=paso.seccion.preguntas.map(p=>`<div class="q-wrap" data-wrap="${p.id}" style="${AD.visible(p,S.r,esp)?"":"display:none"}">${campo(p)}</div>`).join("");
  else if(paso.id==="documentos") h+=`
    <div class="aviso">Tus documentos se guardan de forma privada: solo los ven las personas de Sherlock Paws que revisan solicitudes.</div>
    <div class="campo"><label>Identificación oficial (INE, pasaporte o licencia) *</label><input type="file" id="docIne" accept="image/*,application/pdf"><p class="ayuda" id="nIne">${S.docs.ine?"✅ "+esc(S.docs.ine.name):"Foto clara por el frente."}</p></div>
    <div class="campo"><label>Comprobante de domicilio vigente (máx. 3 meses) *</label><input type="file" id="docComp" accept="image/*,application/pdf"><p class="ayuda" id="nComp">${S.docs.comprobante?"✅ "+esc(S.docs.comprobante.name):"Luz, agua, teléfono, predial…"}</p></div>`;
  else h+=`<pre class="condiciones">${esc(AD.CONDICIONES)}</pre>
    <div class="campo"><label class="consent"><input type="checkbox" id="acepto" ${S.r._acepto?"checked":""}> <span>Acepto que he leído y estoy de acuerdo con las condiciones y obligaciones anteriores, y que la información que proporcioné es verdadera.</span></label></div>
    <div class="campo"><label for="firma">Escribe tu nombre completo como firma *</label><input id="firma" type="text" maxlength="120" value="${esc(S.r._firma||"")}"></div>
    <div class="campo oculto" aria-hidden="true"><input id="web" tabindex="-1" autocomplete="off"></div>`;
  h+=`<div class="acciones">${S.paso>0?`<button type="button" class="btn borde" data-atras>← Atrás</button>`:""}
      <button type="submit" class="btn primario">${S.paso===pasos.length-1?"Enviar solicitud":"Siguiente →"}</button></div></form>`;
  return h;
}
function vGracias(){
  return `<div class="gracias"><img src="logo.jpg" alt=""><h2 style="color:var(--cafe)">¡Gracias por querer adoptar! 🐾</h2>
    <p>Recibimos tu solicitud${S.sel?` para <b>${esc(S.sel.nombre)}</b>`:""}. Un voluntario de Sherlock Paws la revisará y te contactará por WhatsApp o llamada.</p>
    <p class="ayuda">Si eres seleccionado, agendaremos una visita a tu domicilio.</p>
    <button class="btn primario" data-inicio>Ver más animalitos</button></div>`;
}

/* ---------- Eventos ---------- */
function leerPaso(){
  const pasos=PASOS(), paso=pasos[S.paso];
  if(paso.seccion){
    for(const p of paso.seccion.preguntas){
      if(p.tipo==="opcion"){ const c=document.querySelector(`input[name="q_${p.id}"]:checked`); S.r[p.id]=c?c.value:(S.r[p.id]??null); }
      else if(p.tipo==="multi"){ S.r[p.id]=[...document.querySelectorAll(`input[name="q_${p.id}"]:checked`)].map(x=>x.value); }
      else { const el=$("#q_"+p.id); if(el) S.r[p.id]= p.tipo==="numero" ? (el.value===""?null:Number(el.value)) : el.value.trim(); }
    }
  } else if(paso.id==="condiciones"){ S.r._acepto=$("#acepto").checked; S.r._firma=$("#firma").value.trim(); }
  borrador(true);
}
function validarPaso(){
  const pasos=PASOS(), paso=pasos[S.paso], esp=S.sel?S.sel.especie:null;
  if(paso.seccion){
    for(const p of paso.seccion.preguntas){
      if(!AD.visible(p,S.r,esp)) continue;
      const v=S.r[p.id];
      const vacio = v==null || v==="" || (Array.isArray(v)&&!v.length);
      if(p.req && vacio) return [p.id, `Falta responder: "${p.etiqueta}"`];
      if(p.tipo==="tel" && v && String(v).replace(/\D/g,"").length!==10) return [p.id,"El celular debe tener 10 dígitos."];
      if(p.tipo==="email" && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return [p.id,"Revisa tu correo electrónico."];
      if(p.tipo==="numero" && v!=null && (v<(p.min??0) || v>(p.max??999))) return [p.id,`Revisa el número en "${p.etiqueta}".`];
      if(p.min && p.tipo==="parrafo" && String(v||"").length<p.min) return [p.id,`Cuéntanos un poco más en "${p.etiqueta}".`];
    }
  } else if(paso.id==="documentos"){
    if(!S.docs.ine) return [null,"Sube tu identificación oficial."];
    if(!S.docs.comprobante) return [null,"Sube tu comprobante de domicilio."];
  } else {
    if(!S.r._acepto) return [null,"Debes aceptar las condiciones para enviar la solicitud."];
    if(S.r._firma.length<5) return [null,"Escribe tu nombre completo como firma."];
  }
  return null;
}
function marcarError(id){
  document.querySelectorAll(".campo.error").forEach(e=>e.classList.remove("error"));
  if(!id) return; const c=document.querySelector(`[data-q="${id}"]`); if(c){ c.classList.add("error"); c.scrollIntoView({behavior:"smooth",block:"center"}); }
}
function actualizarVisibles(){
  const pasos=PASOS(), paso=pasos[S.paso]; if(!paso.seccion) return;
  leerPaso();
  for(const p of paso.seccion.preguntas){ const w=document.querySelector(`[data-wrap="${p.id}"]`); if(w) w.style.display=AD.visible(p,S.r,S.sel?S.sel.especie:null)?"":"none"; }
}
function enlazar(){
  const v=$("#contenido"), on=(sel,fn)=>v.querySelectorAll(sel).forEach(el=>el.onclick=e=>fn(el,e));
  on("[data-esp]", b=>{ S.f.especie=b.dataset.esp; render(); });
  on(".card-adop", el=>{ S.sel=S.animales.find(a=>a.id===el.dataset.id); S.vista="detalle"; try{ history.replaceState(null,"","#a-"+S.sel.id); }catch(e){} render(); });
  on("[data-volver]", ()=>{ S.vista="catalogo"; S.sel=null; try{ history.replaceState(null,"",location.pathname); }catch(e){} render(); });
  on("[data-adoptar]", b=>{ S.sel = b.dataset.adoptar ? S.animales.find(a=>a.id===b.dataset.adoptar) : null; S.vista="form"; S.paso=0; borrador(false); render(); });
  on("[data-cancelar]", ()=>{ leerPaso(); S.vista=S.sel?"detalle":"catalogo"; render(); });
  on("[data-atras]", ()=>{ leerPaso(); S.paso--; render(); });
  on("[data-inicio]", ()=>{ S.vista="catalogo"; S.sel=null; render(); });
  const f=$("#formAdop"); if(!f) return;
  f.addEventListener("change", actualizarVisibles);
  const di=$("#docIne"), dc=$("#docComp");
  if(di) di.onchange=()=>{ S.docs.ine=di.files[0]||null; $("#nIne").textContent=S.docs.ine?"✅ "+S.docs.ine.name:""; };
  if(dc) dc.onchange=()=>{ S.docs.comprobante=dc.files[0]||null; $("#nComp").textContent=S.docs.comprobante?"✅ "+S.docs.comprobante.name:""; };
  f.onsubmit=async e=>{
    e.preventDefault(); leerPaso();
    const err=validarPaso(); if(err){ marcarError(err[0]); toast(err[1]); return; }
    if(S.paso<PASOS().length-1){ S.paso++; render(); return; }
    await enviar();
  };
}
async function enviar(){
  if($("#web") && $("#web").value){ S.vista="gracias"; render(); return; }   // trampa para bots
  try{ const n=JSON.parse(localStorage.getItem("sp_adop_envios")||"[]").filter(t=>Date.now()-t<864e5); if(n.length>=3) return toast("Ya enviaste varias solicitudes hoy. Te contactaremos pronto."); }catch(e){}
  const id=uuid();
  try{
    cargando(true,"Subiendo documentos…");
    const ine=await Datos.subirDocumento(S.docs.ine, id, "identificacion");
    const comp=await Datos.subirDocumento(S.docs.comprobante, id, "comprobante");
    cargando(true,"Enviando solicitud…");
    const r=Object.assign({}, S.r); delete r._acepto;
    r._fecha_aceptacion=new Date().toISOString();
    await Datos.enviar({ id, animal_id:S.sel?S.sel.id:null, nombre:S.r.nombre, telefono:String(S.r.telefono).replace(/\D/g,""), email:S.r.email||null,
      respuestas:r, ine_path:ine, comprobante_path:comp });
    Datos.avisar(id);
    try{ const n=JSON.parse(localStorage.getItem("sp_adop_envios")||"[]"); n.push(Date.now()); localStorage.setItem("sp_adop_envios",JSON.stringify(n)); localStorage.removeItem("sp_adop_borrador"); }catch(e){}
    S.r={}; S.docs={ine:null,comprobante:null}; S.vista="gracias"; render();
  }catch(err){ console.error(err); toast("No se pudo enviar: "+(err.message||err)+". Intenta de nuevo."); }
  finally{ cargando(false); }
}

/* ---------- Arranque ---------- */
(async function(){
  if(!AD){ $("#contenido").innerHTML="<p>Error al cargar el formulario.</p>"; return; }
  try{ S.animales=await Datos.animales(); }catch(err){ console.error(err); toast("No se pudo cargar el catálogo: "+err.message); }
  const m=/^#a-(.+)$/.exec(location.hash);
  if(m){ S.sel=S.animales.find(a=>a.id===m[1])||null; if(S.sel) S.vista="detalle"; }
  render();
})();
