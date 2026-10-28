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
| VID-01 | Existe un `master.m3u8` con al menos 3 calidades (resoluciones distintas), cada una con `BANDWIDTH`, `RESOLUTION` y `CODECS`. |
| VID-02 | Cada calidad es VOD completa (`#EXT-X-PLAYLIST-TYPE:VOD` y `#EXT-X-ENDLIST`). |
| VID-03 | Todos los segmentos, salvo el último, duran 6 s (±0.1 s); ninguno supera `#EXT-X-TARGETDURATION`. |
| VID-04 | Las calidades están alineadas: mismo número de segmentos y la misma duración en cada posición (±0.05 s), para cambiar de calidad sin saltos. |
| VID-05 | La duración total de cada calidad coincide con la del archivo original (±1 s). |
| VID-06 | La calidad más alta conserva la resolución original, y ninguna calidad tiene más resolución que el original. |
| VID-07 | En R2, cada playlist y cada segmento responde 200 con su tipo correcto (`application/vnd.apple.mpegurl` / `video/mp2t`) y permite CORS. |
| VID-08 | Calidad por resolución (H.264, CRF con tope de bitrate y búfer de 2× el tope). Topes: **2160p 16 Mbps, 1440p 9, 1080p 6, 720p 3, 480p 1.4, 360p 0.8**. Cada calidad usa el tope de **su** resolución (un original 4K no queda limitado al tope de 1080p). Debajo del original se generan 1080p, 720p, 480p y 360p (solo las menores que el original). En un video real codificado, el **video** de ningún segmento supera su tope en más de 25 % (el audio se copia del original y no cuenta) y la calidad 1080p de un video exigente usa más de 3.5 Mbps (el tope anterior era 3). |
| VID-09 | Carpeta de entrada en la Mac (`~/Movies/Mavros/Entrada`): cada video (mkv, mp4, mov, m4v, avi) que termine de copiarse (tamaño sin cambios ≥ 30 s) se convierte, verifica y sube solo a `movies/<slug>`, y queda como **borrador** con título y año sacados del nombre (`Perfect Blue (1997).mkv` → "Perfect Blue", 1997, slug `perfect-blue`; si el slug existe se agrega `-2`, `-3`…). El original pasa a `Procesadas`; si algo falla, a `Errores` con un `.log` de la causa. Nunca procesa dos veces el mismo archivo ni corre dos veces a la vez. |
| VID-10 | Mientras procesa una película, en `Entrada` aparece un archivo cuyo **nombre** muestra el paso (convirtiendo / verificando / subiendo), una barra, el porcentaje y el tiempo que falta (estimado con lo que lleva); se actualiza solo y desaparece al terminar. `pnpm movie:progreso` muestra lo mismo en la Terminal. |

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
| PLY-04 | Con token válido entrega `.m3u8` y `.ts` con su tipo correcto, CORS y soporte de `Range` (206). Archivo inexistente → 404. Cualquier otro tipo de archivo o ruta con `..` → 403/404, nunca se sirve. |
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
| CAT-03 | Cada tarjeta muestra póster (o un placeholder), título, año y duración, y lleva a `/dashboard/watch/<slug>`. |
| CAT-04 | Filtro por género: los chips salen de los géneros de las películas publicadas; elegir uno filtra y queda en la URL (`?genre=…`); "Todas" quita el filtro. Un género que no existe muestra el estado vacío. |
| CAT-05 | Sin películas, se muestra un estado vacío claro (no una cuadrícula vacía). |
| CAT-06 | "Seguir viendo" muestra las películas que el usuario dejó a medias (entre 5 % y 95 %), la más reciente primero, con barra de progreso; no aparece si no hay ninguna. |

### Ver película (`/dashboard/watch/<slug>`)

| ID | Requisito |
|---|---|
| WATCH-01 | Una película publicada se puede ver; un borrador solo lo ve un admin (vista previa). Slug inexistente o borrador para un `user` → 404. |
| WATCH-02 | El video se reproduce de verdad en el navegador (avanza el tiempo) usando la URL firmada del Worker; incluye controles, pantalla completa y selección de calidad. |
| WATCH-03 | Si el token caduca o el Worker responde 403 durante la reproducción, el reproductor pide una URL nueva a `/api/playback` y sigue desde el mismo punto, sin que el usuario haga nada. |
| WATCH-04 | La página muestra título, año, duración, géneros y sinopsis. |

### Progreso (`watch_progress`)

| ID | Requisito |
|---|---|
| PRG-01 | Mientras se ve, el progreso se guarda (cada ~10 s, al pausar y al salir). Lo escribe el propio cliente con su sesión (igual que hará Android). |
| PRG-06 | Salir de la película (navegar a otra página, cerrar la pestaña) mientras se reproduce **nunca** borra el progreso ni lo regresa a 0, y guarda la posición en la que se salió (±1 s), también al **cerrar la pestaña**. |
| PRG-02 | Al volver a abrir la película, arranca donde se quedó. Si estaba casi terminada (≥ 95 %) o recién empezada (< 10 s), arranca desde el principio. |
| PRG-03 | RLS: cada usuario solo lee y escribe **su** progreso; no puede leer ni escribir el de otro ni a nombre de otro. Anónimos nada. |
| PRG-04 | Solo se puede guardar progreso de películas que el usuario puede ver (no de borradores ajenos); la posición está entre 0 y la duración de la película. |
| PRG-05 | Hay un solo registro por usuario y película (guardar otra vez lo actualiza); borrar la película o el usuario borra su progreso. |

## Fase 6 — Producción

### Rate limit

| ID | Requisito |
|---|---|
| OPS-01 | El límite de intentos (login, recuperación, invitaciones, elegir contraseña) se cuenta en la base de datos, así que se respeta aunque la app corra en varias instancias (Vercel). Mismos límites que AUTH-04: 5 por minuto por clave. |
| OPS-02 | Contar es atómico: muchos intentos simultáneos no pueden pasar del límite. Si el contador no está disponible, la acción se bloquea (falla cerrado), nunca deja pasar sin contar. |
| OPS-03 | Solo el servidor puede usar el contador: ni anónimos ni usuarios pueden llamarlo, leerlo ni reiniciarlo desde el cliente. |
| OPS-04 | La IP del cliente se toma del header que pone la plataforma (`x-vercel-forwarded-for`, `x-real-ip`) o del **primer** valor de `x-forwarded-for`; valores agregados por el cliente detrás no cambian la clave. |

### Páginas y headers

| ID | Requisito |
|---|---|
| OPS-05 | Una ruta inexistente muestra una página 404 propia con enlace de vuelta, con el estilo de la app. |
| OPS-06 | Un error inesperado en el dashboard muestra una página de error propia con "Reintentar", sin filtrar detalles técnicos al usuario. |
| OPS-07 | Todas las respuestas llevan headers de seguridad: no se puede incrustar la app en un iframe (`X-Frame-Options: DENY` y `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva y HSTS. |
| OPS-08 | Next 16: el control de rutas usa la convención `proxy` (no la obsoleta `middleware`), con el mismo comportamiento (ACC-01..ACC-06 siguen pasando). |

## Fase A1 — Login por código para la TV (Device Authorization Grant, RFC 8628)

La tele pide un código, el usuario lo aprueba desde un teléfono/computadora con sesión, y la tele recibe una sesión de Supabase de ese usuario. Desde ahí usa RLS y `/api/playback` (Bearer) como cualquier cliente.

### Pedir código (`POST /api/device/code`)

| ID | Requisito |
|---|---|
| DEV-01 | Sin sesión, devuelve `device_code` (secreto, ≥ 256 bits aleatorios), `user_code` de 8 caracteres en formato `XXXX-XXXX` con un alfabeto sin caracteres confundibles (sin `0 O 1 I L`), `verification_uri` (`<sitio>/link`), `verification_uri_complete` (con el código), `expires_in` = 600 y `interval` = 5. Está limitado por IP. |

### Sondeo (`POST /api/device/token` con `{ device_code }`)

| ID | Requisito |
|---|---|
| DEV-02 | Antes de aprobar → 400 `authorization_pending`. Si sondea más rápido que `interval` → 400 `slow_down`. `device_code` desconocido o basura → 400 `invalid_grant`. Código caducado → 400 `expired_token`. |
| DEV-04 | Tras aprobar, el siguiente sondeo devuelve 200 con `access_token`, `refresh_token`, `expires_at` y el usuario; la sesión es de **quien aprobó** y funciona (el access token identifica a ese usuario y el refresh token renueva). Se entrega **una sola vez**: sondeos posteriores → `invalid_grant`, también si llegan dos a la vez. |
| DEV-05 | Si el usuario rechaza → `access_denied`, y ese código ya no se puede aprobar. |
| DEV-08 | Si el usuario que aprobó está desactivado cuando la tele sondea → `access_denied`, sin sesión. |

### Aprobar (`/link`)

| ID | Requisito |
|---|---|
| DEV-03 | `/link` requiere sesión; sin sesión lleva a `/login` y, tras entrar, vuelve a `/link` **con el código** (`?code=` se conserva). Un invitado sin contraseña va antes a `/set-password`. El código se acepta con o sin guion, en minúsculas o con espacios. |
| DEV-06 | Solo se aprueba un código pendiente y vigente; uno caducado, ya aprobado, rechazado o usado da un error claro y no cambia nada (un segundo usuario no puede "robar" un código ya aprobado). |
| DEV-10 | Antes de aprobar se muestra qué dispositivo lo pide y hace cuánto, con el aviso de aprobar solo si el código aparece en **tu propia pantalla**. |
| DEV-11 | Aprobar/rechazar está limitado por usuario (5 por minuto) para que no se puedan adivinar códigos. |

### Seguridad de los datos

| ID | Requisito |
|---|---|
| DEV-07 | Los clientes (anónimos o con sesión) no pueden leer ni escribir los códigos ni llamar sus funciones. La base guarda solo el **hash** del `device_code`: aunque se filtrara la tabla, no se podría canjear. |
| DEV-09 | La sesión de la tele es una sesión normal: respeta RLS (un `user` ve publicadas, no borradores) y sirve para `/api/playback` con Bearer. |

## Fase A2 — App Android (teléfono): base, login y catálogo

Proyecto Kotlin en `android/`. Habla con el mismo backend que la web (Supabase con la clave pública + RLS). Las pruebas JVM de integración corren contra el Supabase **local**, igual que las de la web.

### Configuración y seguridad

| ID | Requisito |
|---|---|
| MOB-01 | La app solo lleva la URL de Supabase, la clave **pública** y la URL del sitio. Ni la service role key ni el secreto del token de video aparecen en el código, en la configuración ni en el APK. |
| MOB-02 | Hay dos entornos: `local` (emulador → Supabase local por `10.0.2.2`, único lugar donde se permite HTTP sin cifrar) y `prod` (HTTPS a producción). |

### Sesión

| ID | Requisito |
|---|---|
| MOB-03 | Login con email y contraseña. Validación previa igual que la web (email válido, contraseña ≥ 8). Credenciales incorrectas, usuario desactivado o invitado sin contraseña → el mismo mensaje genérico, sin revelar si la cuenta existe. |
| MOB-04 | La sesión se guarda en el almacenamiento privado de la app: al cerrar y abrir la app sigue dentro, sin volver a pedir contraseña. Esto vale **aunque el token de acceso ya haya caducado** (dura 1 h): la app lo renueva con el refresh token; un token caducado nunca cierra la sesión. |
| MOB-05 | Cerrar sesión borra la sesión guardada y vuelve al login. |
| MOB-06 | Si la sesión deja de ser válida (usuario desactivado, sesiones revocadas), la app vuelve al login sola. |

### Catálogo y detalle

| ID | Requisito |
|---|---|
| MOB-07 | El catálogo muestra solo películas publicadas (aunque el usuario sea admin), las más recientes primero; "Seguir viendo" con las que van entre 5 % y 95 %, la más reciente primero; filtro por género. Mismas reglas que CAT-01..CAT-06. |
| MOB-08 | El detalle muestra póster, título, año, duración, géneros y sinopsis, y un botón "Reproducir" o "Continuar desde mm:ss" según el progreso (reglas de PRG-02). Un borrador o un id inexistente → "no disponible". |
| MOB-09 | Sin conexión o con error del servidor, cada pantalla muestra un error claro con "Reintentar" (nunca se queda cargando para siempre ni se cierra la app). |
| MOB-11 | Todo texto de la app se lee contra el fondo (mismo criterio que UI-02: contraste WCAG AA). |
| MOB-10 | Las reglas de progreso (`resumePosition`, `isInProgress`) dan exactamente los mismos resultados que las de la web. |

## Fase A3 — Reproductor nativo en Android (Media3)

Mismas reglas que la web (PLY, WATCH, PRG), con el reproductor del sistema. La lógica pura vive en `core:model` y se prueba con los mismos casos que la web.

| ID | Requisito |
|---|---|
| MOB-13 | "Reproducir" / "Continuar desde" abre el reproductor a pantalla completa (horizontal) con el video HLS. La URL se pide a `/api/playback/<id>` con `Authorization: Bearer <access token>` (PLY-06); arranca en la posición de PRG-02. Sin sesión válida → login; película no disponible → mensaje, nunca un crash. |
| MOB-14 | Controles: reproducir/pausa, ±10 s, barra de tiempo, título y **calidad** (Automática o una resolución disponible). La pantalla no se apaga mientras se reproduce. |
| MOB-15 | El progreso se guarda igual que en la web (PRG-01): cada ~10 s mientras reproduce, al pausar y al salir (atrás, cerrar la app, pasar a segundo plano). Salir **nunca** guarda 0 ni retrocede el progreso por no haber arrancado aún (PRG-06). La posición se guarda dentro de 0…duración. |
| MOB-16 | El token del video se renueva solo: 5 min antes de caducar y ante cualquier 403 del Worker se pide una URL nueva y el video sigue en el mismo punto, sin acción del usuario (WATCH-03). Cambiar el token en una URL sigue la misma regla que la web (`swapToken`, casos compartidos). |
| MOB-17 | Salir a inicio mientras reproduce pasa a **Picture-in-Picture** (ventana flotante) y el video sigue. Tocar la notificación de medios abre el reproductor a pantalla completa, también si estaba en PiP. |
| MOB-18 | Controles en la pantalla de bloqueo y en la notificación de medios (reproducir/pausa, título) mientras hay reproducción. |
| MOB-19 | Al volver del reproductor, el detalle y "Seguir viendo" muestran el progreso nuevo. |

## Fase A4 — App para la tele (Google TV)

App aparte (`app-tv`) para Google TV / Android TV 9+, con la misma lógica que el teléfono (módulos `core:*`). Se maneja solo con el control remoto.

| ID | Requisito |
|---|---|
| TV-01 | Sin sesión, la tele pide un código a `/api/device/code` y muestra el código `XXXX-XXXX` grande, la dirección para escribirlo y un **QR** de `verification_uri_complete`. Sondea `/api/device/token` cada `interval` s; ante `slow_down` suma 5 s al intervalo (RFC 8628). Nunca pide email ni contraseña en la tele. |
| TV-02 | Al aprobarse, la sesión recibida (access + refresh token) se guarda como una sesión normal de Supabase y entra al catálogo. Al abrir otra vez sigue dentro (mismas reglas que MOB-04, MOB-06). |
| TV-03 | Código caducado o rechazado → pide uno nuevo solo y avisa por qué ("El código caducó", "Se rechazó"). Si no puede pedir código, dice **la causa real**: sin red → "Sin conexión"; el servidor no respondió bien (p. ej. demasiados intentos) → "No se pudo pedir un código". Reintenta solo, cada vez más espaciado (5 s, 10 s, 20 s… hasta 60 s) para no insistir sobre el límite de intentos. |
| TV-04 | Catálogo en filas: "Seguir viendo" (con barra de progreso), "Recién agregadas" y una por género. Se recorre con las flechas; la tarjeta enfocada se agranda y se resalta. Skeleton mientras carga (LOAD-01). |
| TV-05 | Detalle: póster, título, año, duración, géneros, sinopsis y botón "Reproducir" / "Continuar desde mm:ss" (PRG-02), enfocado al abrir. |
| TV-06 | Reproductor a pantalla completa con las mismas reglas que el teléfono: progreso (MOB-15) y token (MOB-16). Control remoto: con los **controles ocultos**, OK los muestra (enfocando ⏯) y ←/→ adelantan/atrasan 10 s; con los **controles visibles**, las flechas se mueven entre los botones (⏪10, ⏯, ⏩10, **Calidad**) y OK activa el botón enfocado, nunca pausa por su cuenta. Las teclas ⏯/⏪/⏩ del control siempre actúan. Atrás oculta los controles y, si ya están ocultos, sale guardando. Los controles se ocultan solos tras 5 s sin tocar nada mientras reproduce, pero **no** mientras la lista de calidades está abierta. **Calidad** ofrece "Automática" y cada resolución disponible (igual que MOB-14). |
| TV-07 | Se puede cerrar sesión desde la tele (vuelve a la pantalla del código). |
| TV-08 | La app aparece en el inicio de Google TV (banner) y solo pide permiso de internet. |

## Estados de carga (web y Android)

| ID | Requisito |
|---|---|
| MOB-12 | Al abrir la app Android con sesión guardada, antes del catálogo solo puede verse el estado de carga: nunca "bóveda vacía" ni un error. |
| LOAD-01 | Mientras carga el catálogo se ve un **skeleton con la forma real** (títulos, chips y pósters 2:3) con un brillo que lo recorre (shimmer, ciclo de ~1.6 s). Si los datos llegan en menos de 200 ms el skeleton no llega a verse (sin parpadeo). Con "reducir movimiento" activado el skeleton no se anima. |
| LOAD-02 | Cada póster muestra **al instante** una vista previa borrosa con sus colores reales (ThumbHash) y se funde con la imagen real al cargar (~300 ms). Sin ThumbHash: el color de tarjeta. Si la imagen falla: la tarjeta con el título. Con "reducir movimiento" la imagen aparece sin desvanecido. |
| LOAD-03 | El ThumbHash se calcula en el servidor al guardar una película con póster y se guarda junto a ella. Si el póster no se puede leer **o el procesador de imágenes no carga en el servidor**, la película se guarda igual (sin vista previa) y las páginas de crear/editar abren normal. |
| LOAD-04 | El decodificador de ThumbHash de Android produce los mismos colores que el decodificador de referencia de la web (casos compartidos). |
| LOAD-05 | Para calcularlo, el servidor solo descarga pósters por **https**, de hasta 15 MB, con tipo `image/*`, en menos de 10 s y nunca de direcciones locales o de red privada (evita que el servidor sea usado para leer la red interna). |
| LOAD-07 | Al guardar una película con póster, el servidor guarda **una copia optimizada** (WebP, máx. 600 px de ancho, sin agrandar imágenes chicas) en el almacenamiento propio (bucket `posters`) y la película la usa: web y Android cargan esa copia en vez de la URL externa. El nombre del archivo es el hash de su contenido (caché de 1 año). Solo un admin puede subir/borrar archivos ahí; cualquiera con la URL los lee, pero nadie puede listar el bucket. Si algo falla, la película se guarda igual y se usa la URL original. |
| LOAD-06 | Toda navegación dentro de la app (enlaces del menú, pestañas, géneros, Cancelar…) muestra **al instante** una barra de progreso fina arriba, hasta que la página nueva aparece. Un enlace a la página en la que ya estás no la activa. Con "reducir movimiento" la barra se ve pero no se anima. |
| UX-01 | Mientras se envía algo (un formulario o un botón de acción), sus campos y **todos** sus botones quedan bloqueados y el botón tocado muestra un indicador girando (anunciado "Cargando…"). Un segundo clic o tap no vuelve a enviar los datos. Aplica a web y Android. |

## Fase S — Series

Una serie agrupa episodios. Cada episodio es un video como una película (misma tabla `movies`, mismo token, mismo progreso y mismo reproductor) con su serie, temporada y número. Las reglas de orden y de "qué sigue" son funciones puras con casos compartidos entre la web y Android (`tests/fixtures/series-cases.json`).

### Base de datos (`series` y episodios)

| ID | Requisito |
|---|---|
| SER-01 | `series`: un usuario ve solo las publicadas; un admin ve todas; un anónimo ninguna. Solo un admin crea, edita o borra, desde cualquier cliente (mismas reglas que MOV-01..MOV-04). |
| SER-02 | Integridad de `series` igual que MOV-05/MOV-06 (sin video ni duración): slug único con formato, título 1–200, año 1888–2100, póster https o vacío, estado `draft`/`published`; `published_at` se fija al publicar y se borra al volver a borrador; `updated_at` se actualiza solo. |
| SER-03 | Un episodio es una fila de `movies` con `series_id`, `season_number` (0–999; 0 = especiales) y `episode_number` (1–9999): los tres juntos o ninguno. Dos episodios de la misma serie no pueden tener la misma temporada y número. Borrar una serie borra sus episodios (y el progreso de ellos); los archivos en R2 no se tocan. |
| SER-04 | Un `user` solo ve un episodio si **el episodio y su serie** están publicados: al listar, por id/slug, al pedir `/api/playback/<id>` y al guardar progreso. Un admin ve todos. |

### Panel (`/dashboard/admin/series`)

| ID | Requisito |
|---|---|
| SER-05 | El panel tiene la pestaña **Series**: lista con estado y número de episodios; crear y editar con los campos de una película salvo el video (título, slug que se genera solo, título original, sinopsis, año, géneros, póster con vista previa y copia optimizada como LOAD-03/LOAD-07); publicar, despublicar y borrar (pide confirmación y dice cuántos episodios se borran). Mismas reglas de acceso que MOV-12. |
| SER-06 | El formulario de película permite marcarla como episodio: serie, temporada y episodio. Temporada/episodio repetidos en la misma serie → error en el campo. En la lista de películas cada episodio dice a qué serie pertenece y su "T1:E2". |
| SER-07 | La página de edición de una serie lista sus episodios en orden (SER-13) con su estado y enlace a editar, y un botón **Publicar borradores (N)** que publica de una vez todos los episodios en borrador de esa serie. |

### Catálogo y página de la serie

| ID | Requisito |
|---|---|
| SER-08 | En el catálogo los episodios nunca aparecen sueltos en "Recién agregadas". Las series publicadas con al menos un episodio visible salen en la sección **Series** (la publicada más recientemente primero), con póster, título, año y "N temporadas" (o "N episodios" si es una sola), y llevan a `/dashboard/series/<slug>`. El filtro de género también filtra las series y sus géneros aparecen en los chips. El estado vacío solo sale si no hay ni películas ni series. |
| SER-09 | `/dashboard/series/<slug>` muestra póster, título, año, géneros y sinopsis; un selector de temporada (si hay más de una) y la lista de episodios en orden con número, título, duración y barra de progreso si va a medias. Una serie en borrador o inexistente → 404 para un `user`; un admin la ve como vista previa. Un `user` solo ve episodios publicados. |
| SER-10 | Botón principal de la serie (**qué sigue**): sin nada visto → "Reproducir T1:E1" (el primero en orden). Si no, se toma el episodio visto más recientemente: si no está terminado (< 95 %) → ese episodio ("Continuar T1:E4" si `resumePosition` > 0, si no "Reproducir T1:E4"); si está terminado → el siguiente en orden desde el principio ("Reproducir T1:E5"); si era el último → el primero ("Volver a ver T1:E1"). |
| SER-11 | "Seguir viendo" tiene **a lo más una entrada por serie**: el episodio que da SER-10, solo si va a medias (5 %–95 %) o si es el siguiente de uno terminado (entra con progreso 0). Una serie terminada (último episodio terminado) no aparece. La tarjeta muestra el título de la serie y "T1:E5 · título del episodio"; en la web lleva a ese episodio (en Android, ver SER-20). Las películas siguen la regla CAT-06. Todo ordenado por la última vez que se vio. |
| SER-12 | Ver un episodio (`/dashboard/watch/<slug>`): muestra la serie (enlace a su página), "Temporada 1 · Episodio 2" y el título del episodio. Al terminar, si hay siguiente episodio visible aparece **"Siguiente episodio"** con cuenta regresiva de 10 s que lo abre sola (desde el principio, PRG-02), con botones "Ver ahora" y "Cancelar". En el último episodio no aparece. |
| SER-13 | Orden de episodios: temporada ascendente y episodio ascendente; la temporada 0 (especiales) va al final. "Siguiente" cruza temporadas (último de T1 → T2:E1). Las mismas reglas dan exactamente lo mismo en web y Android (casos compartidos). |

### Página de la serie al estilo de una plataforma de streaming

| ID | Requisito |
|---|---|
| SER-17 | La página de la serie abre con una **imagen horizontal** de fondo (con su vista previa borrosa mientras carga, LOAD-02) y encima: título, año, temporadas, géneros, sinopsis, el botón de SER-10 y "Agregar a lista". Sin imagen horizontal, se usa el póster como fondo. |
| SER-18 | Los episodios se eligen por temporada (selector) y cada uno muestra **su imagen 16:9** (con la barra de progreso encima si va a medias), número, título, duración y las primeras líneas de su sinopsis. El episodio de SER-10 queda resaltado. Lo mismo en el teléfono; en la tele la imagen horizontal queda de fondo y los episodios van en una fila de tarjetas 16:9 que se recorre con el control. |
| SER-19 | En el panel, la serie tiene el campo **Imagen horizontal (URL)** (con copia optimizada y vista previa como los pósters, LOAD-03/LOAD-07) y en un episodio el póster es **su imagen**. |

### Carpeta de la Mac (VID-09)

| ID | Requisito |
|---|---|
| SER-14 | La carpeta de entrada reconoce episodios por `S01E02` (o `1x02`, sin importar mayúsculas): `Breaking Bad (2008) - S01E02 - Cat's in the Bag.mkv`, `Breaking.Bad.S01E02.mkv` o dentro de una carpeta `Entrada/Breaking Bad (2008)/S01E02.mkv` (si el nombre del archivo no trae la serie, se toma de la primera carpeta; carpetas como `Temporada 1` se ignoran). La serie se busca por slug: si existe se usa; si no, se crea como borrador con título y año. El episodio queda en borrador con slug `<serie>-s01e02`, título del archivo o "Episodio 2" y video en `series/<serie>/s01e02/`. Si ese episodio ya existe va a Errores explicando por qué, sin subir nada. Al terminar, el archivo pasa a Procesadas dentro de su misma carpeta. |

### Android (teléfono y tele)

| ID | Requisito |
|---|---|
| SER-15 | Teléfono y tele muestran la sección/fila **Series** (SER-08) y "Seguir viendo" con episodios (SER-11). La pantalla de la serie tiene las temporadas, los episodios (SER-09) y el botón de SER-10. En la tele todo se recorre con el control remoto. |
| SER-20 | En Android (teléfono y tele), la tarjeta de una serie en "Seguir viendo" abre **la página de la serie** (no un capítulo suelto): el botón de SER-10 ("Continuar T1:E5 desde mm:ss") queda listo —enfocado en la tele, así que un OK lo reanuda— y los episodios de esa temporada a la vista. El detalle de un episodio abierto desde otro lado (p. ej. una lista) tiene **Ver episodios**, que lleva a su serie. |
| SER-16 | En el reproductor de Android, al terminar un episodio con siguiente aparece "Siguiente episodio" con cuenta regresiva de 10 s, "Ver ahora" (enfocado en la tele) y "Cancelar"; al llegar a 0 o con "Ver ahora" reproduce el siguiente desde el principio sin salir del reproductor, con su propio progreso y token (MOB-15, MOB-16). |

## Fase P — Listas personales (playlists)

Cada usuario arma sus propias listas con películas y series, en el orden que quiera, y las puede reproducir de corrido. Son privadas: nadie más las ve, ni un admin. La regla de "qué sigue en la lista" es pura y tiene casos compartidos web ↔ Android (`tests/fixtures/playlist-cases.json`).

### Base de datos (`playlists`, `playlist_items`)

| ID | Requisito |
|---|---|
| PL-01 | Una lista tiene dueño (quien la crea), nombre de 1 a 100 caracteres (sin espacios sobrantes) y fechas. Cada usuario solo ve, crea, renombra y borra **sus** listas; no puede crearlas a nombre de otro. Un admin tampoco ve las ajenas. Un anónimo nada. |
| PL-02 | Un elemento de la lista es **una** película/episodio **o** una serie (nunca ambos ni ninguno) con su posición. No se repite lo mismo en una lista. Solo el dueño de la lista lee y cambia sus elementos, y solo puede agregar lo que puede ver (publicado). Borrar la lista borra sus elementos; borrar una película o serie la quita de las listas. |

### Web

| ID | Requisito |
|---|---|
| PL-03 | **Mis listas** (`/dashboard/lists`, enlace en el menú): crear una lista con nombre, ver cada una con cuántos elementos tiene, renombrar y borrar (pide confirmación). Sin listas, un estado vacío que explica cómo agregar. |
| PL-04 | En la página de una película/episodio y en la de una serie hay **Agregar a lista**: muestra mis listas marcando en cuáles ya está; tocar una agrega o quita; se puede crear una lista nueva ahí mismo y queda agregado. Lo nuevo va al final de la lista. |
| PL-05 | La página de una lista (`/dashboard/lists/<id>`) muestra sus elementos en orden con póster y título (las series dicen "Serie"); se pueden quitar y mover arriba/abajo. **Reproducir lista** empieza por el primer elemento (una serie, por su episodio de SER-10). Una lista ajena o inexistente → 404. Los elementos que dejaron de estar publicados no aparecen. |
| PL-06 | Al reproducir desde una lista, al terminar aparece **"Siguiente en la lista"** con cuenta regresiva de 10 s (como SER-12): si lo que terminó es un episodio de una serie de la lista y la serie tiene siguiente episodio, sigue la serie; si no, el siguiente elemento de la lista (una película, o el episodio de SER-10 de una serie). En el último no aparece. |

### Android (teléfono y tele)

| ID | Requisito |
|---|---|
| PL-07 | Teléfono y tele tienen **Mis listas**: ver mis listas y abrir una para ver sus elementos en orden; tocar uno abre su detalle (película) o su página (serie). **Reproducir lista** como en PL-05 y, al terminar cada elemento, "Siguiente en la lista" como PL-06 (mismas reglas, casos compartidos). En el detalle y en la página de una serie hay **Agregar a lista** con mis listas marcadas (agrega o quita). |

## Fase T — Datos automáticos con TMDB

TMDB (themoviedb.org) es la base de datos gratuita de películas y series. Se usa solo para **llenar datos** (títulos, sinopsis, imágenes); la app sigue siendo la misma. La regla general: **TMDB nunca pisa lo que ya escribiste** y si TMDB falla o no encuentra nada, todo sigue funcionando como antes.

| ID | Requisito |
|---|---|
| TMDB-01 | La clave (`TMDB_API_KEY`) vive solo en el servidor y en la Mac (`.env.local`); nunca en el navegador, en el código del cliente ni en las apps Android. Sin clave, las funciones de TMDB dicen que falta configurarla y nada más cambia. |
| TMDB-02 | En el panel, editar una película o una serie tiene **Buscar en TMDB**: busca por el título (y el año si hay) y muestra hasta 5 resultados con póster, título y año. Al elegir uno se llenan **solo los campos vacíos** (título original, sinopsis, año, géneros, póster y, en series, la imagen horizontal) y se guarda su id de TMDB. El título nunca cambia. Las imágenes tienen copia optimizada y vista previa (LOAD-03/LOAD-07). |
| TMDB-03 | Una serie con TMDB tiene **Completar episodios desde TMDB**: a cada episodio le pone el título (solo si está vacío o es el genérico "Episodio N"), la sinopsis (si está vacía) y su imagen (si no tiene). Los textos van en español de México; si TMDB no tiene traducción, en inglés. |
| TMDB-04 | Carpeta de la Mac: una película nueva se busca en TMDB por nombre y año y, si hay resultado, se llena como TMDB-02. Una serie nueva igual; cada episodio toma título, sinopsis e imagen de TMDB (TMDB-03). Si el episodio no tiene imagen en TMDB se usa **un cuadro del propio video** (~25 % de la duración). Sin clave, sin red o sin resultado, sigue como antes: nunca manda el archivo a Errores por eso. |
| TMDB-05 | Los géneros de TMDB se guardan normalizados (MOV-10). Donde se muestran datos de TMDB se reconoce la fuente ("Datos e imágenes: TMDB"), como piden sus condiciones de uso. |
