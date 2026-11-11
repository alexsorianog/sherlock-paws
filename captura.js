"use strict";
/* =====================================================================
   Sherlock Paws · captura.js
   Lee el texto de una captura de Facebook (OCR gratuito en el navegador,
   Tesseract.js) y saca los datos del reporte. Nada se manda a servidores
   de pago: todo corre en el celular o computadora del voluntario.
   ===================================================================== */
(function(){
  const sinAcentos = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"");
  const norm = s => sinAcentos(s).toLowerCase();

  const MESES = {enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};

  const RAZAS = [
    [/chihuahua/,"Chihuahua","mini"], [/schnau[sz]er/,"Schnauzer","chico"], [/poodle/,"Poodle / french poodle","chico"],
    [/\bpug\b/,"Pug","chico"], [/yorkshire|yorki/,"Yorkshire","mini"], [/pomerani/,"Pomerania","mini"],
    [/shih ?tzu/,"Shih Tzu","chico"], [/maltes/,"Maltés","chico"], [/beagle/,"Beagle","mediano"],
    [/cocker/,"Cocker","mediano"], [/salchicha|dachshund/,"Dachshund (salchicha)","chico"],
    [/bulldog frances|frenchie|bull frances/,"Bulldog francés","chico"], [/pit ?bull/,"Pitbull","mediano"],
    [/\bboxer\b/,"Bóxer","grande"], [/labrador/,"Labrador","grande"], [/golden/,"Golden retriever","grande"],
    [/pastor aleman/,"Pastor alemán","grande"], [/pastor belga|malinois/,"Pastor belga","grande"],
    [/husky/,"Husky","grande"], [/border ?collie/,"Border collie","mediano"], [/rottweiler/,"Rottweiler","grande"],
    [/dalmata/,"Dálmata","grande"], [/xolo/,"Xoloitzcuintle","mediano"], [/galgo/,"Galgo","grande"],
    [/siames/,"Siamés",null], [/\bpersa\b/,"Persa",null], [/angora/,"Angora",null], [/maine ?coon/,"Maine coon","grande"],
    [/bengal/,"Bengalí",null], [/mestiz|criollo|\bcruza\b|sin raza/,"Mestizo / criollo",null]
  ];

  const COLORES = [
    ["negro","negro"],["negra","negro"],["blanco","blanco"],["blanca","blanco"],["cafe","café"],["cafecito","café"],
    ["marron","café"],["chocolate","chocolate"],["canela","canela"],["miel","miel"],["gris","gris"],["plateado","gris"],
    ["dorado","dorado"],["dorada","dorado"],["rubio","dorado"],["amarillo","amarillo"],["beige","beige"],["crema","crema"],
    ["arena","arena"],["bayo","bayo"],["atigrado","atigrado"],["atigrada","atigrado"],["manchas","con manchas"],
    ["manchado","con manchas"],["manchada","con manchas"],["pinto","con manchas"],["pinta","con manchas"],
    ["tricolor","tricolor"],["bicolor","bicolor"],["naranja","naranja"],["carey","carey"],["fuego","fuego"],["rojizo","rojizo"]
  ];

  // Colonias y zonas conocidas de Querétaro, Corregidora y El Marqués (se pueden agregar más)
  const ZONAS = ["Juriquilla","Jurica","El Refugio","Zibatá","Zibata","Milenio III","Milenio 3","Centro Histórico","Centro Sur","Álamos","Carretas",
    "El Pueblito","Candiles","Lomas de Casa Blanca","Casa Blanca","Satélite","Santa Rosa Jáuregui","Pedregal de Querétaro","Cimatario",
    "Colinas del Cimatario","Tejeda","Arboledas","Los Arcos","Plazas del Sol","San Pablo","Menchaca","Bolaños","Peñuelas","La Pradera",
    "Sonterra","Cumbres del Lago","Real de Juriquilla","El Campanario","Campanario","Cerrito Colorado","Hércules","La Cañada","Vista Alegre",
    "Niños Héroes","Calesa","Mansiones del Valle","San Javier","Jardines de la Hacienda","Loma Dorada","El Mirador","Tlacote",
    "Santa María Magdalena","Reforma Agraria","Lomas de Querétaro","Puerta Real","Los Olvera","Corregidora","El Marqués","La Vista",
    "Claustros","Galindas","Las Américas","Lomas del Marqués","Villas del Sol","San Pedrito Peñuelas","Epigmenio González","Lomas de San Pedrito",
    "Santa Mónica","Hacienda Santa Fe","Ciudad del Sol","Mompaní","Santa Bárbara","Los Héroes","Paseos del Pedregal","Fray Junípero Serra",
    "Constituyentes","Bernardo Quintana","5 de Febrero","Pie de la Cuesta","Carrillo Puerto","Lomas de Cortés","Tecnológico","Del Valle",
    "Jardines de Querétaro","Valle de Santiago","Misión San Carlos","Cañadas del Lago","Provincia Juriquilla","Altos de Juriquilla",
    "Rancho Largo","Felipe Carrillo Puerto","Ejido Modelo","Lázaro Cárdenas","Las Rosas","Los Ángeles","Vista Real","Paseos de Querétaro"];

  const hoyLocal = () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
  function fechaMenos(hoy, n){ const [y,m,d]=hoy.split("-").map(Number); const f=new Date(y,m-1,d-n); return `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,"0")}-${String(f.getDate()).padStart(2,"0")}`; }
  function fechaValida(hoy, y, m, d){
    if(!(m>=1&&m<=12&&d>=1&&d<=31)) return null;
    const iso=`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    if(iso>hoy){ const iso2=`${y-1}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; return iso2; }  // ej. diciembre visto en enero
    return iso;
  }

  function detectarTipo(n){
    const t=n.replace(/ayud\w* a (encontrar|localizar|buscar)\w*/g," sebusca ");
    const P=[/sebusca/,/se (me |nos |le |les )?(perdio|escapo|salio|extravio)/,/\bperdid[oa]s?\b/,/extraviad/,/se busca/,/buscamos a/,
             /recompensa/,/no ha (regresado|vuelto)/,/desaparec/,/\bmi (perr|gat|mascota|bebe|nino|nina)/,/lo (estamos )?buscando/];
    const R=[/resguard/,/(lo|la|los|las) (tengo|tenemos|recogi|recogimos|rescate|rescatamos)/,/\bencontr(e|amos|ado|ada|aron)\b/,/rescat/,
             /(esta|estan) (conmigo|en mi casa|a salvo|resguard)/,/(busca|buscamos|buscando) (a )?(su )?(familia|dueno|duena|hogar|humano)/,
             /apareci(o|eron) (en|afuera)/,/llego a mi casa/,/hogar temporal/,/\bsu familia\b/];
    const V=[/(lo|la|los|las) vi(mos)?\b/,/\bvist[oa]s?\b/,/anda(ba|n)? (suelt|solit|perdid|vagando|deambul)/,/deambul/,/vagando/,
             /(esta|estaba|anda) (suelt|solo |sola )/,/alguien (lo|la) conoce/,/sin (dueno|collar)/,/en situacion de calle/];
    const c = arr => arr.reduce((s,r)=>s+(r.test(t)?1:0),0);
    const p=c(P), r=c(R), v=c(V);
    if(r>0 && r>=p) return "resguardo";
    if(v>p) return "visto";
    if(p>0) return "perdido";
    return v>0 ? "visto" : null;
  }

  function telefono(texto){
    const cand=[]; const re=/(\+?\d[\d\s().\-]{8,18}\d)/g; let m;
    while((m=re.exec(texto))){
      let d=m[1].replace(/\D/g,"");
      if(d.length===13 && d.startsWith("521")) d=d.slice(3);
      else if(d.length===12 && d.startsWith("52")) d=d.slice(2);
      if(d.length!==10) continue;
      const antes=norm(texto.slice(Math.max(0,m.index-40), m.index));
      const peso=/(tel|cel|whats|wa\b|llam|contact|comunic|informes|inf\b|numero|📞|☎)/.test(antes)?2:1;
      cand.push({d, peso, i:m.index});
    }
    cand.sort((a,b)=>b.peso-a.peso || a.i-b.i);
    return cand.length ? cand[0].d.replace(/(\d{3})(\d{3})(\d{4})/,"$1 $2 $3") : null;
  }

  const MAY="A-ZÁÉÍÓÚÑ", MIN="a-záéíóúñü";
  function zona(texto, n){
    const partes=[]; let busqueda=null;
    const col=new RegExp(`(?:\\b[Cc]ol(?:onia)?\\.?|\\b[Ff]racc?(?:ionamiento)?\\.?|\\b[Bb]arrio|\\b[Rr]esidencial)\\s+([${MAY}0-9][^\\n,.;:!?()#]{2,45})`).exec(texto);
    let colonia = col ? col[1].trim().split(/\s+/).slice(0,5).join(" ").replace(/\s+(en|por|cerca|a|y|el|la|del)$/i,"") : null;
    if(!colonia){
      const nz=norm(texto);
      const z=ZONAS.slice().sort((a,b)=>b.length-a.length).find(x=>nz.includes(norm(x)));
      if(z) colonia=z;
    }
    const calle=new RegExp(`(?:\\b[Aa]v(?:enida)?\\.?|\\b[Cc]alle|\\b[Bb]lvd\\.?|\\b[Bb]oulevard|\\b[Cc]arretera|\\b[Pp]rol(?:ongaci[oó]n)?\\.?|\\b[Cc]amino)\\s+([${MAY}0-9][^\\n,.;:!?()#]{2,40})`).exec(texto);
    const calleTxt = calle ? calle[0].trim().split(/\s+(?:esquina|esq\.?|cerca|frente|junto|entre|a un lado|casi)\b/i)[0].split(/\s+/).slice(0,5).join(" ").replace(/\s+(en|por|a|y|el|la|del|con)$/i,"") : null;
    if(calleTxt) partes.push(calleTxt);
    if(colonia) partes.push(colonia);
    if(partes.length) busqueda = partes.join(", ");
    return { zona: partes.join(", ") || null, busqueda };
  }

  function fecha(n, hoy){
    if(/\bantier\b|\banteayer\b/.test(n)) return fechaMenos(hoy,2);
    if(/\bayer\b|\banoche\b/.test(n)) return fechaMenos(hoy,1);
    let m=/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(\d{4}))?/.exec(n);
    if(m) return fechaValida(hoy, m[3]?+m[3]:+hoy.slice(0,4), MESES[m[2]], +m[1]);
    m=/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/.exec(n);
    if(m){ let y=m[3]?+m[3]:+hoy.slice(0,4); if(y<100) y+=2000; return fechaValida(hoy, y, +m[2], +m[1]); }
    if(/\bhoy\b|esta (manana|tarde|noche)/.test(n)) return hoy;
    return null;
  }

  function senas(texto){
    const SEN=/collar|placa|cojea|cicatriz|\bojo|\bcola\b|oreja|esteriliz|\bchip\b|ropa|sueter|sudadera|pechera|arnes|herida|delgad|asustad|miedos|nervios|operad|mancha en|lunar|dientes|correa|\bmono\b|cascabel|vacunad|\b(anos|meses) de edad|tiene \d|edad|cachorr|panza|patas|hocico|pelo (largo|corto)/;
    const frases=texto.split(/[\n.!¡?¿]+/).map(s=>s.trim()).filter(s=>s.length>3 && s.length<220);
    const out=[];
    for(const f of frases){
      const nf=norm(f);
      if(!SEN.test(nf)) continue;
      if(/\d{3}[\s.-]?\d{3}[\s.-]?\d{4}/.test(f) || /comparte|compartir|me gusta|comentar/.test(nf)) continue;
      if(!out.includes(f)) out.push(f);
    }
    const s=out.join(". ");
    return s ? s.slice(0,400) : null;
  }

  function parsear(texto, hoy){
    hoy = hoy || hoyLocal();
    const t=String(texto||"").replace(/\r/g,"");
    const n=norm(t);
    const r={ detectados:[] };
    const pon=(k,v,etq)=>{ if(v){ r[k]=v; r.detectados.push(etq); } };

    pon("tipo", detectarTipo(n), "tipo de reporte");
    const nGato=(n.match(/\b(gat[oa]s?|gatit[oa]s?|michis?|minin[oa]s?|felin[oa]s?)\b/g)||[]).length;
    const nPerro=(n.match(/\b(perr[oa]s?|perrit[oa]s?|lomitos?|caninos?)\b/g)||[]).length;
    pon("especie", nGato>nPerro ? "gato" : (nPerro>0 ? "perro" : null), "especie");

    let raza=null, tamRaza=null;
    for(const [re,nombre,tam] of RAZAS){ if(re.test(n)){ raza=nombre; tamRaza=tam; break; } }
    pon("raza", raza, "raza");
    if(!r.especie && raza && raza!=="Mestizo / criollo"){
      pon("especie", ["Siamés","Persa","Angora","Maine coon","Bengalí"].includes(raza) ? "gato" : "perro", "especie");
    }

    let tam=null;
    const exp=/tamano\s*:?\s*(mini|chic|pequen|median|grande)/.exec(n);
    if(exp) tam={mini:"mini",chic:"chico",pequen:"chico",median:"mediano",grande:"grande"}[exp[1]];
    else if(/\b(mini|toy|muy pequen\w*|diminut\w*)\b/.test(n)) tam="mini";
    else if(/\b(chiquit\w*|chic[oa]|pequen\w*|pequeñ\w*)\b/.test(n) && !/el chico|la chica|un chico|una chica/.test(n)) tam="chico";
    else if(/\bmedian[oa]\b/.test(n)) tam="mediano";
    else if(/\b(grande|grandot\w*|enorme)\b/.test(n)) tam="grande";
    else if(tamRaza) tam=tamRaza;
    if(!tam && r.especie==="gato" && /cachorr|gatit|\bbebe\b/.test(n)) tam="mini";
    pon("tamano", tam, "tamaño");

    let sexo=null;
    if(/\b(es |un )?macho\b|\bes nino\b/.test(n)) sexo="macho";
    else if(/\bhembra\b|\bperrita\b|\bgatita\b|\bes nina\b|\besterilizada\b/.test(n)) sexo="hembra";
    pon("sexo", sexo, "sexo");

    const cols=[]; for(const [k,v] of COLORES){ if(new RegExp(`\\b${k}\\b`).test(n) && !cols.includes(v)) cols.push(v); }
    pon("color", cols.slice(0,4).join(", ") || null, "color");

    if(r.tipo==="perdido" || !r.tipo){
      const NO=/^(Su|Mi|Un|Una|El|La|Los|Las|Es|Se|Lo|Tiene|Trae|Esta|Este|Ayer|Hoy|Col|Colonia|Por|En|Con|Del|De)$/;
      const pats=[
        new RegExp(`(?:se llama|responde al nombre de|responde a|su nombre es|nombre\\s*:|buscamos a|ayud\\w* a (?:encontrar|localizar|buscar) a)\\s*["“'«]?([${MAY}${MIN}][${MIN}]{1,15})`,"i"),
        new RegExp(`(?:nuestr[oa]|mi|su)\\s+(?:perrit[oa]|perr[oa]|gatit[oa]|gat[oa]|michi|bebe|bebé|mascota|niñ[oa])\\s+["“'«]?([${MAY}][${MIN}]{1,15})`)
      ];
      for(const re of pats){ const nm=re.exec(t); if(nm && /^[A-ZÁÉÍÓÚÑ]/.test(nm[1]) && !NO.test(nm[1])){ pon("nombre_perro", nm[1], "nombre"); break; } }
      if(r.nombre_perro && r.color){ const nn=norm(r.nombre_perro); r.color=r.color.split(", ").filter(c=>norm(c)!==nn).join(", ")||undefined; }
    }

    pon("contacto_telefono", telefono(t), "teléfono");
    const cn=new RegExp(`(?:comunicarse con|comunicate con|comunícate con|preguntar por|contactar a|hablar con|whats(?:app)? de|inf(?:ormes)?\\.? con)\\s+([${MAY}][${MIN}]+(?:\\s[${MAY}][${MIN}]+)?)`).exec(t);
    pon("contacto_nombre", cn?cn[1]:null, "nombre de contacto");

    const z=zona(t, n);
    pon("zona", z.zona, "colonia o calle"); r.zonaBusqueda=z.busqueda;
    pon("fecha_evento", fecha(n, hoy), "fecha");
    pon("senas", senas(t), "señas");
    if(/recompensa|gratificaci/.test(n)) pon("contacto_notas", "Ofrecen recompensa", "recompensa");
    const url=/https?:\/\/(?:www\.|m\.)?(?:facebook|fb)\.(?:com|watch)\/\S+/i.exec(t);
    pon("fuente_url", url?url[0]:null, "liga");
    return r;
  }

  /* ---------- OCR gratuito (Tesseract.js, idioma español) ---------- */
  let _worker=null, _progreso=()=>{};
  function cargarScript(src){ return new Promise((res,rej)=>{ const s=document.createElement("script"); s.src=src; s.onload=res; s.onerror=()=>rej(new Error("No se pudo cargar el lector de texto. Revisa tu conexión.")); document.head.appendChild(s); }); }
  async function leerTexto(archivo, progreso){
    _progreso = progreso || (()=>{});
    if(!window.Tesseract) await cargarScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js");
    if(!_worker){
      _worker = window.Tesseract.createWorker("spa", 1, { logger: m => { if(m.status==="recognizing text") _progreso(Math.round((m.progress||0)*100)); } })
        .catch(e=>{ _worker=null; throw e; });
    }
    const w=await _worker;
    const { data } = await w.recognize(archivo);
    return data.text || "";
  }

  const api = { parsear, leerTexto };
  if(typeof window!=="undefined") window.SP_Captura = api;
  if(typeof module!=="undefined") module.exports = api;
})();
