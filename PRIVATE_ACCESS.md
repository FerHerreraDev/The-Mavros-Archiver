# 🔐 Sistema de Acceso Privado - The Mavros Archiver

## 📋 Decisión de Diseño

**Problema:** La aplicación es privada, no cualquiera debe poder registrarse.

**Solución Implementada:** Sistema de invitación por administrador.

---

## 🎯 Cómo Funciona

### **Para Usuarios Regulares:**
1. ❌ **NO pueden auto-registrarse** - No hay formulario de registro público
2. ✅ **Reciben invitación** - Admin crea su cuenta
3. ✅ **Activan cuenta** - Reciben email con link para establecer password
4. ✅ **Inician sesión** - Usan `/login` normalmente

### **Para Administradores:**
1. ✅ **Acceden a `/dashboard/users`** (próximamente)
2. ✅ **Crean cuentas** - Ingresan email del nuevo usuario
3. ✅ **Sistema envía invitación** - Email automático con link de activación
4. ✅ **Gestionan usuarios** - Pueden desactivar/eliminar accesos

---

## 🛡️ Middleware de Protección

### **Archivo:** `middleware.ts`

### ¿Qué Hace?

**1. Protege Rutas Privadas**
```typescript
// Cualquier ruta que empiece con /dashboard
const isProtectedRoute = request.nextUrl.pathname.startsWith('/dashboard')

if (isProtectedRoute && !user) {
  // Redirigir a /login
  return NextResponse.redirect('/login')
}
```

**2. Redirige Usuarios Autenticados**
```typescript
// Si ya estás logueado e intentas ir a /login
if (isAuthRoute && user) {
  // Redirigir a /dashboard
  return NextResponse.redirect('/dashboard')
}
```

**3. Preserva Destino Original**
```typescript
// Si intentas ir a /dashboard/users sin login
// Te redirige a: /login?redirectTo=/dashboard/users
// Después del login, te lleva a /dashboard/users
```

---

## 🔄 Flujo de Autenticación

### **Usuario NO Autenticado:**

```
1. Intenta acceder a /dashboard
   ↓
2. Middleware detecta: no hay sesión
   ↓
3. Redirige a /login?redirectTo=/dashboard
   ↓
4. Usuario ingresa credenciales
   ↓
5. Login exitoso → Redirige a /dashboard
```

### **Usuario YA Autenticado:**

```
1. Intenta acceder a /login
   ↓
2. Middleware detecta: ya hay sesión
   ↓
3. Redirige automáticamente a /dashboard
```

---

## 📁 Estructura de Archivos

```
app/
├── (auth)/
│   ├── layout.tsx           # Layout para auth (logo, glassmorphism)
│   └── login/
│       └── page.tsx         # ✅ Página de login (pública)
│
├── dashboard/
│   ├── page.tsx             # ✅ Dashboard principal (protegida)
│   └── users/               # 🔜 Gestión de usuarios (solo admin)
│       └── page.tsx
│
middleware.ts                # ✅ Protección de rutas
```

---

## 🎨 Página de Dashboard

### **Características:**

**1. Verificación Server-Side**
```typescript
const { data: { user } } = await supabase.auth.getUser()

if (!user) {
  redirect('/login')
}
```

**2. Información del Usuario**
- Email
- User ID
- Estado (Active)

**3. Botón de Logout**
```typescript
<form action={logoutAction}>
  <button type="submit">Sign Out</button>
</form>
```

---

## 🚀 Próximos Pasos

### **Fase 1: Sistema de Roles** 🔜

**Agregar campo `role` a usuarios:**
```sql
-- En Supabase SQL Editor
ALTER TABLE auth.users 
ADD COLUMN raw_user_meta_data JSONB DEFAULT '{"role": "user"}';

-- Crear primer admin
UPDATE auth.users 
SET raw_user_meta_data = '{"role": "admin"}'
WHERE email = 'admin@mavros.com';
```

### **Fase 2: Admin Panel** 🔜

**Crear `/dashboard/users` (solo admin):**
- Ver lista de usuarios
- Invitar nuevos usuarios
- Desactivar/eliminar usuarios
- Ver logs de acceso

**Función `inviteUser`:**
```typescript
export async function inviteUser(email: string) {
  // 1. Verificar que quien invita es admin
  // 2. Crear usuario en Supabase
  // 3. Enviar email de invitación
  // 4. Log de auditoría
}
```

### **Fase 3: Email Templates** 🔜

**Personalizar emails de Supabase:**
- Email de invitación
- Email de bienvenida
- Email de cambio de password

---

## 🔒 Seguridad Implementada

### ✅ **Protecciones Actuales:**

1. **Middleware** - Bloquea acceso no autorizado
2. **Server-Side Verification** - Doble verificación en páginas
3. **Rate Limiting** - 5 intentos de login por minuto
4. **HTTP-only Cookies** - Sesiones seguras
5. **No registro público** - Solo invitación

### 🔜 **Próximas Protecciones:**

6. **Sistema de Roles** - Admin vs User
7. **Auditoría** - Log de todas las acciones
8. **2FA** - Autenticación de dos factores (opcional)
9. **IP Whitelist** - Solo IPs autorizadas (opcional)

---

## 📝 Cómo Crear el Primer Usuario

### **Opción A: Desde Supabase Dashboard**

1. Ve a tu proyecto en Supabase
2. **Authentication** → **Users** → **Add User**
3. Ingresa:
   - Email: `admin@mavros.com`
   - Password: `tu_password_seguro`
   - ✅ **Auto Confirm User** (marcar)
4. Click **Create User**

### **Opción B: Desde SQL Editor**

```sql
-- Crear usuario admin
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@mavros.com',
  crypt('TuPasswordSeguro123!', gen_salt('bf')),
  NOW(),
  '{"role": "admin"}'::jsonb,
  NOW(),
  NOW()
);
```

---

## 🧪 Probar el Sistema

### **1. Crear Usuario**
- Usa una de las opciones de arriba

### **2. Probar Login**
```
1. Ve a http://localhost:3000/login
2. Ingresa credenciales
3. Deberías ser redirigido a /dashboard
```

### **3. Probar Protección**
```
1. Abre ventana incógnita
2. Intenta ir a http://localhost:3000/dashboard
3. Deberías ser redirigido a /login
```

### **4. Probar Logout**
```
1. En /dashboard, click "Sign Out"
2. Deberías ser redirigido a /
3. Intentar ir a /dashboard → redirige a /login
```

---

## 🎯 Ventajas de Este Sistema

### **vs Registro Público:**

| Aspecto | Registro Público | Sistema Actual |
|---------|------------------|----------------|
| **Control** | ❌ Cualquiera se registra | ✅ Solo invitados |
| **Spam/Bots** | ❌ Problema constante | ✅ Imposible |
| **Auditoría** | ⚠️ Difícil rastrear | ✅ Sabes quién invitó |
| **Seguridad** | ⚠️ Superficie de ataque | ✅ Mínima |
| **Mantenimiento** | ⚠️ Limpiar usuarios fake | ✅ Solo usuarios reales |

### **vs Códigos de Invitación:**

| Aspecto | Códigos | Sistema Actual |
|---------|---------|----------------|
| **Complejidad** | ⚠️ Generar/validar códigos | ✅ Simple |
| **UX** | ⚠️ Usuario necesita código | ✅ Directo |
| **Seguridad** | ⚠️ Código puede filtrarse | ✅ Email personal |
| **Control** | ⚠️ No sabes quién usó código | ✅ Sabes exactamente quién |

---

## 📚 Referencias

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [OWASP Access Control](https://owasp.org/www-community/Access_Control)
