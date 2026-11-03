import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tmdb } from '../lib/tmdb/client.mjs'
export type BackfillSummary = { updated: number; unchanged: number; missing: number; failed: number }
export declare function completeRow(
  db: SupabaseClient,
  tmdb: Tmdb,
  kind: 'movie' | 'tv',
  row: Record<string, unknown>,
  options?: { dryRun?: boolean },
): Promise<Record<string, unknown> | null>
export declare function backfill(
  db: SupabaseClient,
  tmdb: Tmdb,
  options?: { dryRun?: boolean; log?: (msg: string) => void; ids?: string[] },
): Promise<BackfillSummary>
