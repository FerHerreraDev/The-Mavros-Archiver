# Especificación verificable — The Mavros Archiver

Fuente de verdad de las pruebas. Cada requisito tiene un ID; cada prueba cita el ID que verifica.

**Reglas**

1. Los requisitos describen comportamiento observable (lo que ve el usuario, lo que responde la API, lo que permite la base de datos), no detalles de implementación.
2. Una prueba que falla es un bug en el código o un requisito que hay que discutir. **Nunca se relaja una aserción para que pase.**
3. Cada fase nueva agrega sus requisitos aquí **antes** de escribir el código.

**Tipos de prueba**

| Tipo | Herramienta | Corre contra | Carpeta |
|---|---|---|---|
| Unit | Vitest | Funciones puras, sin red | `tests/unit` |
| Integration | Vitest | Server Actions, route handlers y middleware reales contra Supabase **local** | `tests/integration` |
| DB / RLS | Vitest + supabase-js | Postgres + Auth **local**, con usuarios reales de cada rol | `tests/db` |
| E2E | Playwright (Chromium) | Build de producción + Supabase local + Mailpit (correos capturados) | `tests/e2e` |
| Static | tsc + ESLint | Todo el código | — |

Las pruebas nunca tocan el proyecto de Supabase de producción: los helpers abortan si la URL no es `127.0.0.1`/`localhost`.

---

## Fase 0 — Seguridad base

| ID | Requisito |
|---|---|
| SEC-01 | El bundle del navegador (`/_next/static`) no contiene la service role key ni ninguna `sb_secret_*`. |
| SEC-02 | `.env.local` (y cualquier `.env*` salvo `.env.example`) está ignorado por git. |
| SEC-03 | `lib/supabase/admin.ts` importa `server-only`, y solo lo importan archivos de servidor (`'use server'` o `server-only`). |
| SIG-01 | El registro público está deshabilitado: `auth.signUp` con la clave pública falla y no crea usuario. |
| DB-01 | Un usuario autenticado puede leer su propio perfil. |
| DB-02 | Un usuario autenticado **no** puede leer perfiles ajenos. |
| DB-03 | Un admin puede leer todos los perfiles. |
| DB-04 | Un usuario **no** puede cambiar su propio `role` (ni ningún campo de `profiles`). |
| DB-05 | Un usuario no puede insertar ni borrar perfiles. |
| DB-06 | Un visitante anónimo no puede leer perfiles. |
| DB-07 | `role` solo acepta `'admin'` o `'user'`. |
| DB-08 | Al crear un usuario (invitación o admin) se crea su perfil con `role = 'user'` y su email. |
| DB-09 | Al borrar un usuario se borra su perfil. |
| DB-10 | Ni un visitante anónimo ni un usuario autenticado (aunque sea admin) pueden ejecutar `revoke_user_sessions` desde el cliente. |
| ACC-03 | `/` lleva a `/dashboard` (y de ahí a `/login` si no hay sesión). |

## Fase 1 — Acceso, invitación y recuperación

### Login / logout

| ID | Requisito |
|---|---|
| AUTH-01 | Credenciales válidas → sesión iniciada (cookie HTTP-only) y redirección a `/dashboard`. El email se acepta sin importar mayúsculas ni espacios alrededor. |
| AUTH-02 | Credenciales inválidas → error, sin sesión. El mensaje para "email no existe" es idéntico al de "contraseña incorrecta" (no se revela qué correos existen). |
| AUTH-03 | Email con formato inválido o contraseña < 8 caracteres se rechazan sin consultar a Supabase. |
| AUTH-04 | Máximo 5 intentos de login por IP por minuto; el 6º se bloquea. Otra IP no se ve afectada. |
| AUTH-05 | Logout cierra la sesión y lleva a `/login`; después `/dashboard` vuelve a pedir login. |
| AUTH-06 | El botón de login está deshabilitado mientras email o contraseña estén vacíos. |

### Control de rutas

| ID | Requisito |
|---|---|
| ACC-01 | `/dashboard` y subrutas sin sesión → `/login?redirectTo=<ruta original>`. |
| ACC-02 | `/login` con sesión → `/dashboard`. |
| ACC-04 | `/set-password` sin sesión → `/login`. |
| ACC-05 | Un invitado que abrió el link pero no ha elegido contraseña es enviado a `/set-password` si intenta ir a `/dashboard` o `/login`. |
| ACC-06 | `/forgot-password` es accesible sin sesión; con sesión → `/dashboard`. |
| ACC-07 | El enlace "Admin" del navbar solo aparece para `role = 'admin'`. |
| ACC-08 | Tras hacer login desde una redirección (`redirectTo`), el usuario vuelve a la ruta original, siempre que sea interna. |

### Invitación

| ID | Requisito |
|---|---|
| INV-01 | Solo un admin puede invitar. Sin sesión o con rol `user` → error y **no se envía correo**. |
| INV-02 | Email inválido → error de validación, no se envía correo. |
| INV-03 | Invitar un email que ya tiene cuenta → error claro. |
| INV-04 | Flujo completo: el invitado recibe el correo, abre el link, llega a `/set-password` mostrando su email, elige contraseña, entra a `/dashboard`, y más tarde puede hacer login con esa contraseña. |
| INV-05 | Un link de invitación ya usado o inválido lleva a `/login` con un mensaje de link inválido/expirado. |
| INV-06 | El link del correo apunta a `<site>/auth/confirm?token_hash=…&type=invite`. |
| INV-07 | Si Supabase no manda el correo por su límite por hora, invitar y reenviar dicen que se alcanzó el límite y que se intente más tarde; un correo ya registrado sugiere usar "Reenviar". |

### Confirmación de links (`/auth/confirm`)

| ID | Requisito |
|---|---|
| CNF-01 | Nunca redirige fuera del sitio, sin importar el parámetro `next` (`https://evil.com`, `//evil.com`, `/\evil.com`, `/%5Cevil.com`, etc.). |
| CNF-02 | Links de tipo `invite` y `recovery` siempre terminan en `/set-password` con sesión iniciada. |
| CNF-03 | Sin token, o con token inválido → `/login?error=link_invalid`, sin sesión. |

### Contraseña

| ID | Requisito |
|---|---|
| PWD-01 | La nueva contraseña debe tener 8–64 caracteres y coincidir con la confirmación (validado en cliente **y** servidor). |
| PWD-02 | Tras elegir contraseña → `/dashboard`, y el usuario queda marcado como "ya tiene contraseña" (deja de aplicar ACC-05). |
| PWD-03 | `/forgot-password` responde exactamente lo mismo para un email existente y uno inexistente; solo el existente recibe correo. |
| PWD-04 | Flujo completo de recuperación: correo → link → nueva contraseña → login con la nueva funciona y con la vieja no. |
| PWD-05 | Elegir contraseña sin sesión → error, no cambia nada. |

### Utilidades

| ID | Requisito |
|---|---|
| UTIL-01 | La URL del sitio para correos usa `NEXT_PUBLIC_SITE_URL` (sin `/` final) si existe; si no, el origin del request; si no, el host reenviado; si no, `http://localhost:3000`. |
| UTIL-02 | En Vercel, sin `NEXT_PUBLIC_SITE_URL`, los links de correo usan el dominio de producción (`VERCEL_PROJECT_PRODUCTION_URL`), nunca la URL de deployment desde la que invitó el admin: esas URLs piden cuenta de Vercel. |

## Fase 2 — Perfil y panel de administración

### Perfil (`/dashboard/profile`)

| ID | Requisito |
|---|---|
| PRF-01 | Muestra el email, el User ID, el rol y el estado de la cuenta del usuario con sesión. |
| PRF-02 | Solo muestra datos del usuario con sesión (nunca de otro), aunque se manipule la URL. |

### Acceso al panel (`/dashboard/admin`)

| ID | Requisito |
|---|---|
| ADM-01 | Un usuario con rol `user` que entra a `/dashboard/admin` es enviado a `/dashboard` y no ve contenido de admin. La verificación es en el servidor. |
| ADM-02 | Un admin ve el formulario de invitación y la tabla de usuarios. |

### Invitar desde el panel

| ID | Requisito |
|---|---|
| ADM-03 | El formulario de invitación envía la invitación, muestra mensaje de éxito y limpia el campo. Errores (email inválido, ya registrado) se muestran en el formulario. |
| ADM-04 | Tras invitar, el usuario aparece en la tabla con estado "pendiente" sin recargar manualmente. |

### Tabla de usuarios

| ID | Requisito |
|---|---|
| ADM-05 | Lista **todos** los usuarios con email, rol, estado (`activo` / `pendiente` / `desactivado`), fecha de alta y último acceso. Pendiente = invitado que aún no eligió contraseña. |
| ADM-06 | Un admin puede cambiar el rol de otro usuario entre `user` y `admin`. El cambio tiene efecto en el siguiente request de ese usuario (aparece/desaparece su enlace Admin). |
| ADM-07 | Un admin **no** puede cambiar su propio rol (evita quedarse sin admins por accidente). |
| ADM-08 | Un admin puede reenviar la invitación a un usuario pendiente; le llega un correo nuevo con un link que funciona. Reenviar a un usuario activo o desactivado da error. |
| ADM-09 | Un admin puede desactivar a otro usuario: ese usuario ya no puede hacer login **y pierde el acceso aunque tenga una sesión abierta**. Sus sesiones quedan cerradas para siempre: si luego se le reactiva, tiene que volver a iniciar sesión. |
| ADM-10 | Un admin puede reactivar a un usuario desactivado; vuelve a poder hacer login con su contraseña. |
| ADM-11 | Un admin **no** puede desactivarse a sí mismo. |

### Seguridad de las acciones de admin

| ID | Requisito |
|---|---|
| ADM-12 | Toda acción de admin (invitar, cambiar rol, reenviar, desactivar/reactivar) y la carga de la tabla rechazan a visitantes sin sesión y a usuarios con rol `user`, sin cambiar nada. |
| ADM-13 | Las acciones validan su entrada: un `userId` que no es UUID, o un rol fuera de `admin`/`user`, se rechaza sin cambiar nada. Un UUID que no existe da error. |

### Interfaz

| ID | Requisito |
|---|---|
| UI-02 | Todo texto visible tiene contraste legible contra el fondo (WCAG AA: ≥ 4.5 para texto normal, ≥ 3 para texto grande) en las páginas de acceso (`/login`, `/forgot-password`, `/link`). |
| UI-01 | En un teléfono (390 px de ancho) ninguna página (login, catálogo, reproducción, perfil, admin y películas) tiene scroll horizontal; los enlaces del navbar siguen accesibles por nombre. |
| UI-03 | Todo campo para escribir (input, textarea, select) se distingue como campo: su contorno **o** su fondo contrasta ≥ 3:1 con lo que lo rodea (WCAG 1.4.11), y al enfocarse muestra un anillo de foco que también contrasta ≥ 3:1. Aplica a login, recuperar contraseña, nueva contraseña, `/link`, invitar usuarios y el formulario de películas. |

## Contenido — pipeline de video (HLS)

Aplica a cada película que se sube a R2. Se verifica con `pnpm hls:verify` (local antes de subir, y contra R2 después).

| ID | Requisito |
|---|---|
| VID-01 | Existe un `master.m3u8` con al menos 3 calidades (resoluciones distintas), cada una con `BANDWIDTH`, `RESOLUTION` y `CODECS`, y cada una en su propia carpeta (nunca dos calidades con la misma playlist: un original entre escalones, p. ej. 1782 de ancho, va en `original/`). |
| VID-02 | Cada calidad es VOD completa (`#EXT-X-PLAYLIST-TYPE:VOD` y `#EXT-X-ENDLIST`). |
| VID-03 | Todos los segmentos, salvo el último, duran 6 s (±0.1 s); ninguno supera `#EXT-X-TARGETDURATION`. |
| VID-04 | Las calidades están alineadas: mismo número de segmentos y la misma duración en cada posición (±0.05 s), para cambiar de calidad sin saltos. |
| VID-05 | La duración total de cada calidad coincide con la del archivo original (±1 s). |
| VID-06 | La calidad más alta conserva la resolución original, y ninguna calidad tiene más resolución que el original. |
| VID-07 | En R2, cada playlist y cada segmento responde 200 con su tipo correcto (`application/vnd.apple.mpegurl` / `video/mp2t` / `text/vtt`) y permite CORS; incluye las pistas de audio y subtítulos (VID-11, VID-12). |
| VID-08 | Calidad por resolución (H.264, CRF con tope de bitrate y búfer de 2× el tope). Topes: **2160p 16 Mbps, 1440p 9, 1080p 6, 720p 3, 480p 1.4, 360p 0.8**. Cada calidad usa el tope de **su** resolución (un original 4K no queda limitado al tope de 1080p). Debajo del original se generan 1080p, 720p, 480p y 360p (solo las menores que el original). En un video real codificado, el **video** de ningún segmento supera su tope en más de 25 % (el audio se copia del original y no cuenta) y la calidad 1080p de un video exigente usa más de 3.5 Mbps (el tope anterior era 3). |
| VID-09 | Carpeta de entrada en la Mac (`~/Movies/Mavros/Entrada`): cada video (mkv, mp4, mov, m4v, avi) que termine de copiarse (tamaño sin cambios ≥ 30 s) se convierte, verifica y sube solo a `movies/<slug>`, y queda como **borrador** con título y año sacados del nombre (`Perfect Blue (1997).mkv` → "Perfect Blue", 1997, slug `perfect-blue`; si el slug existe se agrega `-2`, `-3`…). El original pasa a `Procesadas`; si algo falla, a `Errores` con un `.log` de la causa. Nunca procesa dos veces el mismo archivo ni corre dos veces a la vez. |
| VID-10 | Mientras procesa una película, en `Entrada` aparece un archivo cuyo **nombre** muestra el paso (convirtiendo / verificando / subiendo), una barra, el porcentaje y el tiempo que falta (estimado con lo que lleva); se actualiza solo y desaparece al terminar. `pnpm movie:progreso` muestra lo mismo en la Terminal. |
| VID-11 | **Idiomas de audio.** Si el original trae más de una pista de audio, cada una queda como pista aparte del master (`#EXT-X-MEDIA:TYPE=AUDIO`, un mismo `GROUP-ID` que todas las calidades citan con `AUDIO=`), con `LANGUAGE` (BCP-47: `spa` → `es`) y `NAME` legible en español ("Español", "Inglés"…; si dos comparten idioma, se numeran). La pista por defecto (`DEFAULT=YES`) es la primera del original. Cada playlist de audio es VOD completa y dura lo mismo que el original (±1 s). Con una sola pista de audio no cambia nada (va dentro de cada calidad). |
| VID-12 | **Subtítulos opcionales.** Cada pista de subtítulos de texto del original (srt, ass, mov_text, webvtt) queda como pista WebVTT del master (`#EXT-X-MEDIA:TYPE=SUBTITLES`, un mismo `GROUP-ID` que todas las calidades citan con `SUBTITLES=`), **apagada por defecto** (`DEFAULT=NO`), con `LANGUAGE` y `NAME` como VID-11. Su playlist es VOD completa con un `.vtt` que empieza con `WEBVTT` y lleva `X-TIMESTAMP-MAP` alineado con el inicio del video. Se descartan las pistas con menos de 20 líneas (vacías o de anuncios) y las líneas de anuncios (Telegram, enlaces). Los subtítulos de imagen (PGS/VobSub) y los quemados en el video no se pueden convertir. |

## Fase 3 — Catálogo: modelo de datos y gestión de películas

Pensado para varios clientes (web y la futura app Android en Kotlin): las reglas viven en la base de datos (RLS), no solo en Server Actions.

### Base de datos (`movies`)

| ID | Requisito |
|---|---|
| MOV-01 | Un usuario autenticado ve **solo** películas publicadas; los borradores no existen para él (ni listando ni por id/slug). |
| MOV-02 | Un admin ve todas, incluidos borradores. |
| MOV-03 | Un visitante anónimo no ve ninguna película. |
| MOV-04 | Solo un admin puede crear, editar o borrar películas, **desde cualquier cliente** (también con la clave pública + su sesión, como haría Android). Un `user` no puede, ni siquiera en borradores. |
| MOV-05 | Integridad: `slug` único en formato `palabras-en-minusculas`; título obligatorio (1–200); año entre 1888 y 2100; duración > 0; `hls_path` relativo que termina en `.m3u8` (sin `http`, sin `/` inicial, sin `..`); `poster_url` https o vacío; estado `draft` o `published`. |
| MOV-06 | Al publicar se registra `published_at`; al volver a borrador se borra. `updated_at` se actualiza solo. `created_by` queda con el admin que la creó. |

### Gestión desde el panel (`/dashboard/admin/movies`)

| ID | Requisito |
|---|---|
| MOV-07 | Un admin crea una película desde un formulario. Se guarda como borrador. Los errores de validación se muestran por campo. |
| MOV-08 | Antes de guardar, el servidor comprueba que el `master.m3u8` existe en `VIDEO_BASE_URL + hls_path` y es un master HLS válido; si no, error claro y no se guarda. La duración se toma de la playlist (no se escribe a mano). |
| MOV-09 | Si no se escribe slug, se genera del título (`"Chainsaw Man: Reze Arc"` → `chainsaw-man-reze-arc`). Un slug repetido da error claro. |
| MOV-10 | Los géneros se escriben separados por comas y se guardan normalizados: minúsculas, sin espacios sobrantes, sin repetidos. |
| MOV-11 | Un admin puede editar, publicar, despublicar y borrar. Borrar pide confirmación y no toca los archivos en R2. |
| MOV-12 | Un `user` que entra a `/dashboard/admin/movies` vuelve a `/dashboard`; todas las acciones de películas rechazan a anónimos y `user` sin cambiar nada. |
| MOV-13 | El panel admin tiene pestañas **Usuarios** / **Películas**. |
| MOV-14 | Al tocar **Editar**, **Nueva película** o **Cancelar** del formulario, el botón muestra **de inmediato** que está cargando (indicador girando, anunciado como "Cargando…") hasta que abre el formulario, aunque el servidor tarde. |

## Fase 4 — Acceso protegido al video

El video deja de ser público. Un Worker de Cloudflare delante de R2 solo entrega archivos con un token firmado que emite la app. El mismo flujo sirve para la web y para la app Android.

### Token de reproducción

| ID | Requisito |
|---|---|
| PLY-01 | El token está firmado (HMAC-SHA256) con un secreto que solo conocen el servidor de la app y el Worker. Cualquier cambio al token (carpeta, caducidad, firma) lo invalida. |
| PLY-02 | El token caduca (4 h por defecto) y solo vale para la carpeta de **una** película: no sirve para leer otra película ni nada fuera de esa carpeta. |

### Worker de video

| ID | Requisito |
|---|---|
| PLY-03 | Sin token, con token inválido, caducado o de otra película → 403 y no se lee nada de R2. |
| PLY-04 | Con token válido entrega `.m3u8`, `.ts` y `.vtt` con su tipo correcto, CORS y soporte de `Range` (206). Archivo inexistente → 404. Cualquier otro tipo de archivo o ruta con `..` → 403/404, nunca se sirve. |
| PLY-05 | Las rutas relativas de las playlists siguen funcionando: el token va en la ruta (`/t/<token>/…`), así que cada segmento lo hereda sin reescribir playlists. |

### Endpoint `GET /api/playback/<movieId>`

| ID | Requisito |
|---|---|
| PLY-06 | Sin sesión → 401. Funciona con la cookie de la web **y** con `Authorization: Bearer <access token de Supabase>` (Android). |
| PLY-07 | Solo entrega URL si el usuario puede ver la película según RLS: publicada para cualquier usuario, borradores solo para admins. Película que no existe o que no puede ver → 404 (no revela si existe). |
| PLY-08 | La respuesta trae `url` (URL firmada del `master.m3u8` en el Worker) y `expires_at`, con `Cache-Control: no-store`. Un usuario desactivado → 401. |

### Integración con el panel

| ID | Requisito |
|---|---|
| PLY-09 | Al guardar una película, el servidor verifica el video **a través del Worker** con un token propio (MOV-08 sigue cumpliéndose con el bucket privado). |

## Fase 5 — Catálogo y reproductor

### Catálogo (`/dashboard`)

| ID | Requisito |
|---|---|
| CAT-01 | Muestra **solo películas publicadas**, para todos (también para admins: los borradores se ven en el panel, no en el catálogo). |
| CAT-02 | "Recién agregadas" ordena por fecha de publicación, la más reciente primero. |
| CAT-03 | Cada tarjeta muestra póster (o un placeholder), título, año y duración, y lleva al detalle `/dashboard/movie/<slug>` (CAT-09); en "Seguir viendo" lleva directo a `/dashboard/watch/<slug>`. Las tarjetas y los chips de género no se precargan: el catálogo tiene decenas y precargarlos todos saturaba la conexión y el servidor al tocar uno. |
| CAT-04 | Filtro por género: los chips salen de los géneros de las películas publicadas; elegir uno filtra y queda en la URL (`?genre=…`); "Todas" quita el filtro. Un género que no existe muestra el estado vacío. |
| CAT-05 | Sin películas, se muestra un estado vacío claro (no una cuadrícula vacía). |
| CAT-06 | "Seguir viendo" muestra las películas que el usuario dejó a medias (entre 5 % y 95 %), la más reciente primero, con barra de progreso; no aparece si no hay ninguna. |
| CAT-07 | **Portada**: sin búsqueda ni género, el catálogo abre con las **destacadas**: las 5 películas o series publicadas más recientes que tienen imagen horizontal (una serie solo si ya tiene episodios publicados). Cada una muestra su imagen a todo lo ancho (con vista previa borrosa, LOAD-02, y un acercamiento lento), su **logo** (o el título si no hay), año · duración o temporadas · géneros, la sinopsis, **"Reproducir"** (película) o **"Ver serie"** (serie) y "Agregar a lista". La esquina del texto se tiñe con su **color** (TMDB-07). Cambian solas cada 8 s; se detienen con el mouse o el foco encima y con el botón de pausa; con "reducir movimiento" no rotan ni se animan. Se puede elegir cualquiera con sus indicadores. Sin ninguna con imagen horizontal, no hay portada. |
| CAT-08 | **Filas que se deslizan**: sin búsqueda ni género, el catálogo va en filas horizontales: "Seguir viendo" (CAT-06), "Recién agregadas" (CAT-02), "Series" (SER-08) y **una por género** con al menos 2 títulos (películas y series, la más reciente primero). Se recorren con el dedo, el trackpad, la rueda o Tab (cada tarjeta se acomoda al borde), y en escritorio con flechas que avanzan una pantalla (desactivadas en las orillas). Al pasar el mouse o con el foco, la tarjeta crece y muestra "reproducir". Con un género elegido (CAT-04) o una búsqueda, todo va en cuadrícula. Sin scroll horizontal de la página en el teléfono (UI-01). |
| CAT-09 | **Detalle de una película** (`/dashboard/movie/<slug>`): imagen horizontal de fondo (o el póster borroso) con acercamiento lento y el tinte de su color, **logo** (o el título), título original si es distinto, año · duración · géneros y sinopsis. Botón principal **"Reproducir"** o, si va a medias, **"Continuar desde 40:00"** con su barra de progreso y lo que queda. **"Ver tráiler"** (si hay) abre el video de YouTube (youtube-nocookie, solo al abrir) en una ventana que se cierra con Esc, el botón o tocando fuera. "Agregar a lista" y fila de **Reparto** (foto, nombre y personaje). Borrador → 404 para un `user` (vista previa para admin); un episodio o un slug inexistente → 404. La portada (CAT-07) tiene **"Más información"** hacia aquí. |
| CAT-10 | **"Más como esta"** en el detalle: hasta 12 películas publicadas que comparten al menos un género, primero las que comparten más y, a igualdad, la publicada más recientemente; nunca la misma, ni borradores, ni episodios. Sin géneros no aparece. |
