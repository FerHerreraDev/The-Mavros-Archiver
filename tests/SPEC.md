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
