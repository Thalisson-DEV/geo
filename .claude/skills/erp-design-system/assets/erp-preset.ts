// src/app/design-system/core/theme/ (no GEO, o preset vive no @geo/ui)
// Preset PrimeNG 22 (@primeuix/themes 3.x) — ERP compacto/empresarial.
// Base: Aura compat (calibrada para raiz de 14px; mantida pela PrimeTek até jun/2027).
// Densidade global vem de `html { font-size: 14px }` em styles.css.
// Cores por esquema: `light-dark(claro, escuro)` no próprio token (o 3.x não tem mais colorScheme).
// Tokens validados contra @primeuix/themes 3.1.1 (aura-compat): todos os caminhos existem.
// ATENÇÃO: confirme os nomes de token no MCP `primeng` (ou em primeng.dev/theming) ao ajustar.
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura-compat';

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
      color: 'light-dark({primary.600}, {primary.400})',
      contrastColor: 'light-dark(#ffffff, {surface.950})',
      hoverColor: 'light-dark({primary.700}, {primary.300})',
      activeColor: 'light-dark({primary.800}, {primary.200})',
    },

    // Neutros: a mesma escala `stone` nos dois esquemas (o escuro usa os tons 800–950 de fundo)
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

    highlight: {
      background: 'light-dark({primary.50}, color-mix(in srgb, {primary.400}, transparent 84%))',
      focusBackground: 'light-dark({primary.100}, color-mix(in srgb, {primary.400}, transparent 76%))',
      color: 'light-dark({primary.800}, rgba(255,255,255,.92))',
      focusColor: 'light-dark({primary.900}, rgba(255,255,255,.96))',
    },

    formField: {
      paddingX: '0.65rem',
      paddingY: '0.4rem',
      sm: { fontSize: '0.9286rem', paddingX: '0.55rem', paddingY: '0.3rem' },
      lg: { fontSize: '1.0714rem', paddingX: '0.85rem', paddingY: '0.55rem' },
      borderRadius: '6px',
      focusRing: { width: '0', style: 'none', color: 'transparent', offset: '0', shadow: 'none' },
      transitionDuration: '{transition.duration}',
      background: 'light-dark({surface.0}, {surface.900})',
      borderColor: 'light-dark({surface.300}, {surface.700})',
      hoverBorderColor: 'light-dark({surface.400}, {surface.600})',
      focusBorderColor: '{primary.color}',
      // escuro = padrão do Aura compat
      invalidBorderColor: 'light-dark({red.500}, {red.300})',
      color: 'light-dark({surface.900}, {surface.0})',
      placeholderColor: 'light-dark({surface.400}, {surface.500})',
      shadow: 'none',
    },

    text: {
      color: 'light-dark({surface.900}, {surface.0})',
      hoverColor: 'light-dark({surface.950}, {surface.0})',
      mutedColor: 'light-dark({surface.500}, {surface.400})',
      hoverMutedColor: 'light-dark({surface.700}, {surface.300})',
    },

    list: {
      padding: '0.25rem',
      gap: '1px',
      header: { padding: '0.5rem 0.75rem 0.25rem 0.75rem' },
      option: { padding: '0.4rem 0.6rem', borderRadius: '4px' },
      optionGroup: { padding: '0.4rem 0.6rem', fontWeight: '600' },
    },

    content: {
      borderRadius: '8px',
      background: 'light-dark({surface.0}, {surface.900})',
      hoverBackground: 'light-dark({surface.100}, {surface.800})',
      borderColor: 'light-dark({surface.200}, {surface.800})',
      color: '{text.color}',
      hoverColor: '{text.hover.color}',
    },

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
