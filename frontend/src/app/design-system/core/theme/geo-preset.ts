import { definePreset } from '@primeuix/themes';
// Variante compat: o PrimeNG 22 passou a calibrar o Lara para raiz de 16px; a compat mantém os
// valores do Lara do PrimeNG 21 (a raiz do GEO é 13px, em styles.css). Mantida até jun/2027.
import Lara from '@primeuix/themes/lara-compat';

/** Escala primária do GEO, derivada do azul do "G" (#2563EB / #1E40AF). */
export const GEO_PRIMARY = {
  50: '#eff5ff',
  100: '#dbe7fe',
  200: '#bfd4fe',
  300: '#93b7fd',
  400: '#6093fa',
  500: '#3b72f6',
  600: '#2563eb',
  700: '#1d4fd8',
  800: '#1e40af',
  900: '#1e3a8a',
  950: '#172554'
} as const;

/** Neutros do GEO, levemente azulados. */
export const GEO_NEUTRAL = {
  0: '#ffffff',
  50: '#f6f8fb',
  100: '#eef1f6',
  200: '#e1e6ee',
  300: '#cbd2de',
  400: '#98a2b3',
  500: '#6b7588',
  600: '#4b5567',
  700: '#353e4f',
  800: '#222a38',
  900: '#151b26',
  950: '#0b0f17'
} as const;

/**
 * Tema oficial do GEO sobre o Lara. A cor primária é fixa para todos os usuários; os
 * componentes do DS consomem os tokens `--geo-*` de `tokens.css`, alinhados a esta escala.
 */
/**
 * Primitivos próprios do GEO (`{geo.*}` e `{ink.*}`). O tipo do Lara no @primeuix/themes 3 só
 * lista os primitivos dele, mas o tema continua aceitando chaves novas e gerando --p-geo-* e
 * --p-ink-*, como no 2.x; por isso o objeto entra sem o tipo estreito.
 */
const PRIMITIVOS_GEO: object = { geo: GEO_PRIMARY, ink: GEO_NEUTRAL };

export const geoPreset = definePreset(Lara, {
  primitive: PRIMITIVOS_GEO,
  semantic: {
    primary: {
      50: '{geo.50}',
      100: '{geo.100}',
      200: '{geo.200}',
      300: '{geo.300}',
      400: '{geo.400}',
      500: '{geo.500}',
      600: '{geo.600}',
      700: '{geo.700}',
      800: '{geo.800}',
      900: '{geo.900}',
      950: '{geo.950}'
    },
    focusRing: {
      width: '2px',
      style: 'solid',
      color: 'var(--geo-focus-ring)',
      offset: '2px',
      shadow: 'none'
    },
    // light-dark(claro, escuro): a escala escura do GEO é invertida (surface.0 = ink.950).
    surface: {
      0: 'light-dark(#ffffff, {ink.950})',
      50: 'light-dark({ink.50}, #0f1420)',
      100: 'light-dark({ink.100}, #121826)',
      200: 'light-dark({ink.200}, #1a2232)',
      300: 'light-dark({ink.300}, #263043)',
      400: 'light-dark({ink.400}, #35415a)',
      500: 'light-dark({ink.500}, #8f99ab)',
      600: 'light-dark({ink.600}, #b4bdcc)',
      700: 'light-dark({ink.700}, #cbd2de)',
      800: 'light-dark({ink.800}, #e1e6ee)',
      900: 'light-dark({ink.900}, #f2f5fa)',
      950: 'light-dark({ink.950}, #ffffff)'
    }
  },
  components: {
    dialog: {
      header: {
        padding: '1.25rem 1.5rem',
        gap: '0.5rem'
      },
      content: {
        padding: '1.25rem 1.5rem'
      },
      footer: {
        padding: '1.25rem 1.5rem',
        gap: '0.5rem'
      }
    },
    // O Lara escreve o detalhe do toast escuro com {surface.0}, que ele supõe branco. Como a
    // escala escura do GEO é invertida (surface.0 = ink.950), o texto sumia no fundo. O claro
    // segue o do Lara ({surface.700}).
    toast: {
      info: { detailColor: 'light-dark({surface.700}, {ink.100})' },
      success: { detailColor: 'light-dark({surface.700}, {ink.100})' },
      warn: { detailColor: 'light-dark({surface.700}, {ink.100})' },
      error: { detailColor: 'light-dark({surface.700}, {ink.100})' },
      secondary: { detailColor: 'light-dark({surface.700}, {ink.100})' }
    }
  }
});
