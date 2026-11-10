// ============================================================
//  Sherlock Paws · Configuración
//  Este es el ÚNICO archivo que necesitas editar.
// ============================================================
//
//  Si dejas SUPABASE_URL vacío, la app funciona en "MODO DEMO":
//  los datos se guardan solo en el navegador de quien la usa
//  (sirve para probarla, NO para trabajar en equipo).
//
//  Para el modo equipo, pega aquí los datos de tu proyecto de
//  Supabase (Project Settings → API). Ver LEEME.md, paso 3.
//
window.SP_CONFIG = {
  SUPABASE_URL: "",        // ej. "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",   // la clave "anon public" (es segura para el navegador)

  CIUDAD: "Querétaro",
  CENTRO: [20.5888, -100.3899],   // centro del mapa (lat, lng)
  ZOOM: 12,

  // Caja donde busca direcciones: [oeste, norte, este, sur]
  // Cubre Querétaro, Corregidora, El Marqués y Huimilpan aprox.
  CAJA_BUSQUEDA: [-100.62, 20.85, -100.12, 20.40],

  // Rango inicial (km) sugerido según especie y tamaño. Se puede mover al registrar.
  // Los gatos perdidos suelen esconderse cerca de casa, por eso su rango es menor.
  RADIO_POR_TAMANO: {
    perro: { mini: 1,   chico: 1.5, mediano: 2.5, grande: 4 },
    gato:  { mini: 0.3, chico: 0.5, mediano: 0.8, grande: 1 },
  },

  // Cada día que pasa, el rango crece este porcentaje (0.10 = 10 %)
  // hasta un máximo de FACTOR_MAXIMO veces el rango inicial.
  CRECIMIENTO_DIARIO: 0.10,
  FACTOR_MAXIMO: 3,

  // Días máximos entre "perdido" y "visto" para considerar coincidencia
  DIAS_MAX_COINCIDENCIA: 90,

  // Comparar fotos con IA (gratis, corre en el navegador del voluntario).
  // La primera vez descarga ~14 MB; luego queda guardado. Pon false para apagarlo.
  COMPARAR_FOTOS: true,
};
