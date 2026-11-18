export type GeoActionVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'success'
  | 'link';

export type GeoActionSize = 'sm' | 'md' | 'lg' | 'icon-sm' | 'icon-md' | 'icon-lg';

export type GeoTone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger';

export type GeoSurfaceVariant = 'plain' | 'raised' | 'outlined' | 'subtle' | 'interactive';

export type GeoContentState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'refreshing'
  | 'error'
  | 'offline-cached'
  | 'stale';

export type GeoMutationState =
  | 'idle'
  | 'submitting'
  | 'committed'
  | 'queued'
  | 'synchronizing'
  | 'failed'
  | 'cancelled';

export type GeoDensity = 'compact' | 'comfortable';
