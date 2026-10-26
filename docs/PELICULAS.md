# Agregar una película

Tres pasos en tu Mac: convertir a HLS, subir a R2 y darla de alta en el panel.
Requisitos (una sola vez): `brew install ffmpeg rclone` y el remoto de rclone `videos-backup`
configurado con tus llaves de R2 (las llaves viven en la config de rclone, nunca en el repo).

## 1. Convertir a HLS

```bash
pnpm hls:encode "~/Movies/Mi Pelicula (2025).mkv" out/mi-pelicula
```

- Crea la calidad original + 720p / 480p / 360p (solo las menores que el original), con
  segmentos de 6 s alineados entre calidades. El audio se copia sin recodificar.
- Tarda: según la película y tu Mac, de unos minutos a un par de horas (`PRESET=medium` es más rápido
  y pesa un poco más; por defecto `slow`).
- Para probar rápido con solo 60 s: `pnpm hls:encode "<archivo>" out/prueba 60`.

## 2. Verificar y subir

```bash
pnpm hls:verify out/mi-pelicula --source "~/Movies/Mi Pelicula (2025).mkv"
pnpm r2:upload out/mi-pelicula movies/mi-pelicula
```

- `hls:verify` revisa las playlists antes de subir (VID-01..06): si algo falla, no subas.
- `r2:upload` sube primero los segmentos y al final las playlists, así nunca queda publicada una
  playlist que apunte a segmentos que faltan. Si se corta, vuelve a correrlo: salta lo ya subido.
- Usa siempre una **carpeta propia por película** (`movies/<slug>`): el token del video solo vale para
  esa carpeta.

## 3. Darla de alta

En la web: **Admin → Películas → Nueva película**.

- **Video (ruta en R2):** `movies/mi-pelicula/master.m3u8`. Al guardar, el servidor comprueba el
  video a través del Worker y saca la duración de la playlist.
- **Póster:** pega una URL `https://` de la imagen. El servidor guarda una copia optimizada y la
  vista previa borrosa; si la imagen original desaparece después, la app sigue usando la copia.
- Se guarda como **borrador**: solo tú la ves. Revisa que se reproduzca y luego **Publicar**.
