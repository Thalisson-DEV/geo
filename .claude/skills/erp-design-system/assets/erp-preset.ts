// src/app/theme/erp-preset.ts
// Preset PrimeNG 21 — ERP compacto/empresarial.
// Base: Aura. Densidade global vem de `html { font-size: 14px }` em styles.css.
// ATENÇÃO: confirme os nomes de token no MCP `primeng` (ou em primeng.org/theming) ao ajustar.
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

export const ErpPreset = definePreset(Aura, {
  semantic: {
    transitionDuration: '0.14s',
    iconSize: '1rem',
    focusRing: {
      width: '2px',
      style: 'solid',
      color: '{primary.color}',
      offset: '1px',
      shadow: 'none',
    },

    // Acento — troque `indigo` por `blue`, `teal`, `orange`... conforme a marca
    primary: {
      50: '{indigo.50}',
      100: '{indigo.100}',
      200: '{indigo.200}',
      300: '{indigo.300}',
      400: '{indigo.400}',
      500: '{indigo.500}',
      600: '{indigo.600}',
      700: '{indigo.700}',
      800: '{indigo.800}',
      900: '{indigo.900}',
      950: '{indigo.950}',
    },

    formField: {
      paddingX: '0.65rem',
      paddingY: '0.4rem',
      sm: { fontSize: '0.9286rem', paddingX: '0.55rem', paddingY: '0.3rem' },
      lg: { fontSize: '1.0714rem', paddingX: '0.85rem', paddingY: '0.55rem' },
      borderRadius: '6px',
      focusRing: { width: '0', style: 'none', color: 'transparent', offset: '0', shadow: 'none' },
      transitionDuration: '{transition.duration}',
    },

    list: {
      padding: '0.25rem',
      gap: '1px',
      header: { padding: '0.5rem 0.75rem 0.25rem 0.75rem' },
      option: { padding: '0.4rem 0.6rem', borderRadius: '4px' },
      optionGroup: { padding: '0.4rem 0.6rem', fontWeight: '600' },
    },

    content: { borderRadius: '8px' },

    navigation: {
      list: { padding: '0.25rem', gap: '1px' },
      item: { padding: '0.4rem 0.6rem', borderRadius: '6px', gap: '0.5rem' },
      submenuLabel: { padding: '0.5rem 0.6rem 0.25rem', fontWeight: '600' },
      submenuIcon: { size: '0.875rem' },
    },

    overlay: {
      select: {
        borderRadius: '8px',
        shadow: '0 4px 16px -2px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
      },
      popover: {
        borderRadius: '8px',
        padding: '0.75rem',
        shadow: '0 4px 16px -2px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
      },
      modal: {
        borderRadius: '10px',
        padding: '1.25rem',
        shadow: '0 16px 48px -8px rgb(0 0 0 / 0.20)',
      },
      navigation: {
        shadow: '0 4px 16px -2px rgb(0 0 0 / 0.10), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
      },
    },

    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '{stone.50}',
          100: '{stone.100}',
          200: '{stone.200}',
          300: '{stone.300}',
          400: '{stone.400}',
          500: '{stone.500}',
          600: '{stone.600}',
          700: '{stone.700}',
          800: '{stone.800}',
          900: '{stone.900}',
          950: '{stone.950}',
        },
        primary: {
          color: '{primary.600}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.700}',
          activeColor: '{primary.800}',
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.800}',
          focusColor: '{primary.900}',
        },
        formField: {
          background: '{surface.0}',
          borderColor: '{surface.300}',
          hoverBorderColor: '{surface.400}',
          focusBorderColor: '{primary.color}',
          invalidBorderColor: '{red.500}',
          color: '{surface.900}',
          placeholderColor: '{surface.400}',
          shadow: 'none',
        },
        text: {
          color: '{surface.900}',
          hoverColor: '{surface.950}',
          mutedColor: '{surface.500}',
          hoverMutedColor: '{surface.700}',
        },
        content: {
          background: '{surface.0}',
          hoverBackground: '{surface.100}',
          borderColor: '{surface.200}',
          color: '{text.color}',
          hoverColor: '{text.hover.color}',
        },
      },
      dark: {
        surface: {
          0: '#ffffff',
          50: '{stone.50}',
          100: '{stone.100}',
          200: '{stone.200}',
          300: '{stone.300}',
          400: '{stone.400}',
          500: '{stone.500}',
          600: '{stone.600}',
          700: '{stone.700}',
          800: '{stone.800}',
          900: '{stone.900}',
          950: '{stone.950}',
        },
        primary: {
          color: '{primary.400}',
          contrastColor: '{surface.950}',
          hoverColor: '{primary.300}',
          activeColor: '{primary.200}',
        },
        highlight: {
          background: 'color-mix(in srgb, {primary.400}, transparent 84%)',
          focusBackground: 'color-mix(in srgb, {primary.400}, transparent 76%)',
          color: 'rgba(255,255,255,.92)',
          focusColor: 'rgba(255,255,255,.96)',
        },
        formField: {
          background: '{surface.900}',
          borderColor: '{surface.700}',
          hoverBorderColor: '{surface.600}',
          focusBorderColor: '{primary.color}',
          color: '{surface.0}',
          placeholderColor: '{surface.500}',
          shadow: 'none',
        },
        text: {
          color: '{surface.0}',
          hoverColor: '{surface.0}',
          mutedColor: '{surface.400}',
          hoverMutedColor: '{surface.300}',
        },
        content: {
          background: '{surface.900}',
          hoverBackground: '{surface.800}',
          borderColor: '{surface.800}',
          color: '{text.color}',
          hoverColor: '{text.hover.color}',
        },
      },
    },
  },

  components: {
    button: {
      root: {
        borderRadius: '6px',
        paddingX: '0.85rem',
        paddingY: '0.4rem',
        gap: '0.4rem',
        iconOnlyWidth: '2.2857rem', // 32px
        sm: { fontSize: '0.9286rem', paddingX: '0.65rem', paddingY: '0.3rem', iconOnlyWidth: '2rem' },
        label: { fontWeight: '500' },
      },
    },
    datatable: {
      headerCell: { padding: '0.45rem 0.75rem', gap: '0.4rem' },
      columnTitle: { fontWeight: '500' },
      bodyCell: { padding: '0.4rem 0.75rem' },
      footerCell: { padding: '0.45rem 0.75rem' },
      header: { padding: '0.5rem 0.75rem' },
      footer: { padding: '0.5rem 0.75rem' },
    },
    paginator: {
      root: { padding: '0.25rem 0.5rem', gap: '0.25rem' },
      navButton: { width: '2rem', height: '2rem', borderRadius: '6px' },
    },
    tag: {
      root: { fontSize: '0.8571rem', fontWeight: '500', padding: '0.15rem 0.45rem', borderRadius: '4px' },
    },
    card: {
      root: { borderRadius: '8px', shadow: 'none' },
      body: { padding: '1rem', gap: '0.5rem' },
      title: { fontSize: '1.0714rem', fontWeight: '600' },
    },
    dialog: {
      header: { padding: '1rem 1.25rem 0.5rem' },
      content: { padding: '0 1.25rem 1rem' },
      footer: { padding: '0.75rem 1.25rem 1rem', gap: '0.5rem' },
      title: { fontSize: '1.0714rem', fontWeight: '600' },
    },
    toast: {
      root: { width: '22rem', borderRadius: '8px' },
    },
  },
});
