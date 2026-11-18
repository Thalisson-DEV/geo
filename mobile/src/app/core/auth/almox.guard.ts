import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Almoxarifado do perfil administrativo. `CanMatchFn` para o chunk nem ser baixado por quem
 * não tem acesso; cada parte confere a permissão que o backend exige (sem tela que dá 403).
 */
export const almoxGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.podeAcessarAlmoxarifado() ? true : inject(Router).createUrlTree(['/hoje']);
};

export const almoxSolicitacoesGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  if (auth.podeVerSolicitacoesAlmox()) return true;
  return inject(Router).createUrlTree([auth.podeVerMovimentacoes() ? '/almox/movimentacoes' : auth.podeVerFechamentoAlmox() ? '/almox/fechamento' : '/hoje']);
};

export const almoxEntregaGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.podeGerirSolicitacoesAlmox() ? true : inject(Router).createUrlTree(['/almox/solicitacoes']);
};

export const almoxMovimentacoesGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  if (auth.podeVerMovimentacoes()) return true;
  return inject(Router).createUrlTree([auth.podeVerSolicitacoesAlmox() ? '/almox/solicitacoes' : auth.podeVerFechamentoAlmox() ? '/almox/fechamento' : '/hoje']);
};

export const almoxMovimentarGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.podeMovimentarEstoque() ? true : inject(Router).createUrlTree(['/almox/movimentacoes']);
};

export const almoxFechamentoGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.podeVerFechamentoAlmox() ? true : inject(Router).createUrlTree(['/almox']);
};

/** Seção do técnico e criação: quem cria acompanha o que pediu, com ou sem almoxarifado. */
export const fechamentoCriarGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.podeCriarFechamento() ? true : inject(Router).createUrlTree(['/hoje']);
};

export const fechamentoMovimentarGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.podeMovimentarFechamento() ? true : inject(Router).createUrlTree(['/hoje']);
};
