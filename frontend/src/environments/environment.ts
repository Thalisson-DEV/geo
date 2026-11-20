/** Configuração injetada no bundle pela implantação do frontend. */
export const STATUS_PAGE_URL = globalThis.__GEO_CONFIG__?.statusPageUrl ?? '';
export const STATUS_PUBLIC_API_URL = globalThis.__GEO_CONFIG__?.statusPublicApiUrl ?? '';

export const environment = {
  production: true,
  apiUrl: '/api',
  /** Publicados pela implantação do plano de observabilidade, sem depender do GEO. */
  statusPageUrl: STATUS_PAGE_URL,
  statusPublicApiUrl: STATUS_PUBLIC_API_URL,
  /**
   * Chave da licença comunitária PrimeUI exigida pelo PrimeNG 22 (vence em 20/11/2027; renovação
   * anual). Vai no bundle de propósito: a validação é pela assinatura, não pelo segredo.
   */
  primeuiLicense: 'eyJpZCI6IjFkNTdjYzZkLTUwYjAtNGQxNi05MDlhLTJjMTU2NDY0YzU2NiIsInByb2R1Y3QiOiJwcmltZXVpIiwidGllciI6ImNvbW11bml0eSIsInR5cGUiOiJkZXYiLCJpYXQiOjE3OTUxMzg4NTIsImV4cCI6MTgyNjY3NDg1Mn0.V579UM2x_Uhi76a1-mDR54ZQe1_PQa1cs_WcXK_-KNwNpnpgdYVinPDszPPkNzvQUEku8GyqLy60PyXx8n9gDg',
};
