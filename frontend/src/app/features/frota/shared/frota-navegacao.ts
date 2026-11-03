import { NavigationExtras, Router } from '@angular/router';

/**
 * Navega depois que o drawer que acabou de fechar some da tela.
 *
 * O PrimeNG não emite `onHide` quando o `visible` é fechado pelo código, e se a tela é
 * destruída durante a animação de saída a máscara do drawer fica presa no `body`,
 * bloqueando os cliques da tela seguinte. Por isso espera a máscara sair (com limite).
 */
export function navegarAposFecharDrawer(router: Router, comandos: unknown[], limiteMs = 1000, extras?: NavigationExtras): void {
  const navegar = () => void router.navigate(comandos, extras);
  const temMascara = () => !!document.querySelector('.p-drawer-mask');
  if (typeof MutationObserver === 'undefined' || !temMascara()) {
    navegar();
    return;
  }
  const observador = new MutationObserver(() => {
    if (!temMascara()) concluir();
  });
  const limite = setTimeout(() => concluir(), limiteMs);
  let concluido = false;
  function concluir(): void {
    if (concluido) return;
    concluido = true;
    observador.disconnect();
    clearTimeout(limite);
    navegar();
  }
  observador.observe(document.body, { childList: true });
}
