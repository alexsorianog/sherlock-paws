# Sherlock Paws · Guía paso a paso (costo total: $0)

Tiempo aproximado: **1 a 1.5 horas** la primera vez. No necesitas saber programar: solo copiar, pegar y dar clic.

## Qué hay en esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `index.html` | App de **voluntarios** (con usuario y contraseña) |
| `reportar.html` | **Formulario público**: cualquiera reporta, ustedes aprueban |
| `app.js`, `estilos.css` | El código de la app (no hay que tocarlo) |
| `config.js` | **El único archivo que editas** (claves y ajustes) |
| `supabase_setup.sql` | Crea la base de datos y la seguridad |
| `supabase/functions/sp-alertas/index.ts` | Alertas automáticas a Telegram |
| `PROTOCOLO_VOLUNTARIOS.md` | Reglas para el equipo |
| `logo.jpg`, `icono-192.png`, `manifest.json` | Logo e ícono |

**Para probar ya (opcional):** abre `index.html` con doble clic y toca "Cargar ejemplos de prueba". Así funciona en modo demo, guardando solo en tu navegador.

---

## PARTE 1 · Base de datos (Supabase) — 15 min

Sherlock Paws puede vivir **dentro de un proyecto de Supabase que ya tengas**, sin estorbar a tu otra app:
todo lo suyo lleva el prefijo `sp_`, las fotos van en su propio bucket `sp-fotos`, y **solo los correos
que pongas en la lista de voluntarios** pueden ver los datos, aunque el proyecto tenga otros usuarios.
(Si prefieres un proyecto aparte, pausa uno que no uses y crea uno nuevo; los pasos son los mismos.)

**1. Elegir el proyecto**
Entra a <https://supabase.com/dashboard> y abre el proyecto que menos uses.

**2. Crear las tablas**
1. Menú izquierdo → **SQL Editor** → **New query**.
2. Pega TODO `supabase_setup.sql` → **Run** → debe decir *Success*.
   No toca ninguna tabla de tu otra app.

**3. Copiar tus claves**
1. Botón **Connect** (arriba) o **Project Settings → API Keys**.
2. Copia la **Project URL** y la **Publishable key** (en proyectos antiguos se llama *anon public*).
3. Abre `config.js` con el Bloc de notas y pégalas:
   ```js
   SUPABASE_URL: "https://abcdxyz.supabase.co",
   SUPABASE_ANON_KEY: "sb_publishable_…",
   ```
   ⚠️ **Nunca** pongas la *secret key* / *service_role*.

**4. Usuarios y acceso**
1. **Authentication → Users → Add user → Create new user**: correo + contraseña, marca **Auto Confirm User**.
   Hazlo para ti y los 5 voluntarios. (Si alguien ya es usuario de tu otra app, no hay que crearlo otra vez.)
2. **No cambies** "Allow new users to sign up": eso es de tu otra app. Aunque alguien se registre allá,
   no podrá ver nada de Sherlock Paws si no está en la lista.
3. Da acceso en **SQL Editor** (cambia los correos):
   ```sql
   insert into public.sp_admins (user_id)
   select id from auth.users where email = 'tu-correo@ejemplo.com'
   on conflict do nothing;

   insert into public.sp_voluntarios (user_id)
   select id from auth.users where email in (
     'voluntario1@correo.com',
     'voluntario2@correo.com'
   ) on conflict do nothing;
   ```
   Para quitar a alguien: `delete from public.sp_voluntarios where user_id = (select id from auth.users where email = 'correo@ejemplo.com');`

> Si alguien que no está en la lista intenta entrar, la app le dice "Tu cuenta no está autorizada" y lo saca.

---

## PARTE 2 · Publicar la app gratis (GitHub Pages) — 10 min

1. Crea cuenta en <https://github.com> → **New repository** → nombre `sherlock-paws` → **Public** → *Create repository*.
2. **uploading an existing file** → arrastra **todo el contenido** de esta carpeta (incluida la carpeta `supabase`) → **Commit changes**.
3. **Settings → Pages** → *Deploy from a branch* → `main` / `(root)` → **Save**.
4. En 1–2 minutos quedan tus dos ligas:
   - Voluntarios: `https://TU-USUARIO.github.io/sherlock-paws/`
   - Público: `https://TU-USUARIO.github.io/sherlock-paws/reportar.html`
5. Entra con tu usuario y crea un reporte de prueba.

Para actualizar algo después (ej. `config.js`): en GitHub abre el archivo → ✏️ → pega → *Commit*.

---

## PARTE 3 · Alertas por Telegram — 20 min

**1. Crear el bot**
1. En Telegram busca **@BotFather** → escribe `/newbot`.
2. Nombre: `Sherlock Paws Qro`. Usuario: algo que termine en `bot` (ej. `SherlockPawsQroBot`).
3. Copia el **token** que te da (ej. `7012345678:AAH…`). Es secreto.

**2. Crear el grupo**
1. Crea un grupo "Sherlock Paws · Voluntarios" y agrega a los voluntarios y al bot.
2. Hazlo **administrador** del grupo (así puede leer y escribir).
3. Escribe en el grupo: `/start@SherlockPawsQroBot` (con el nombre de tu bot).
4. En el navegador abre (cambiando TOKEN): `https://api.telegram.org/botTOKEN/getUpdates`
5. Busca `"chat":{"id":-100…` y copia ese número **con el signo menos**. Ese es el **chat id**.

**3. Subir la función de alertas a Supabase**
1. En Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nombre: `sp-alertas` (exactamente así).
3. Borra el ejemplo, pega TODO `supabase/functions/sp-alertas/index.ts` → **Deploy**.
4. Abre la función → **Details / Settings** → **apaga** *Verify JWT* / *Enforce JWT verification* → **Save**. La función valida por su cuenta y evita mensajes repetidos.
5. **Edge Functions → Secrets** → **Add new secret**, uno por uno:

   | Nombre | Valor |
   |---|---|
   | `SP_TELEGRAM_BOT_TOKEN` | el token de BotFather |
   | `SP_TELEGRAM_CHAT_ID` | el número -100… |
   | `SP_APP_URL` | `https://TU-USUARIO.github.io/sherlock-paws/` |

   (Llevan `SP_` para no chocar con secretos de tu otra app.)

6. Prueba: crea un reporte en la app → debe llegar un mensaje al grupo con foto y liga.

**Cuándo avisa el bot:**
- 🆕 Cada reporte nuevo, con sus coincidencias de 50 % o más.
- 📥 Cada reporte del público por revisar, con liga directa para aprobar.
- 🤲 Cuando un "visto" se cambia a "en resguardo".

---

## PARTE 4 · Arranque con el equipo — 15 min

1. Pásale a cada voluntario por WhatsApp: liga, correo, contraseña y `PROTOCOLO_VOLUNTARIOS.md`.
2. En el celular: abrir la liga → menú del navegador → **Agregar a pantalla de inicio**.
3. Primera semana: que cada voluntario suba 5–10 casos reales de los grupos de Facebook de Querétaro.
4. Cuando estén cómodos, publica la liga de `reportar.html` en los grupos.

---

## Cómo funciona por dentro

- **Especies:** perro y gato. Solo se comparan entre la misma especie. Rango sugerido para perro: 1, 1.5, 2.5 y 4 km. Para gato: 0.3, 0.5, 0.8 y 1 km, porque suelen esconderse cerca.
- **Tipos:** 🐕 perdido · 👀 visto · 🤲 en resguardo.
- **Rango:** crece 10 % por día hasta 3×, salvo los "en resguardo" (el animal ya no se mueve).
- **Coincidencia:** perdido con visto o resguardo, rangos que se tocan, tamaño igual o vecino, fechas compatibles.
- **Afinidad:** cercanía, tamaño, palabras en común (color, raza, señas) y, si hay fotos, **parecido de fotos con IA**. Las de "en resguardo" salen primero.
- **IA de fotos:** gratis, corre en el celular o computadora del voluntario con el modelo MobileNet. La primera vez descarga ~14 MB y luego queda guardada. Es una ayuda, no una prueba: siempre confirmar con la familia.
- **Duplicados:** al guardar, avisa si ya hay un reporte parecido a menos de 1.5 km.
- **Formulario público:** no puede ver nada, solo enviar. Sus reportes quedan en 📥 Revisar hasta que un voluntario los apruebe. Tiene trampa anti-bots y límite de 5 envíos por hora por celular.

## Límites gratuitos y qué hacer

| Límite | Para ustedes | Si se llega |
|---|---|---|
| Fotos 1 GB (compartido con tu otra app) | ~4,000–6,000 fotos | Supabase Pro 25 USD/mes, o borrar fotos de casos cerrados |
| Base de datos 500 MB (compartida) | Cientos de miles de reportes | — |
| Pausa tras 7 días sin uso | Con uso diario de cualquiera de las dos apps no pasa | Panel de Supabase → *Restore project* (no se pierde nada) |
| Telegram | Ilimitado y gratis | — |

## Si algo falla

- **"Correo o contraseña incorrectos":** revisa que el usuario se creó con *Auto Confirm User*.
- **"Tu cuenta no está autorizada":** falta agregar su correo a `sp_voluntarios` (Parte 1, paso 4).
- **El mapa no carga:** revisa la conexión; la app necesita internet.
- **No llegan alertas:** en Supabase → Edge Functions → sp-alertas → **Logs**. Lo normal es un token o chat id mal copiado, o que el JWT siga activado.
- **Error al guardar en la versión pública:** revisa que corriste el `supabase_setup.sql` más reciente.
- **Desactivar el formulario público de emergencia (spam):** en SQL Editor ejecuta
  `drop policy "sp_reportes_publico" on public.sp_reportes;` (para reactivarlo, vuelve a correr el SQL completo).
