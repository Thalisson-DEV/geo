import { computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AbaSecao } from '../../ui';

type Contagem = (() => number | null) | null;

/**
 * Abas do topo do Almoxarifado, conforme as permissões (só o que a pessoa pode abrir):
 * solicitações comerciais, solicitações técnicas, encerramento de obras e movimentações.
 */
export function abasAlmox(contagemComerciais: Contagem = null, contagemTecnicas: Contagem = null) {
  const auth = inject(AuthService);
  return computed<AbaSecao[]>(() => [
    ...(auth.podeVerSolicitacoesAlmox() ? [
      { rota: '/almox/solicitacoes', rotulo: 'Comercial', icone: 'documento' as const, contagem: contagemComerciais?.() ?? null },
      { rota: '/almox/tecnicas', rotulo: 'Técnico', icone: 'servicos' as const, contagem: contagemTecnicas?.() ?? null },
    ] : []),
    ...(auth.podeVerFechamentoAlmox() ? [{ rota: '/almox/fechamento', rotulo: 'Encerramento', icone: 'fechamento' as const }] : []),
    ...(auth.podeVerMovimentacoes() ? [{ rota: '/almox/movimentacoes', rotulo: 'Movimentações', icone: 'transferencia' as const }] : []),
  ]);
}
