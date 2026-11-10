// =====================================================================
//  Sherlock Paws · Función "sp-alertas" (Supabase Edge Function)
//  Avisa al grupo de Telegram de los voluntarios cuando:
//   • llega un reporte del público para revisar
//   • se publica un reporte nuevo (perdido / visto / en resguardo)
//   • ese reporte tiene posibles coincidencias
//
//  Secretos necesarios (Edge Functions → Secrets):
//   SP_TELEGRAM_BOT_TOKEN  → el token que te da @BotFather
//   SP_TELEGRAM_CHAT_ID    → el número del grupo (empieza con -100…)
//   SP_APP_URL             → la liga de tu app, ej. https://usuario.github.io/sherlock-paws/
//  SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen incluidos.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

// Mismos valores que config.js (si los cambias allá, cámbialos aquí)
const RADIO_CRECE = 0.10, FACTOR_MAX = 3, DIAS_MAX = 90, UMBRAL_ALERTA = 50;
const ORDEN = ["mini", "chico", "mediano", "grande"];
const TAM: Record<string, Record<string, string>> = {
  perro: { mini: "Mini", chico: "Chico", mediano: "Mediano", grande: "Grande" },
  gato:  { mini: "Gatito", chico: "Chico", mediano: "Mediano", grande: "Grande" },
};

const TOKEN = Deno.env.get("SP_TELEGRAM_BOT_TOKEN") ?? "";
const CHAT = Deno.env.get("SP_TELEGRAM_CHAT_ID") ?? "";
const APP_URL = (Deno.env.get("SP_APP_URL") ?? "").replace(/\/?$/, "/");
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- utilidades (equivalentes a app.js) ----------
type R = Record<string, any>;
const esp = (r: R) => (r.especie === "gato" ? "gato" : "perro");
const hoy = () => { const d = new Date(Date.now() - 6 * 3600e3); return d.toISOString().slice(0, 10); }; // hora de México
const dia = (iso: string) => new Date(String(iso).slice(0, 10) + "T00:00:00Z").getTime();
const diasDesde = (iso: string) => Math.max(0, Math.round((dia(hoy()) - dia(iso)) / 864e5));
const radioEf = (r: R) => r.tipo === "resguardo" ? Number(r.radio_km)
  : Number(r.radio_km) * Math.min(1 + RADIO_CRECE * diasDesde(r.fecha_evento), FACTOR_MAX);
function distKm(a: R, b: R) {
  const toR = (x: number) => x * Math.PI / 180, dLa = toR(b.lat - a.lat), dLo = toR(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const STOP = new Set("de la el los las y con en un una unos unas color perro perra perrito perrita gato gata gatito gatita muy tiene lleva sin del al es su se le lo que por para como mas tipo poco algo esta este estaba trae".split(" "));
const SINON: Record<string, string> = { marron: "cafe", chocolate: "cafe", cafecit: "cafe", cafe: "cafe", canel: "cafe", bayo: "cafe", dorad: "amarill", guer: "amarill", naranj: "amarill", crem: "blanc", hues: "blanc", plata: "gris", atigrad: "atigrad", manchad: "manch", pint: "manch", tricolor: "tricolor", carey: "tricolor" };
function tokens(t: string) {
  const out = new Set<string>();
  String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9ñ]+/).forEach((w) => {
    if (w.length < 3 || STOP.has(w)) return;
    let s = w.replace(/(es|s)$/, ""); if (s.length > 4) s = s.replace(/[ao]$/, "");
    out.add(SINON[s] || s);
  });
  return out;
}
function decod(b64?: string) {
  if (!b64) return null;
  try { const s = atob(b64), a = new Int8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = (s.charCodeAt(i) << 24) >> 24; return a; } catch { return null; }
}
function simFoto(a?: string, b?: string) {
  const x = decod(a), y = decod(b); if (!x || !y || x.length !== y.length) return null;
  let d = 0, nx = 0, ny = 0; for (let i = 0; i < x.length; i++) { d += x[i] * y[i]; nx += x[i] * x[i]; ny += y[i] * y[i]; }
  return Math.max(0, Math.min(1, (d / (Math.sqrt(nx * ny) || 1) - 0.55) / (0.92 - 0.55)));
}
function evaluar(p: R, v: R) {
  if (esp(p) !== esp(v)) return null;
  const dT = Math.abs(ORDEN.indexOf(p.tamano) - ORDEN.indexOf(v.tamano)); if (dT > 1) return null;
  const dd = (dia(v.fecha_evento) - dia(p.fecha_evento)) / 864e5; if (dd < -1 || dd > DIAS_MAX) return null;
  const d = distKm(p, v), lim = radioEf(p) + radioEf(v); if (d > lim) return null;
  const a = tokens([p.color, p.raza, p.senas].join(" ")), b = tokens([v.color, v.raza, v.senas].join(" "));
  let sTxt = 0.5; if (a.size && b.size) { let i = 0; a.forEach((x) => { if (b.has(x)) i++; }); sTxt = Math.min(1, i / Math.min(a.size, b.size)); }
  const fSexo = p.sexo && v.sexo && p.sexo !== "desconocido" && v.sexo !== "desconocido" && p.sexo !== v.sexo ? 0.4 : 1;
  const sF = simFoto(p.huella, v.huella), sD = 1 - d / lim, sT = dT === 0 ? 1 : 0.45;
  const base = sF == null ? 0.45 * sD + 0.25 * sT + 0.30 * sTxt : 0.35 * sD + 0.20 * sT + 0.20 * sTxt + 0.25 * sF;
  return { p, v, d, score: Math.round(100 * base * fSexo) };
}

// ---------- Telegram ----------
const h = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fotoUrl = (p?: string) => !p ? "" : /^https?:/.test(p) ? p : `${SB_URL}/storage/v1/object/public/sp-fotos/${p}`;
async function telegram(texto: string, foto?: string) {
  if (!TOKEN || !CHAT) throw new Error("Faltan SP_TELEGRAM_BOT_TOKEN o SP_TELEGRAM_CHAT_ID");
  const base = `https://api.telegram.org/bot${TOKEN}`;
  if (foto && texto.length <= 1000) {
    const r = await fetch(`${base}/sendPhoto`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, photo: foto, caption: texto, parse_mode: "HTML" }) });
    if (r.ok) return;
  }
  const r = await fetch(`${base}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text: texto, parse_mode: "HTML", disable_web_page_preview: true }) });
  if (!r.ok) throw new Error("Telegram: " + await r.text());
}
function resumen(r: R) {
  const e = esp(r) === "gato" ? "🐈 Gato" : "🐕 Perro";
  const t = ({ perdido: "🔴 PERDIDO", visto: "🔵 VISTO", resguardo: "🟣 EN RESGUARDO" } as R)[r.tipo];
  const lineas = [`<b>${t}</b> · ${e} ${TAM[esp(r)][r.tamano] ?? ""}${r.nombre_perro ? " · <b>" + h(r.nombre_perro) + "</b>" : ""}`];
  const desc = [r.raza, r.color].filter(Boolean).join(" · "); if (desc) lineas.push(h(desc));
  if (r.senas) lineas.push("Señas: " + h(String(r.senas).slice(0, 160)));
  lineas.push(`📍 ${h(r.zona || "Sin zona")} · ${r.fecha_evento}`);
  return lineas.join("\n");
}

// ---------- servidor ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { id } = await req.json().catch(() => ({}));
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) return resp({ error: "id inválido" }, 400);

    const { data: r } = await sb.from("sp_reportes").select("*").eq("id", id).maybeSingle();
    if (!r) return resp({ error: "no existe" }, 404);
    if (r.estado !== "pendiente" && r.estado !== "activo") return resp({ ok: true, omitido: "estado" });
    // Reportes del público: solo se avisa si son recientes (evita abusos)
    if (r.estado === "pendiente" && Date.now() - new Date(r.created_at).getTime() > 15 * 60e3) return resp({ ok: true, omitido: "viejo" });

    // Una sola alerta por reporte y por situación
    const evento = `${r.estado}:${r.tipo}`;
    const { error: dup } = await sb.from("sp_alertas_enviadas").insert({ reporte_id: id, evento });
    if (dup) return resp({ ok: true, omitido: "ya enviado" });

    const deshacer = () => sb.from("sp_alertas_enviadas").delete().eq("reporte_id", id).eq("evento", evento);
    try {
    const liga = APP_URL ? `\n\n👉 <a href="${APP_URL}#r-${id}">Abrir en Sherlock Paws</a>` : "";
    if (r.estado === "pendiente") {
      await telegram(`📥 <b>Nuevo reporte del público por revisar</b>\n\n${resumen(r)}${APP_URL ? `\n\n👉 <a href="${APP_URL}#r-${id}">Revisar y aprobar</a>` : ""}`, fotoUrl(r.foto_path));
      return resp({ ok: true });
    }

    // Coincidencias con los reportes activos
    const { data: act } = await sb.from("sp_reportes").select("*").eq("estado", "activo").neq("id", id);
    type M = NonNullable<ReturnType<typeof evaluar>>;
    const ms: M[] = [];
    for (const o of (act ?? []) as R[]) {
      const m = r.tipo === "perdido" ? (o.tipo !== "perdido" ? evaluar(r, o) : null) : (o.tipo === "perdido" ? evaluar(o, r) : null);
      if (m && m.score >= UMBRAL_ALERTA) ms.push(m);
    }
    ms.sort((a, b) => b.score - a.score); ms.splice(3);

    let txt = `🆕 <b>Nuevo reporte</b>\n\n${resumen(r)}`;
    if (ms.length) {
      txt += `\n\n🔎 <b>¡${ms.length} posible${ms.length > 1 ? "s" : ""} coincidencia${ms.length > 1 ? "s" : ""}!</b>`;
      for (const m of ms) {
        const o = m.p.id === id ? m.v : m.p;
        txt += `\n• ${m.score}% · a ${m.d < 1 ? Math.round(m.d * 1000) + " m" : m.d.toFixed(1) + " km"} · ${h([o.nombre_perro, o.raza, o.color].filter(Boolean).join(", ") || o.tipo)}` +
          (APP_URL ? ` · <a href="${APP_URL}#r-${o.id}">ver</a>` : "");
      }
    }
    await telegram(txt + liga, fotoUrl(r.foto_path));
    return resp({ ok: true, coincidencias: ms.length });
    } catch (e) { await deshacer(); throw e; }   // si Telegram falla, se podrá reintentar
  } catch (e) {
    console.error(e);
    return resp({ error: String((e as Error).message ?? e) }, 500);
  }
});
