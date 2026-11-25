import { computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AbaSecao } from '../../ui';

type Contagem = (() => number | null) | null;

/**
 * Abas do topo do Almoxarifado, conforme as permissões (só o que a pessoa pode abrir):
 * balcão, estoque das equipes, solicitações técnicas, encerramento de obras e movimentações.
 */
// O primeiro parâmetro era a contagem das solicitações comerciais, que saíram do app (o GEO é de Obras).
export function abasAlmox(_semUso: Contagem = null, contagemTecnicas: Contagem = null) {
  const auth = inject(AuthService);
  return computed<AbaSecao[]>(() => [
    ...(auth.podeOperarBalcao() ? [{ rota: '/almox/balcao', rotulo: 'Balcão', icone: 'almox' as const }] : []),
    ...(auth.podeVerEstoqueEquipes() ? [{ rota: '/almox/equipes', rotulo: 'Equipes', icone: 'caminhao' as const }] : []),
    ...(auth.podeVerSolicitacoesAlmox() ? [
      { rota: '/almox/tecnicas', rotulo: 'Técnico', icone: 'servicos' as const, contagem: contagemTecnicas?.() ?? null },
    ] : []),
    ...(auth.podeVerFechamentoAlmox() ? [{ rota: '/almox/fechamento', rotulo: 'Encerramento', icone: 'fechamento' as const }] : []),
    ...(auth.podeVerMovimentacoes() ? [{ rota: '/almox/movimentacoes', rotulo: 'Movimentações', icone: 'transferencia' as const }] : []),
  ]);
}
