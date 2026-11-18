/** Configuração injetada no bundle pela implantação do frontend. */
export const STATUS_PAGE_URL = globalThis.__GEO_CONFIG__?.statusPageUrl ?? '';
export const STATUS_PUBLIC_API_URL = globalThis.__GEO_CONFIG__?.statusPublicApiUrl ?? '';

export const environment = {
  production: true,
  apiUrl: '/api',
  /** Publicados pela implantação do plano de observabilidade, sem depender do GEO. */
  statusPageUrl: STATUS_PAGE_URL,
  statusPublicApiUrl: STATUS_PUBLIC_API_URL,
};
