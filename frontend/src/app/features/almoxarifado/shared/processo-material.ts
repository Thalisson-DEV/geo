/**
 * Processo do material no cadastro. Materiais de Obras atendem a solicitação técnica e o
 * fechamento; os demais, a comercial. A tela mostra o processo sempre com ícone e nome legível.
 */
export const PROCESSO_OBRAS = 'OBRAS';

export interface ProcessoMaterialVisual {
  rotulo: string;
  icone: string;
}

const ICONES: Record<string, string> = {
  OBRAS: 'pi pi-building',
  COMERCIAL: 'pi pi-briefcase',
  MANUTENCAO: 'pi pi-wrench',
  'LINHA VIVA': 'pi pi-bolt',
  TI: 'pi pi-desktop'
};

const ROTULOS: Record<string, string> = { MANUTENCAO: 'Manutenção', TI: 'TI' };

export function processoMaterial(nome: string | null | undefined): ProcessoMaterialVisual | null {
  const chave = (nome ?? '').trim().toUpperCase();
  if (!chave) return null;
  const rotulo = ROTULOS[chave] ?? chave.charAt(0) + chave.slice(1).toLowerCase();
  return { rotulo, icone: ICONES[chave] ?? 'pi pi-sitemap' };
}

export function ehProcessoObras(nome: string | null | undefined): boolean {
  return (nome ?? '').trim().toUpperCase() === PROCESSO_OBRAS;
}

/** Texto curto para quem escolhe material: em qual solicitação ele pode entrar. */
export function ondeOMaterialEntra(nome: string | null | undefined): string {
  return ehProcessoObras(nome) ? 'Só em solicitação técnica e de fechamento' : 'Só em solicitação comercial';
}
