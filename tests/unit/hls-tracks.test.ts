import { describe, it, expect } from 'vitest'
import { parseMedia } from '@/lib/hls/playlist.mjs'
import { cleanVtt, languageInfo, parseRenditions, rewriteMaster, subtitlePlaylist, trackNames, validateRenditions } from '@/lib/hls/tracks.mjs'

// Master como lo deja ffmpeg con var_stream_map "a:0,agroup:audio … v:0,agroup:audio …"
const FFMPEG_MASTER = [
  '#EXTM3U',
  '#EXT-X-VERSION:6',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="group_audio",NAME="audio_0",DEFAULT=YES,LANGUAGE="spa",CHANNELS="2",URI="audio-0/index.m3u8"',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="group_audio",NAME="audio_1",DEFAULT=NO,LANGUAGE="eng",CHANNELS="6",URI="audio-1/index.m3u8"',
  '#EXT-X-STREAM-INF:BANDWIDTH=4691047,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",AUDIO="group_audio"',
  '1080p/index.m3u8',
  '',
  '#EXT-X-STREAM-INF:BANDWIDTH=1293900,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",AUDIO="group_audio"',
  '720p/index.m3u8',
  '',
].join('\n')

const SINGLE_AUDIO_MASTER = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=4691047,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"',
  '1080p/index.m3u8',
].join('\n')

function media(durations: number[], uri = 'seg.ts') {
  return parseMedia(
    ['#EXTM3U', '#EXT-X-TARGETDURATION:6', '#EXT-X-PLAYLIST-TYPE:VOD', ...durations.flatMap((d, i) => [`#EXTINF:${d},`, `${i}-${uri}`]), '#EXT-X-ENDLIST'].join('\n')
  )
}

describe('VID-11 nombres e idiomas de las pistas', () => {
  it('códigos ISO 639-2 y 639-1 → BCP-47 y nombre en español', () => {
    expect(languageInfo('spa')).toEqual({ language: 'es', name: 'Español' })
    expect(languageInfo('eng')).toEqual({ language: 'en', name: 'Inglés' })
    expect(languageInfo('ja')).toEqual({ language: 'ja', name: 'Japonés' })
    expect(languageInfo('ger')).toEqual({ language: 'de', name: 'Alemán' })
    expect(languageInfo(undefined)).toEqual({ language: 'und', name: null })
    expect(languageInfo('und')).toEqual({ language: 'und', name: null })
  })

  it('dos pistas del mismo idioma se numeran; sin idioma, "Audio N"', () => {
    expect(trackNames(['spa', 'eng'], 'Audio')).toEqual(['Español', 'Inglés'])
    expect(trackNames(['spa', 'spa', 'eng'], 'Audio')).toEqual(['Español 1', 'Español 2', 'Inglés'])
    expect(trackNames([undefined, 'und'], 'Audio')).toEqual(['Audio 1', 'Audio 2'])
  })

  it('reescribe el master de ffmpeg: grupo "audio", nombres, idiomas y la primera por defecto', () => {
    const out = rewriteMaster(FFMPEG_MASTER, { audio: [{ code: 'spa' }, { code: 'eng' }] })
    expect(out).toContain('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Español",LANGUAGE="es",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2",URI="audio-0/index.m3u8"')
    expect(out).toContain('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Inglés",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,CHANNELS="6",URI="audio-1/index.m3u8"')
    expect(out).not.toContain('group_audio')
    expect(out).not.toContain('SUBTITLES=')
  })
})

describe('VID-12 subtítulos', () => {
  it('agrega las pistas de subtítulos apagadas y cada calidad cita el grupo', () => {
    const out = rewriteMaster(FFMPEG_MASTER, { audio: [{ code: 'spa' }, { code: 'eng' }], subtitles: [{ code: 'spa', uri: 'sub-0/index.m3u8' }, { code: 'eng', uri: 'sub-1/index.m3u8' }] })
    const { renditions, variantGroups } = parseRenditions(out)
    expect(renditions.filter((r) => r.type === 'SUBTITLES')).toEqual([
      { type: 'SUBTITLES', groupId: 'subs', name: 'Español', language: 'es', isDefault: false, uri: 'sub-0/index.m3u8' },
      { type: 'SUBTITLES', groupId: 'subs', name: 'Inglés', language: 'en', isDefault: false, uri: 'sub-1/index.m3u8' },
    ])
    expect(variantGroups).toEqual([
      { audio: 'audio', subtitles: 'subs' },
      { audio: 'audio', subtitles: 'subs' },
    ])
  })

  it('con un solo audio solo se agregan subtítulos (el audio sigue dentro de cada calidad)', () => {
    const out = rewriteMaster(SINGLE_AUDIO_MASTER, { subtitles: [{ code: 'spa', uri: 'sub-0/index.m3u8' }] })
    const { renditions, variantGroups } = parseRenditions(out)
    expect(renditions.map((r) => r.type)).toEqual(['SUBTITLES'])
    expect(variantGroups).toEqual([{ audio: null, subtitles: 'subs' }])
  })

  it('limpia el WebVTT: quita anuncios, cuenta líneas y alinea con el video (X-TIMESTAMP-MAP)', () => {
    const raw = 'WEBVTT\n\n00:12.000 --> 00:17.000\nÚnete a Telegram\n@Grupo\n\n02:36.549 --> 02:38.635\nEPÍLOGO\n\n03:09.082 --> 03:09.916\nEstamos cerca.\n\n04:00.000 --> 04:02.000\nVisita www.pelis.com\n'
    const { vtt, cues } = cleanVtt(raw, 126000)
    expect(cues).toBe(2)
    expect(vtt.startsWith('WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:126000,LOCAL:00:00:00.000\n\n')).toBe(true)
    expect(vtt).toContain('EPÍLOGO')
    expect(vtt).not.toMatch(/Telegram|pelis/)
  })

  it('la playlist de subtítulos es VOD completa con un solo .vtt de toda la película', () => {
    const m = parseMedia(subtitlePlaylist(6435.861, 'index.vtt'))
    expect(m).toMatchObject({ playlistType: 'VOD', endList: true, targetDuration: 6436 })
    expect(m.segments).toEqual([{ duration: 6435.861, uri: 'index.vtt' }])
  })
})

describe('validateRenditions', () => {
  const master = rewriteMaster(FFMPEG_MASTER, { audio: [{ code: 'spa' }, { code: 'eng' }], subtitles: [{ code: 'spa', uri: 'sub-0/index.m3u8' }] })
  const goodMedias = () => ({
    'audio-0/index.m3u8': media([6, 6, 3.5]),
    'audio-1/index.m3u8': media([6, 6, 3.5]),
    'sub-0/index.m3u8': parseMedia(subtitlePlaylist(15.5, 'index.vtt')),
  })
  const vtt = { 'sub-0/index.m3u8': ['WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:126000,LOCAL:00:00:00.000\n\n'] }

  it('un master correcto no tiene errores', () => {
    expect(validateRenditions(parseRenditions(master), goodMedias(), { sourceDuration: 15.5, vtt })).toEqual([])
  })

  it('VID-11 una pista de audio más corta que el original → error', () => {
    const medias = { ...goodMedias(), 'audio-1/index.m3u8': media([6, 6]) }
    expect(validateRenditions(parseRenditions(master), medias, { sourceDuration: 15.5 }).some((e) => e.startsWith('VID-11'))).toBe(true)
  })

  it('VID-11 sin pista por defecto, o una calidad que no cita el grupo → error', () => {
    const noDefault = master.replace('DEFAULT=YES', 'DEFAULT=NO')
    expect(validateRenditions(parseRenditions(noDefault), goodMedias()).some((e) => e.includes('DEFAULT=YES'))).toBe(true)
    const orphan = master.replace(',AUDIO="audio",SUBTITLES="subs"', ',SUBTITLES="subs"')
    expect(validateRenditions(parseRenditions(orphan), goodMedias()).some((e) => e.includes('no citan el grupo AUDIO'))).toBe(true)
  })

  it('VID-12 subtítulos encendidos por defecto o sin X-TIMESTAMP-MAP → error', () => {
    const on = master.replace('DEFAULT=NO,AUTOSELECT=YES,FORCED=NO', 'DEFAULT=YES,AUTOSELECT=YES,FORCED=NO')
    expect(validateRenditions(parseRenditions(on), goodMedias()).some((e) => e.includes('apagados'))).toBe(true)
    const errors = validateRenditions(parseRenditions(master), goodMedias(), { vtt: { 'sub-0/index.m3u8': ['WEBVTT\n\n'] } })
    expect(errors).toEqual(['VID-12 index.vtt sin X-TIMESTAMP-MAP'])
  })

  it('un master sin pistas alternativas no se valida aquí (VID-01..06 bastan)', () => {
    expect(validateRenditions(parseRenditions(SINGLE_AUDIO_MASTER), {})).toEqual([])
  })
})
