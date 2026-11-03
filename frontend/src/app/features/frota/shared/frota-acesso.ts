import { computed, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Permissões da frota para mostrar ou esconder ações na tela. O backend continua
 * sendo quem decide; aqui só evitamos oferecer o que vai ser recusado.
 */
export function acessoFrota() {
  const auth = inject(AuthService);
  const tem = (permissao: string) => computed(() => auth.currentUser()?.permissoes?.includes(permissao) ?? false);
  return {
    editarVeiculo: tem('frota:veiculo:write'),
    editarCondutor: tem('frota:condutor:write'),
    editarDocumento: tem('frota:documento:write'),
    lancarKm: tem('frota:odometro:write'),
    anularKm: tem('frota:odometro:anular'),
    configurar: tem('frota:configuracao:write'),
    verChecklist: tem('frota:checklist:read'),
    configurarChecklist: tem('frota:checklist:configurar'),
    verAbastecimento: tem('frota:abastecimento:read'),
    aprovarAbastecimento: tem('frota:abastecimento:aprovar'),
    liberarAbastecimento: tem('frota:abastecimento:liberar'),
    configurarAbastecimento: tem('frota:abastecimento:configurar'),
    verDespesa: tem('frota:despesa:read'),
    editarDespesa: tem('frota:despesa:write'),
    verSeguro: tem('frota:seguro:read'),
    editarSeguro: tem('frota:seguro:write'),
    verSinistro: tem('frota:sinistro:read'),
    editarSinistro: tem('frota:sinistro:write'),
    verEstoque: tem('frota:estoque:read'),
    editarEstoque: tem('frota:estoque:write'),
    verPneu: tem('frota:pneu:read'),
    editarPneu: tem('frota:pneu:write'),
    verPreventiva: tem('frota:preventiva:read'),
    editarPreventiva: tem('frota:preventiva:write'),
    verOs: tem('frota:os:read'),
    editarOs: tem('frota:os:write'),
    executarOs: tem('frota:os:executar'),
    verTelemetria: tem('frota:telemetria:read'),
    editarTelemetria: tem('frota:telemetria:write'),
    /** Quem abre compras no financeiro (variante de frota) a partir da OS. */
    solicitarCompra: tem('financeiro:compra:write'),
    solicitarPagamento: tem('financeiro:pagamento:write'),
    /** Quem cadastra fornecedores no financeiro (ex.: a seguradora nova, sem sair da apólice). */
    cadastrarFornecedor: tem('financeiro:fornecedor:write')
  };
}
