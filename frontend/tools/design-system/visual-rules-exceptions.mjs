/**
 * Exceções das regras visuais (check-visual-rules.mjs). Cada arquivo isento tem o motivo.
 * Isentar é para o que precisa de cor literal de verdade (marca, e-mail), não para pressa.
 */
export const ARQUIVOS_ISENTOS = [
  // Nenhum ainda em features/shared: o logo e o avatar da Bússola ficam no DS (design-system/),
  // fora da varredura. Exemplo de entrada:
  // { caminho: 'src/app/shared/components/logo/logo.svg.ts', motivo: 'SVG da marca com cores fixas' },
];

/**
 * Marcas que não podem aparecer em código, texto ou dados (produto white label). O padrão é uma
 * expressão regular (sem flags; a busca ignora maiúsculas).
 */
export const MARCAS_PROIBIDAS = [
  { padrao: '\\bsipel(?:zinho)?\\b', motivo: 'empresa de origem' },
  { padrao: '\\bC\\.E\\.S\\b', motivo: 'sistema de origem' },
  { padrao: '\\bneoenergia\\b', motivo: 'cliente: o nome vem da configuração da empresa' },
  { padrao: '\\bcoelba\\b', motivo: 'cliente: o nome vem da configuração da empresa' },
];
