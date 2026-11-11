"use strict";
/* =====================================================================
   Sherlock Paws · adopcion-form.js
   Preguntas de la solicitud de adopción + evaluación automática (semáforo).
   Lo usan adopta.html (público) y la app de voluntarios (revisión).
   La evaluación es una AYUDA: la decisión final siempre es de una persona.
   ===================================================================== */
(function(){
  const SI_NO=[["si","Sí"],["no","No"]];
  const SECCIONES=[
    { id:"personales", titulo:"Tus datos", preguntas:[
      {id:"nombre", tipo:"texto", etiqueta:"Nombre completo", req:true, max:120},
      {id:"edad", tipo:"numero", etiqueta:"Edad", req:true, min:10, max:110},
      {id:"ocupacion", tipo:"texto", etiqueta:"Ocupación", req:true, max:80},
      {id:"estado_civil", tipo:"opcion", etiqueta:"Estado civil", req:true, opciones:[["soltero","Soltero(a)"],["casado","Casado(a) / unión libre"],["divorciado","Divorciado(a) / separado(a)"],["viudo","Viudo(a)"]]},
      {id:"municipio", tipo:"opcion", etiqueta:"Municipio", req:true, opciones:[["queretaro","Querétaro"],["corregidora","Corregidora"],["el_marques","El Marqués"],["huimilpan","Huimilpan"],["otro","Otro"]]},
      {id:"colonia", tipo:"texto", etiqueta:"Colonia o fraccionamiento", req:true, max:100},
      {id:"domicilio", tipo:"texto", etiqueta:"Calle y número", req:true, max:150},
      {id:"referencia", tipo:"texto", etiqueta:"Referencia para llegar", max:150},
      {id:"telefono", tipo:"tel", etiqueta:"Celular / WhatsApp (10 dígitos)", req:true},
      {id:"email", tipo:"email", etiqueta:"Correo electrónico", req:true},
      {id:"como_se_entero", tipo:"opcion", etiqueta:"¿Cómo te enteraste de este animalito?", req:true, opciones:[["facebook","Facebook"],["instagram","Instagram"],["whatsapp","WhatsApp"],["voluntario","Un voluntario de Sherlock Paws"],["otro","Otro"]]}
    ]},
    { id:"vivienda", titulo:"Tu hogar", preguntas:[
      {id:"tipo_vivienda", tipo:"opcion", etiqueta:"¿Vives en casa o departamento?", req:true, opciones:[["casa","Casa"],["departamento","Departamento"],["cuarto","Cuarto / vivienda compartida"]]},
      {id:"tenencia", tipo:"opcion", etiqueta:"¿Es propia, rentada o de un familiar?", req:true, opciones:[["propia","Propia"],["rentada","Rentada"],["familiar","De un familiar"]]},
      {id:"permite_mascotas", tipo:"opcion", etiqueta:"¿Quien te renta o el reglamento permiten mascotas?", req:true, si:r=>r.tenencia==="rentada"||r.tipo_vivienda==="departamento", opciones:[["si","Sí, está permitido"],["no","No"],["no_se","No lo sé"]]},
      {id:"espacio", tipo:"opcion", etiqueta:"¿Tienes espacio suficiente para que se sienta cómodo?", req:true, opciones:SI_NO},
      {id:"bardeado", tipo:"opcion", etiqueta:"¿Patio, azotea o ventanas están protegidos para que no se escape o caiga?", req:true, opciones:[["si","Sí"],["no","No"],["lo_hare","No, pero lo haré antes de la adopción"],["no_aplica","No tengo patio ni azotea"]]},
      {id:"dormira", tipo:"opcion", etiqueta:"¿Dónde dormirá?", req:true, opciones:[["dentro","Dentro de la casa"],["patio_techado","En patio o terraza techada"],["cochera","En la cochera"],["azotea","En la azotea"],["afuera","Afuera, sin techo"]]},
      {id:"parque", tipo:"opcion", etiqueta:"¿Hay un parque o área verde cerca?", req:true, opciones:SI_NO}
    ]},
    { id:"mascotas", titulo:"Tus mascotas", preguntas:[
      {id:"tiene_mascotas", tipo:"opcion", etiqueta:"¿Actualmente tienes perros o gatos?", req:true, opciones:SI_NO},
      {id:"mascotas_cuantas", tipo:"texto", etiqueta:"¿Cuántos y de qué tipo/raza?", req:true, max:150, si:r=>r.tiene_mascotas==="si"},
      {id:"mascotas_tipos", tipo:"multi", etiqueta:"¿Qué tienes?", req:true, si:r=>r.tiene_mascotas==="si", opciones:[["perros","Perro(s)"],["gatos","Gato(s)"],["otros","Otros animales"]]},
      {id:"mascotas_esterilizadas", tipo:"opcion", etiqueta:"¿Están esterilizados?", req:true, si:r=>r.tiene_mascotas==="si", opciones:[["todos","Todos"],["algunos","Algunos"],["ninguno","Ninguno"]]},
      {id:"mascotas_vacunadas", tipo:"opcion", etiqueta:"¿Están vacunados?", req:true, si:r=>r.tiene_mascotas==="si", opciones:[["todos","Todos"],["algunos","Algunos"],["ninguno","Ninguno"]]},
      {id:"mascotas_origen", tipo:"opcion", etiqueta:"¿Cómo los conseguiste?", req:true, si:r=>r.tiene_mascotas==="si", opciones:[["adopcion","Adopción o rescate"],["compra","Compra"],["regalo","Me los regalaron"],["otro","Otro"]]},
      {id:"tuvo_mascotas", tipo:"opcion", etiqueta:"¿Has tenido perros o gatos anteriormente?", req:true, opciones:SI_NO},
      {id:"que_paso", tipo:"multi", etiqueta:"¿Qué pasó con ellos? (marca todas las que apliquen)", req:true, si:r=>r.tuvo_mascotas==="si", opciones:[["siguen","Siguen conmigo"],["edad","Fallecieron por edad o enfermedad"],["accidente","Fallecieron por accidente (atropellados, etc.)"],["perdio","Se perdieron o escaparon"],["regale","Los regalé o di en adopción"],["otro","Otro"]]},
      {id:"que_paso_detalle", tipo:"parrafo", etiqueta:"Cuéntanos brevemente", max:500, si:r=>r.tuvo_mascotas==="si"}
    ]},
    { id:"familia", titulo:"Tu familia", preguntas:[
      {id:"personas", tipo:"numero", etiqueta:"¿Cuántas personas viven contigo (sin contarte)?", req:true, min:0, max:30},
      {id:"edades", tipo:"texto", etiqueta:"¿Qué edades tienen?", max:150, si:r=>Number(r.personas)>0},
      {id:"ninos", tipo:"opcion", etiqueta:"¿Hay niños en casa?", req:true, opciones:[["no","No"],["menores5","Sí, menores de 5 años"],["mayores5","Sí, de 5 años o más"]]},
      {id:"de_acuerdo", tipo:"opcion", etiqueta:"¿Todos los que viven contigo están de acuerdo con la adopción?", req:true, opciones:SI_NO},
      {id:"alergias", tipo:"opcion", etiqueta:"¿Alguien en casa es alérgico a perros o gatos?", req:true, opciones:[["no","No"],["si","Sí"],["no_se","No lo sé"]]},
      {id:"para_quien", tipo:"opcion", etiqueta:"¿Para quién es el animalito?", req:true, opciones:[["yo","Para mí / mi familia, vivirá conmigo"],["regalo","Es un regalo para otra persona"]]},
      {id:"por_que", tipo:"parrafo", etiqueta:"¿Por qué deseas adoptar y cómo lo decidieron?", req:true, min:20, max:800},
      {id:"responsable", tipo:"texto", etiqueta:"¿Quién será responsable de gastos, alimento, aseo y paseos?", req:true, max:120},
      {id:"responsable_adulto", tipo:"opcion", etiqueta:"¿La persona responsable es mayor de edad?", req:true, opciones:SI_NO}
    ]},
    { id:"cuidados", titulo:"Cuidados", preguntas:[
      {id:"cuidados_conoce", tipo:"multi", etiqueta:"¿Qué cuidados implica tener un animal de compañía? (marca los que conozcas)", req:true, opciones:[["alimento","Alimento de calidad y agua limpia"],["vacunas","Vacunas y desparasitación"],["esterilizacion","Esterilización"],["veterinario","Revisiones con veterinario"],["paseos","Paseos y ejercicio"],["higiene","Higiene y limpieza"],["compania","Juego, compañía y cariño"],["identificacion","Collar con placa de identificación"]]},
      {id:"veterinario", tipo:"opcion", etiqueta:"¿Tienes un veterinario de confianza?", req:true, opciones:[["si","Sí"],["buscare","No, pero buscaré uno"],["no","No"]]},
      {id:"recursos", tipo:"opcion", etiqueta:"¿Cuentas con recursos para gastos veterinarios (incluidas emergencias)?", req:true, opciones:[["si","Sí"],["no_seguro","No estoy seguro"],["no","No"]]},
      {id:"horas_solo", tipo:"opcion", etiqueta:"¿Cuánto tiempo al día pasará solo?", req:true, opciones:[["menos4","Menos de 4 horas"],["4a8","De 4 a 8 horas"],["8a10","De 8 a 10 horas"],["mas10","Más de 10 horas"]]},
      {id:"paseos", tipo:"opcion", etiqueta:"¿Cada cuánto lo llevarías a pasear?", req:true, solo:"perro", opciones:[["diario","Diario"],["semana","Varias veces por semana"],["ocasional","Ocasionalmente"],["nunca","No lo pasearía"]]},
      {id:"ventanas", tipo:"opcion", etiqueta:"¿Tus ventanas o balcones tienen malla o protección?", req:true, solo:"gato", opciones:[["si","Sí"],["lo_hare","No, pero la pondré"],["no","No"]]}
    ]},
    { id:"compromisos", titulo:"Compromisos", preguntas:[
      {id:"mudanza", tipo:"opcion", etiqueta:"Si tuvieras que cambiarte de domicilio, ¿qué pasaría con él?", req:true, opciones:[["llevo","Me lo llevo"],["familia","Se queda con mi familia"],["adopcion","Lo daría en adopción"],["no_se","No lo sé"]]},
      {id:"viajes", tipo:"opcion", etiqueta:"¿Qué harías con él si sales de viaje?", req:true, opciones:[["llevo","Me lo llevo"],["familia","Se queda con familia o amigos"],["pension","Pensión o cuidador"],["no_se","No lo sé"]]},
      {id:"contingencia", tipo:"opcion", etiqueta:"En caso de divorcio, embarazo, enfermedad u otra contingencia, ¿con quién se quedaría?", req:true, opciones:[["conmigo","Conmigo"],["familia","Con alguien de mi familia"],["adopcion","Lo daría en adopción"],["no_se","No lo sé"]]},
      {id:"visita_previa", tipo:"opcion", etiqueta:"¿Aceptas que una persona de Sherlock Paws conozca tu casa antes de confirmar la adopción?", req:true, opciones:SI_NO},
      {id:"seguimiento", tipo:"opcion", etiqueta:"¿Aceptas visitas o llamadas periódicas de seguimiento?", req:true, opciones:SI_NO},
      {id:"donativo", tipo:"opcion", etiqueta:"Al adoptar se pide un donativo en especie: un costal de alimento para otros animalitos en adopción. ¿Estás de acuerdo?", req:true, opciones:SI_NO}
    ]}
  ];

  const CONDICIONES=`CONDICIONES DE LA ADOPCIÓN
• Solo pueden adoptar personas mayores de edad.
• Se requiere identificación oficial (INE), comprobante de domicilio vigente y esta solicitud completa.
• La adopción se confirma después de una visita al domicilio.
• Se pide un donativo en especie (un costal de alimento) que se destina a otros animalitos en adopción.

OBLIGACIONES DEL ADOPTANTE
Adoptar es una responsabilidad para toda la vida del animal. El adoptante se compromete a darle trato digno, alimentación adecuada, agua limpia, resguardo, atención veterinaria preventiva y correctiva, vacunas, desparasitación, ejercicio, higiene y cariño.
En la vía pública siempre irá con correa, collar y placa de identificación, y se recogerán sus heces. El adoptante es responsable de evitar daños a terceros.
Nunca deberá abandonarlo, regalarlo, venderlo, cederlo, hacerlo pelear, trabajar ni usarlo para cría; tampoco golpearlo, humillarlo, mutilarlo o sacrificarlo sin indicación de un médico veterinario.
El adoptante cumplirá con la legislación vigente de protección animal y tenencia responsable de su municipio y estado.
Informará a Sherlock Paws cualquier cambio de domicilio o teléfono, así como extravío, enfermedad grave o fallecimiento del animal.
Sherlock Paws dará seguimiento con visitas o llamadas durante la adaptación. Si el animal no se adapta o no se cumplen estas condiciones, Sherlock Paws podrá intervenir y, en casos extremos, recuperar al animal.
Todas las personas que viven en el domicilio deben estar de acuerdo con la adopción.
La información proporcionada será verificada y tratada de forma confidencial; solo la ven las personas autorizadas de Sherlock Paws que revisan solicitudes.`;

  // Preguntas visibles según respuestas y especie del animal
  function visible(p, r, especie){
    if(p.solo && especie && p.solo!==especie) return false;
    if(p.solo && !especie && p.solo==="gato") return false;   // sin animal elegido: se pregunta como perro
    return !p.si || p.si(r);
  }

  /* ---------- Evaluación ---------- */
  function evaluar(r, animal){
    r=r||{}; animal=animal||{};
    const rojos=[], amarillos=[], verdes=[];
    let pts=65;
    const R=(m)=>rojos.push(m), A=(m,n)=>{ amarillos.push(m); pts-=(n||8); }, V=(m,n)=>{ verdes.push(m); pts+=(n||4); };
    const tiene=(k,v)=>Array.isArray(r[k]) && r[k].includes(v);
    const especie=animal.especie||"perro";

    // Eliminatorios
    if(Number(r.edad)<18) R("Es menor de edad.");
    if(r.responsable_adulto==="no") R("La persona responsable no es mayor de edad.");
    if(r.de_acuerdo==="no") R("No todos en casa están de acuerdo con la adopción.");
    if(r.para_quien==="regalo") R("Sería un regalo para otra persona.");
    if(r.visita_previa==="no") R("No acepta la visita previa al domicilio.");
    if(r.seguimiento==="no") R("No acepta el seguimiento.");
    if(r.donativo==="no") R("No acepta el donativo de alimento (condición de adopción).");
    if(r.dormira==="azotea"||r.dormira==="afuera") R(`Dormiría ${r.dormira==="azotea"?"en la azotea":"afuera sin techo"}.`);
    if(r.permite_mascotas==="no") R("Donde vive no se permiten mascotas.");
    if(r.mudanza==="adopcion") R("Si se muda, lo daría en adopción.");
    if(r.contingencia==="adopcion") R("Ante una contingencia, lo daría en adopción.");
    if(r.recursos==="no") R("No cuenta con recursos para gastos veterinarios.");
    if(tiene("que_paso","perdio") && tiene("que_paso","regale")) R("Sus mascotas anteriores se perdieron y además regaló otras.");

    // Compatibilidad con el animal elegido
    if(animal.convive_ninos==="no" && (r.ninos==="menores5"||r.ninos==="mayores5")) R(`${animal.nombre||"El animal"} no convive bien con niños y hay niños en casa.`);
    if(animal.convive_perros==="no" && tiene("mascotas_tipos","perros")) R(`${animal.nombre||"El animal"} no convive bien con perros y tiene perro(s).`);
    if(animal.convive_gatos==="no" && tiene("mascotas_tipos","gatos")) R(`${animal.nombre||"El animal"} no convive bien con gatos y tiene gato(s).`);
    if(animal.convive_ninos==="no_se" && r.ninos==="menores5") A("Hay niños menores de 5 años; confirmar que el animal convive bien con ellos.",6);
    if(animal.tamano==="grande" && r.tipo_vivienda==="departamento") A("Animal grande para un departamento.",6);

    // Señales de alerta (restan)
    if(r.permite_mascotas==="no_se") A("No sabe si en su vivienda se permiten mascotas.");
    if(r.espacio==="no") A("Dice no tener espacio suficiente.",12);
    if(r.bardeado==="no") A("Patio, azotea o ventanas sin protección.",10);
    if(r.dormira==="cochera") A("Dormiría en la cochera.",6);
    if(r.alergias==="si") A("Alguien en casa es alérgico.",10);
    if(r.alergias==="no_se") A("No sabe si hay alergias en casa.",4);
    if(r.recursos==="no_seguro") A("No está seguro de poder cubrir gastos veterinarios.",8);
    if(r.veterinario==="no") A("No tiene ni buscará veterinario.",8);
    if(r.horas_solo==="mas10") A("Pasaría más de 10 horas solo al día.",12);
    if(r.horas_solo==="8a10") A("Pasaría de 8 a 10 horas solo al día.",5);
    if(especie==="perro" && r.paseos==="nunca") A("No lo pasearía.",12);
    if(especie==="perro" && r.paseos==="ocasional") A("Lo pasearía solo ocasionalmente.",6);
    if(especie==="gato" && r.ventanas==="no") A("Ventanas sin malla y no planea ponerla.",10);
    if(r.mudanza==="no_se") A("No sabe qué haría si se muda.",6);
    if(r.mudanza==="familia") A("Si se muda, lo dejaría con su familia.",4);
    if(r.viajes==="no_se") A("No tiene plan para cuando viaje.",5);
    if(r.contingencia==="no_se") A("No tiene plan ante contingencias.",5);
    if(tiene("que_paso","perdio") && !tiene("que_paso","regale")) A("Mascotas anteriores se perdieron o escaparon.",10);
    if(tiene("que_paso","regale") && !tiene("que_paso","perdio")) A("Regaló o dio en adopción mascotas anteriores.",10);
    if(tiene("que_paso","accidente")) A("Mascotas anteriores murieron por accidente.",8);
    if(r.mascotas_esterilizadas==="ninguno") A("Sus mascotas actuales no están esterilizadas.",8);
    if(r.mascotas_vacunadas==="ninguno") A("Sus mascotas actuales no están vacunadas.",8);
    if(r.mascotas_origen==="compra") A("Sus mascotas actuales fueron compradas (no adoptadas).",2);
    if(String(r.por_que||"").trim().length<40) A("Respuesta muy breve sobre por qué quiere adoptar.",3);

    // Señales positivas (suman)
    if(r.dormira==="dentro") V("Dormirá dentro de casa.",6);
    if(r.tenencia==="propia") V("Vivienda propia.",4);
    if(r.permite_mascotas==="si") V("Su vivienda permite mascotas.",3);
    if(r.bardeado==="si") V("Espacios protegidos para que no se escape.",4);
    if(r.veterinario==="si") V("Tiene veterinario de confianza.",6);
    if(r.recursos==="si") V("Puede cubrir gastos veterinarios.",5);
    if(r.horas_solo==="menos4") V("Pasaría menos de 4 horas solo.",6);
    if(especie==="perro" && r.paseos==="diario") V("Lo pasearía diario.",6);
    if(especie==="gato" && r.ventanas==="si") V("Ventanas con malla o protección.",6);
    if(r.parque==="si") V("Tiene parque o área verde cerca.",2);
    if(r.mudanza==="llevo") V("Se lo llevaría si se muda.",4);
    if(r.contingencia==="conmigo") V("Se quedaría con él ante contingencias.",3);
    if(r.viajes==="familia"||r.viajes==="pension"||r.viajes==="llevo") V("Tiene plan para cuando viaje.",2);
    if(r.mascotas_esterilizadas==="todos" && r.mascotas_vacunadas==="todos") V("Sus mascotas actuales están esterilizadas y vacunadas.",8);
    if(r.mascotas_origen==="adopcion") V("Sus mascotas fueron adoptadas o rescatadas.",4);
    if(tiene("que_paso","siguen")||tiene("que_paso","edad")) V("Sus mascotas anteriores siguen con él/ella o vivieron hasta su vejez.",5);
    const nCuidados=Array.isArray(r.cuidados_conoce)?r.cuidados_conoce.length:0;
    if(nCuidados>=7) V(`Conoce ${nCuidados} de 8 cuidados básicos.`,6);
    else if(nCuidados<=3) A(`Solo reconoce ${nCuidados} de 8 cuidados básicos.`,8);

    const puntos=Math.max(0,Math.min(100,Math.round(pts)));
    let semaforo = rojos.length ? "rojo" : (puntos>=75 && amarillos.length<=2 ? "verde" : "amarillo");
    if(!rojos.length && puntos<40) semaforo="rojo";
    const resumen = {verde:"Buen candidato: agendar visita", amarillo:"Revisar: hacer una llamada antes de decidir", rojo:"No recomendado con estas respuestas"}[semaforo];
    return {semaforo, puntos, resumen, rojos, amarillos, verdes};
  }

  // Texto legible de una respuesta
  function textoRespuesta(p, v){
    if(v==null || v==="" || (Array.isArray(v)&&!v.length)) return "—";
    if(p.opciones){
      const m=Object.fromEntries(p.opciones);
      return Array.isArray(v) ? v.map(x=>m[x]||x).join(", ") : (m[v]||v);
    }
    return String(v);
  }

  const api={SECCIONES, CONDICIONES, visible, evaluar, textoRespuesta};
  if(typeof window!=="undefined") window.SP_Adopcion=api;
  if(typeof module!=="undefined") module.exports=api;
})();
