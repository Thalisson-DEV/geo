import { definePreset } from '@primeuix/themes';
import Lara from '@primeuix/themes/lara';

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
export const geoPreset = definePreset(Lara, {
  primitive: {
    geo: GEO_PRIMARY,
    ink: GEO_NEUTRAL
  },
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
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '{ink.50}',
          100: '{ink.100}',
          200: '{ink.200}',
          300: '{ink.300}',
          400: '{ink.400}',
          500: '{ink.500}',
          600: '{ink.600}',
          700: '{ink.700}',
          800: '{ink.800}',
          900: '{ink.900}',
          950: '{ink.950}'
        }
      },
      dark: {
        surface: {
          0: '{ink.950}',
          50: '#0f1420',
          100: '#121826',
          200: '#1a2232',
          300: '#263043',
          400: '#35415a',
          500: '#8f99ab',
          600: '#b4bdcc',
          700: '#cbd2de',
          800: '#e1e6ee',
          900: '#f2f5fa',
          950: '#ffffff'
        }
      }
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
    // escala escura do GEO é invertida (surface.0 = ink.950), o texto sumia no fundo.
    toast: {
      colorScheme: {
        dark: {
          info: { detailColor: '{ink.100}' },
          success: { detailColor: '{ink.100}' },
          warn: { detailColor: '{ink.100}' },
          error: { detailColor: '{ink.100}' },
          secondary: { detailColor: '{ink.100}' }
        }
      }
    }
  }
});
