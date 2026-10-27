# Agregar una película

## Lo fácil: la carpeta de entrada (automático)

Una sola vez, instala el servicio:

```bash
pnpm movie:inbox:install
```

Desde entonces, **arrastra cualquier película a `~/Movies/Mavros/Entrada`** (mkv, mp4, mov, m4v o avi).
Cada 5 minutos la Mac revisa esa carpeta y, cuando el archivo terminó de copiarse, la convierte, la
verifica, la sube a R2 y la deja como **borrador** en el admin con título y año sacados del nombre
(`Perfect Blue (1997).mkv` → "Perfect Blue", 1997). Te avisa con una notificación.

- Luego, en el admin, agrega póster, géneros y sinopsis, y dale **Publicar**.
- El original pasa a `Procesadas` (puedes borrarlo o guardarlo). Si algo falla, pasa a `Errores`
  junto con un `.log` que explica por qué.
- La Mac tiene que estar encendida y despierta mientras convierte.
- Registro: `~/Library/Logs/mavros-inbox.log`. Para quitar el servicio: `scripts/install-movie-inbox.sh --quitar`.
- Para correrlo a mano sin esperar: `pnpm movie:inbox`.

### Series

Los episodios se reconocen por `S01E02` (o `1x02`) en el nombre. Sirven cualquiera de estas formas:

```
Entrada/Breaking Bad (2008)/S01E01 - Pilot.mkv        ← la serie sale de la carpeta
Entrada/Breaking Bad (2008)/Temporada 2/S02E01.mkv    ← subcarpetas de temporada se ignoran
Entrada/Breaking Bad - S01E03 - And the Bag's in the River.mkv
Entrada/Breaking.Bad.S01E04.720p.BluRay.mkv           ← "720p.BluRay…" no se toma como título
```

- Puedes soltar una temporada completa: se procesa un episodio tras otro.
- Si la serie no existe se crea como **borrador** (título y año de la carpeta o del nombre). Si ya
  existe (mismo nombre), el episodio se agrega a ella.
- Cada episodio queda en borrador con título del archivo (o "Episodio N") y su video en
  `series/<serie>/s01e02/` en R2.
- En el admin → **Series** → la serie: ponle póster/sinopsis, **Publicar borradores (N)** para
  publicar todos los episodios de una vez y **Publicar** la serie. Un episodio solo se ve si él y su
  serie están publicados.
- Un episodio que ya existe va a `Errores` sin subir nada.

### Datos automáticos con TMDB

Con `TMDB_API_KEY` en `.env.local` (y en Vercel), la carpeta y el panel llenan solos lo que falte:

- **Película nueva:** sinopsis, título original, año, géneros y póster.
- **Serie nueva:** lo mismo más la imagen horizontal de su página.
- **Cada episodio:** título real, sinopsis e imagen. Si TMDB no tiene imagen, se usa un cuadro del propio video.
- Nunca pisa lo que ya escribiste y el título de la película o serie no cambia. Si TMDB no encuentra
  nada o no responde, todo se crea igual que antes.
- En el panel: **Buscar en TMDB** al editar una película o serie (para elegir el resultado correcto si
  la búsqueda automática se equivocó) y **Completar episodios desde TMDB** en la serie.

La clave se saca gratis en themoviedb.org → Ajustes → API (sirve la "API key" o el "Read Access Token").

## A mano (paso por paso)

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

## Calidad

`hls:encode` usa una calidad alta por resolución (VID-08): la 1080p puede llegar a 6 Mbps (antes 3),
la 720p a 3, la 480p a 1.4 y la 360p a 0.8; un original 4K usaría hasta 16 Mbps. Una película de 2 h
en 1080p queda en unos **7–9 GB** en R2 (≈ US$0.12/mes cada una). El reproductor elige la calidad según
tu conexión, o la eliges a mano.

## Volver a convertir una película que ya está subida

Para que una película vieja aproveche la calidad nueva, sin perder el progreso de nadie:

1. Convierte y sube a una **carpeta nueva**: `movies/mi-pelicula-v2`.
2. En **Admin → Películas → Editar**, cambia "Video (ruta en R2)" a `movies/mi-pelicula-v2/master.m3u8`
   y guarda (el servidor verifica el video nuevo). El progreso se conserva: va ligado a la película,
   no a la carpeta.
3. Cuando confirmes que se ve bien, borra la carpeta vieja para no pagar su almacenamiento:
   `rclone purge videos-backup:videos/movies/mi-pelicula`
