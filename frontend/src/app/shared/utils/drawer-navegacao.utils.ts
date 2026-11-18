import { DestroyRef, inject } from '@angular/core';

/**
 * Sair de um drawer para outra rota (ex.: "Relatório completo") destrói o drawer no meio da
 * animação da máscara (cerca de 1 s). A máscara ficava órfã no `body`, escurecendo a tela nova,
 * com a rolagem travada e sem receber clique até recarregar a página.
 *
 * A máscara órfã pode ficar presa saindo (`leave-active`) ou entrando (`enter-active`); nos dois
 * casos ela fica vazia, porque o painel foi destruído junto com o drawer. Uma máscara viva sempre
 * tem o drawer ou o diálogo dentro. Navega na hora e limpa duas vezes: logo depois da troca de
 * rota e de novo quando a animação já teria acabado.
 */
const FIM_DA_ANIMACAO_MS = 1100;

export function navegarSaindoDoDrawer(navegar: () => Promise<boolean>): Promise<boolean> {
  return navegar().finally(() => {
    requestAnimationFrame(limparMascarasOrfas);
    setTimeout(limparMascarasOrfas, FIM_DA_ANIMACAO_MS);
  });
}

/** Duração da saída do painel: desmontar antes disso corta a animação. */
const SAIDA_DO_DRAWER_MS = 300;

/**
 * Saída de um drawer que a tela monta só enquanto está aberto. O `closed` do `ces-form-drawer` não
 * dispara quando ele fecha sozinho, então quem fecha chama a função devolvida: ela espera o painel
 * sair, avisa a tela e devolve o foco a quem abriu. Chame no inicializador de um campo.
 */
export function saidaDoDrawer(aoSair: () => void): () => void {
  const origem = document.activeElement as HTMLElement | null;
  let espera: ReturnType<typeof setTimeout> | undefined;
  inject(DestroyRef).onDestroy(() => clearTimeout(espera));
  return () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      aoSair();
      requestAnimationFrame(limparMascarasOrfas);
      if (origem?.isConnected) origem.focus();
    }, SAIDA_DO_DRAWER_MS);
  };
}

export function limparMascarasOrfas(): void {
  document.querySelectorAll('.p-overlay-mask-leave-active').forEach((mascara) => mascara.remove());
  // Drawer desmontado antes do fim da saída deixa a máscara sem dono, e ela nunca sai sozinha.
  const paineis = document.querySelectorAll('.p-drawer').length;
  Array.from(document.querySelectorAll('.p-drawer-mask')).slice(paineis).forEach((mascara) => mascara.remove());
  if (!document.querySelector('.p-overlay-mask')) document.body.classList.remove('p-overflow-hidden');
}
