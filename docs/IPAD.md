# Instalar la app en el iPad

La app del iPad es nativa (SwiftUI) y usa el mismo Supabase y la misma web que todo lo demás. Se
instala desde tu Mac con Xcode; no pasa por la App Store.

## Una sola vez

1. **Tu Apple ID en Xcode:** Xcode → Settings → Accounts → **+** → Apple ID. Sirve una cuenta
   gratis (no hace falta pagar el programa de desarrollador).
2. **Conecta el iPad por cable** a la Mac, desbloquéalo y toca **Confiar**.
3. **Modo de desarrollador en el iPad:** Ajustes → Privacidad y seguridad → **Modo de desarrollador**
   → activar. El iPad se reinicia; al volver, confirma **Activar**. (La opción aparece después de
   conectarlo a Xcode por primera vez; si no la ves, corre el paso de abajo una vez y vuelve a buscarla.)

## Instalar (y reinstalar)

```bash
ios/scripts/install-ipad.sh
```

- Compila la versión de **producción** (la misma base de datos y videos que la web), revisa que no
  lleve ningún secreto del servidor y la instala. La app aparece como **Mavros**.
- La primera vez que la abras puede decir "Desarrollador no confiable": Ajustes → General → **VPN y
  gestión de dispositivos** → tu Apple ID → **Confiar**.
- **Cuenta gratis:** Apple hace que la app deje de abrir a los **7 días**. Conecta el iPad y vuelve a
  correr el mismo comando; no pierdes la sesión ni el progreso (el progreso vive en el servidor).
  Con el programa de desarrollador de pago dura un año.
- Si tienes varios equipos en Xcode: `MAVROS_TEAM=<Team ID> ios/scripts/install-ipad.sh`. Si Apple
  responde que el identificador ya está ocupado: `MAVROS_BUNDLE_ID=com.tunombre.mavros ios/scripts/install-ipad.sh`.

Para revisar sin iPad ni Apple ID (compila sin firmar y busca secretos): `ios/scripts/install-ipad.sh --revisar`.

## Qué tiene

- Login con email y contraseña; la sesión queda en el Llavero del iPad.
- Catálogo: Seguir viendo, Recién agregadas, Series y filtro por género (vertical, horizontal y
  pantalla dividida).
- Página de la serie con temporadas, episodios, progreso y el botón de "qué sigue".
- Reproductor nativo: calidad automática, Picture in Picture, AirPlay a la tele, controles en la
  pantalla de bloqueo. Guarda el progreso y al terminar un episodio ofrece el siguiente con cuenta
  regresiva de 10 s.
- Mis listas, Reproducir lista ("Siguiente en la lista") y Agregar a lista.

## Para desarrollar

- Abrir en Xcode: `cd ios && scripts/gen-config.sh && xcodegen && open MavrosArchiver.xcodeproj`.
- Reglas y datos (sin simulador): `ios/scripts/test-kit.sh` (necesita `pnpm db:start`).
- Pruebas de la app en el simulador "iPad Mavros": `ios/scripts/ui-test.sh` (siembra datos en el
  Supabase local y levanta la web de pruebas y el video de prueba; necesita `.next-e2e`, que deja
  `pnpm test:e2e`).
