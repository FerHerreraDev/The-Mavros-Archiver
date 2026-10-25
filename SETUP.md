# 🚀 Configuración Inicial - The Mavros Archiver

## 📋 Pasos para Configurar el Proyecto

### 1. Configurar Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```bash
cp .env.example .env.local
```

Luego edita `.env.local` y agrega tus credenciales de Supabase:

1. Ve a tu [Dashboard de Supabase](https://app.supabase.com)
2. Selecciona tu proyecto
3. Ve a **Settings** → **API**
4. Copia las siguientes credenciales:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
```

### 2. Instalar Dependencias (si no lo has hecho)

```bash
pnpm install
```

### 3. Configurar Supabase Dashboard

#### Habilitar Email Confirmation
1. Ve a **Authentication** → **Settings**
2. Activa **"Confirm email"**
3. Configura tus plantillas de email

#### Configurar Redirect URLs
1. Ve a **Authentication** → **URL Configuration**
2. Agrega las siguientes URLs permitidas:
   ```
   http://localhost:3000/**
   https://tu-dominio.com/**
   ```

#### Configurar Password Requirements
1. Ve a **Authentication** → **Settings**
2. Establece:
   - Mínimo: 8 caracteres
   - Máximo: 64 caracteres

### 4. Ejecutar el Proyecto

```bash
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## 📁 Estructura del Proyecto

```
/lib/
  /supabase/
    client.ts          # Cliente para componentes del navegador
    server.ts          # Cliente para Server Components/Actions
    middleware.ts      # Cliente para protección de rutas
  /validations/
    auth.schema.ts     # Schemas de validación con Zod
  /utils/
    cn.ts              # Utilidad para combinar clases CSS

/app/
  layout.tsx           # Layout principal
  page.tsx             # Página de inicio
  globals.css          # Estilos globales
```

---

## 🔐 Próximos Pasos para Implementar Login

### 1. Crear Estructura de Rutas

```
/app/
  (auth)/              # Route group para autenticación
    login/
      page.tsx
    register/
      page.tsx
```

### 2. Crear Server Actions

```
/lib/
  /actions/
    auth.actions.ts    # Login, registro, logout
```

### 3. Crear Componentes de UI

```
/components/
  /auth/
    login-form.tsx
    register-form.tsx
  /ui/
    button.tsx
    input.tsx
```

### 4. Implementar Middleware

Crear `middleware.ts` en la raíz para proteger rutas.

---

## 📚 Recursos

- [Documentación de Supabase Auth](https://supabase.com/docs/guides/auth)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Zod Documentation](https://zod.dev)

---

## ⚠️ Importante

- **NUNCA** compartas tu archivo `.env.local`
- **NUNCA** expongas `SUPABASE_SERVICE_ROLE_KEY` en el frontend
- Las variables `NEXT_PUBLIC_*` son públicas (se exponen al navegador)
- Siempre valida datos del usuario con Zod antes de procesarlos
