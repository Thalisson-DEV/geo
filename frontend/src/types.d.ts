interface GeoRuntimeConfig {
  readonly statusPageUrl?: string;
  readonly statusPublicApiUrl?: string;
}

declare var __GEO_CONFIG__: GeoRuntimeConfig | undefined;
