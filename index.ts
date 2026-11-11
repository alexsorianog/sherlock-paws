// =====================================================================
//  Sherlock Paws · Función "sp-ia" (Supabase Edge Function)
//  Lee una captura de Facebook con Google Gemini y regresa los datos
//  del reporte en orden, incluido dónde está la foto del animal.
//
//  Solo la pueden usar voluntarios y administradores con sesión.
//  Cada persona tiene un límite diario para que nunca se dispare el gasto.
//
//  Secretos (Edge Functions → Secrets):
//   SP_GEMINI_API_KEY     → la clave de Google AI Studio (obligatorio)
//   SP_GEMINI_MODEL       → opcional, por defecto "gemini-flash-lite-latest"
//   SP_IA_LIMITE_DIARIO   → opcional, lecturas por persona al día (por defecto 60)
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_KEY = Deno.env.get("SP_GEMINI_API_KEY") ?? "";
const MODELO = Deno.env.get("SP_GEMINI_MODEL") || "gemini-flash-lite-latest";
const MODELOS_RESPALDO = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
const LIMITE = Number(Deno.env.get("SP_IA_LIMITE_DIARIO") || 60);
const SB_URL = Deno.env.get("SUPABASE_URL")!;

function claveServidor(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const o = JSON.parse(raw);
      if (typeof o === "string") return o;
      if (Array.isArray(o)) return typeof o[0] === "string" ? o[0] : (o[0]?.api_key ?? "");
      return (o.default ?? Object.values(o)[0] ?? "") as string;
    } catch { return raw.split(",")[0].trim(); }
  }
  return Deno.env.get("SP_SERVICE_KEY") ?? "";
}
const sb = createClient(SB_URL, claveServidor(), { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const INSTRUCCIONES = (hoy: string) => `Eres asistente de Sherlock Paws, una red de voluntarios que ayuda a reunir perros y gatos perdidos con sus familias en Querétaro, México.
La imagen es una captura de pantalla de una publicación (normalmente de Facebook). Lee TODO el texto y mira la foto del animal.
Hoy es ${hoy}. Responde SOLO con un objeto JSON con estas claves (usa null si no se sabe; no inventes datos):
{
 "tipo": "perdido" | "visto" | "resguardo",   // perdido = la familia lo busca; visto = alguien lo vio suelto; resguardo = alguien lo tiene y busca a su familia
 "especie": "perro" | "gato",
 "tamano": "mini" | "chico" | "mediano" | "grande",  // perro: mini <5kg, chico 5-10kg, mediano 10-25kg, grande >25kg; gato: mini = cachorro
 "sexo": "macho" | "hembra" | "desconocido",
 "raza": string,            // en español; "Mestizo / criollo" si no es de raza; juzga también por la foto
 "color": string,           // colores del pelaje vistos en la foto y/o texto, en español, ej. "café claro con pecho blanco"
 "nombre": string,          // nombre del animal, solo si se menciona
 "telefono": string,        // 10 dígitos de México, sin espacios
 "contacto_nombre": string, // a quién contactar
 "colonia": string,         // colonia o fraccionamiento
 "calle": string,           // calle, avenida o referencia
 "municipio": string,       // Querétaro, Corregidora, El Marqués, etc.
 "fecha": "YYYY-MM-DD",     // fecha del hecho (perdida/avistamiento); usa la fecha de la publicación si es lo único que hay
 "senas": string,           // señas útiles: collar, placa, cicatrices, comportamiento, ropa, edad
 "recompensa": boolean,
 "foto_animal": [ymin, xmin, ymax, xmax]  // caja de la FOTO del animal dentro de la captura, en escala 0-1000; null si no hay foto
}`;

async function llamarGemini(modelo: string, imagenB64: string, mime: string, hoy: string) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: imagenB64 } }, { text: INSTRUCCIONES(hoy) }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: 800 },
    }),
  });
  const txt = await r.text();
  return { ok: r.ok, status: r.status, txt };
}

function limpiar(d: Record<string, unknown>) {
  const s = (v: unknown, max = 300) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null") ? v.trim().slice(0, max) : null;
  const uno = <T extends string>(v: unknown, ok: readonly T[]) => (typeof v === "string" && (ok as readonly string[]).includes(v.toLowerCase())) ? v.toLowerCase() as T : null;
  let tel = s(d.telefono, 30); if (tel) { tel = tel.replace(/\D/g, ""); if (tel.length > 10) tel = tel.slice(-10); if (tel.length !== 10) tel = null; }
  let fecha = s(d.fecha, 10); if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fecha = null;
  let caja: number[] | null = null;
  if (Array.isArray(d.foto_animal) && d.foto_animal.length === 4 && d.foto_animal.every((n) => typeof n === "number")) {
    const [a, b, c, e] = (d.foto_animal as number[]).map((n) => Math.max(0, Math.min(1000, n)));
    if (c - a > 30 && e - b > 30) caja = [a, b, c, e];
  }
  return {
    tipo: uno(d.tipo, ["perdido", "visto", "resguardo"] as const),
    especie: uno(d.especie, ["perro", "gato"] as const),
    tamano: uno(d.tamano, ["mini", "chico", "mediano", "grande"] as const),
    sexo: uno(d.sexo, ["macho", "hembra", "desconocido"] as const),
    raza: s(d.raza, 80), color: s(d.color, 120), nombre: s(d.nombre, 40),
    telefono: tel, contacto_nombre: s(d.contacto_nombre, 80),
    colonia: s(d.colonia, 100), calle: s(d.calle, 100), municipio: s(d.municipio, 60),
    fecha, senas: s(d.senas, 600), recompensa: d.recompensa === true, foto_animal: caja,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!GEMINI_KEY) return resp({ error: "Falta configurar SP_GEMINI_API_KEY en Supabase." }, 500);

    // 1) ¿Quién llama? Debe ser voluntario o admin con sesión
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(token);
    const uid = u?.user?.id;
    if (!uid) return resp({ error: "Inicia sesión para usar la IA." }, 401);
    const [{ data: vol }, { data: adm }] = await Promise.all([
      sb.from("sp_voluntarios").select("user_id").eq("user_id", uid).maybeSingle(),
      sb.from("sp_admins").select("user_id").eq("user_id", uid).maybeSingle(),
    ]);
    if (!vol && !adm) return resp({ error: "Tu cuenta no está autorizada como voluntario." }, 403);

    // 2) Datos de entrada
    const { imagen, mime, hoy } = await req.json().catch(() => ({}));
    if (typeof imagen !== "string" || imagen.length < 100) return resp({ error: "No llegó la imagen." }, 400);
    if (imagen.length > 4_000_000) return resp({ error: "La imagen es demasiado grande." }, 400);
    const tipoImg = ["image/jpeg", "image/png", "image/webp"].includes(mime) ? mime : "image/jpeg";
    const fechaHoy = /^\d{4}-\d{2}-\d{2}$/.test(String(hoy)) ? String(hoy) : new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);

    // 3) Límite diario por persona
    const { data: uso } = await sb.from("sp_ia_uso").select("n").eq("dia", fechaHoy).eq("user_id", uid).maybeSingle();
    const usados = uso?.n ?? 0;
    if (usados >= LIMITE) return resp({ error: `Llegaste al límite de ${LIMITE} lecturas con IA de hoy. Usa la lectura gratuita o inténtalo mañana.` }, 429);
    await sb.from("sp_ia_uso").upsert({ dia: fechaHoy, user_id: uid, n: usados + 1 });

    // 4) Gemini (con modelos de respaldo si el principal no existe)
    let r = await llamarGemini(MODELO, imagen, tipoImg, fechaHoy);
    for (const m of MODELOS_RESPALDO) {
      if (r.ok || r.status !== 404) break;
      r = await llamarGemini(m, imagen, tipoImg, fechaHoy);
    }
    if (!r.ok) {
      const msg = r.status === 429 ? "Se agotó la cuota gratuita de Google por ahora. Intenta más tarde o usa la lectura gratuita."
        : `Google respondió ${r.status}.`;
      console.error("Gemini", r.status, r.txt.slice(0, 500));
      return resp({ error: msg }, 502);
    }
    const j = JSON.parse(r.txt);
    const texto = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    const limpio = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
    let datos: Record<string, unknown>;
    try { datos = JSON.parse(limpio); } catch { return resp({ error: "La IA no regresó datos legibles. Intenta de nuevo." }, 502); }
    return resp({ ok: true, datos: limpiar(datos), restantes: LIMITE - usados - 1 });
  } catch (e) {
    console.error(e);
    return resp({ error: String((e as Error).message ?? e) }, 500);
  }
});
