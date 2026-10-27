import type { SupabaseClient } from '@supabase/supabase-js'
export declare const POSTERS_BUCKET: string
export declare const POSTER_MAX_WIDTH: number
export declare const BACKDROP_MAX_WIDTH: number
export declare function thumbhashFromImage(bytes: Buffer): Promise<string>
export declare function optimizeImage(bytes: Buffer, maxWidth?: number): Promise<Buffer>
export declare function imageObjectPath(image: Buffer): string
export declare function uploadImage(supabase: SupabaseClient, image: Buffer): Promise<string | null>
export declare function processImageBytes(bytes: Buffer, maxWidth?: number): Promise<{ thumbhash: string | null; image: Buffer | null }>
