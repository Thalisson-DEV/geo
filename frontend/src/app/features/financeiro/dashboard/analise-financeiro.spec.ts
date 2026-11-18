import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { DashboardFinanceiroResponse, PrioridadeFinanceiraItem, RankingFinanceiroItem } from '../../../core/models/financeiro-dashboard.models';
import { SolicitacaoFinanceira } from '../../../core/models/financeiro.models';
import {
  cartoesFinanceiros,
  diaDe,
  diasEntre,
  leiturasFinanceiras,
  linhaSolicitacao,
  paramsDaListagem,
  pendenciasFinanceiras,
  priorizar,
  recorteNaListagem,
  somarDias,
  textoVencimento,
  vereditoFinanceiro
} from './analise-financeiro';
import { formatarMoedaCompacta } from './financeiro-dashboard-insights';
import { ContextoAnaliseFinanceiro, vistaFinanceiro } from './vistas-financeiro';

const HOJE = '2026-11-12';

function ranking(chave: string, extra: Partial<RankingFinanceiroItem> = {}): RankingFinanceiroItem {
  return {
    chave, id: chave, nome: `Item ${chave}`, quantidade: 4, percentualQuantidade: 40, valorSolicitado: 5000, valorAprovado: 4000,
    percentualValor: 40, aprovadas: 3, rejeitadas: 1, pendentes: 0, taxaAprovacao: 75, ticketMedio: 1000, documentos: 2,
    percentualComDocumentoFiscal: 66, ...extra
  };
}

function prioridade(tipo: string, severidade: PrioridadeFinanceiraItem['severidade'], drilldown: Record<string, unknown> = {}): PrioridadeFinanceiraItem {
  return { tipo, severidade, titulo: `Título ${tipo}`, evidencia: `Evidência ${tipo}`, acaoSugerida: `Ação ${tipo}`, destino: 'SOLICITACOES', amostraIds: [], drilldown };
}

type Parcial = { [K in keyof DashboardFinanceiroResponse]?: Partial<DashboardFinanceiroResponse[K]> };

/** Painel "saudável": tudo em dia, sobrescrito por cenário. */
function dados(extra: Parcial = {}): DashboardFinanceiroResponse {
  const base = {
    inicio: '2026-10-01T00:00:00-03:00', fim: '2026-10-31T23:59:59.999-03:00', granularidade: 'MES', atualizadoEm: '2026-11-12T10:00:00-03:00',
    periodo: { inicio: '', fim: '', timezone: 'America/Sao_Paulo', comparacaoInicio: '2026-09-01', comparacaoFim: '2026-09-30', diasNoPeriodo: 31 },
    resumo: { total: 10, totalPeriodoAnterior: 8, variacaoPercentual: 25, compras: 6, pagamentos: 4, rascunhos: 0, aguardandoDecisao: 1, aprovadas: 8, rejeitadas: 1, canceladas: 0, pendentes: 1, percentualPendentes: 10, decididas: 9, taxaAprovacao: 88.9, taxaRejeicao: 11.1, taxaCancelamento: 0, solicitantesDistintos: 3, fornecedoresDistintos: 4, pagamentosComCompraPrevia: 2, percentualComCompraPrevia: 50 },
    valores: { valorSolicitado: 100_000, valorAprovado: 90_000, valorAprovadoPeriodoAnterior: 80_000, variacaoValorAprovado: 12.5, valorRejeitado: 5000, valorCancelado: 0, valorEmAnalise: 5000, corteNaAprovacao: 2000, percentualCorte: 2, taxaAutorizacao: 90, ticketMedioSolicitado: 10_000, ticketMedioAprovado: 11_250, maiorValorSolicitado: 30_000, valorAprovadoCompras: 60_000, valorAprovadoPagamentos: 30_000, valorVencido: 0, quantidadeVencida: 0, valorAVencer: 0, quantidadeAVencer: 0 },
    ciclo: { mediaDiasAteSubmissao: 1, medianaDiasAteSubmissao: 1, p90DiasAteSubmissao: 2, mediaDiasAteDecisao: 2, medianaDiasAteDecisao: 2, p90DiasAteDecisao: 4, mediaDiasCicloTotal: 3, medianaDiasCicloTotal: 3, p90DiasCicloTotal: 6, mediaDiasAteRejeicao: 2, idadeMediaFilaDias: 2, idadeMaximaFilaDias: 3, idadeMediaRascunhosDias: 1, amostraSubmissao: 10, amostraDecisao: 9, decisoesDesfeitas: 0 },
    conformidade: { documentosRecebidos: 8, documentosPeriodoAnterior: 6, variacaoDocumentos: 33, valorDocumentado: 80_000, aguardandoConferencia: 1, comPendencia: 0, conferidos: 6, arquivados: 1, taxaConferencia: 87, idadeMediaFilaDias: 1, idadeMaximaFilaDias: 2, aprovadasComDocumentoFiscal: 8, aprovadasSemDocumentoFiscal: 0, coberturaFiscal: 100, valorSemDocumentoFiscal: 0, semIdentificacao: 0, duplicados: 0, vencidosEmAberto: 0, valorVencidoEmAberto: 0, avulsosSemVinculo: 0 },
    qualidade: { ultimaMovimentacaoEm: '', semFornecedorIdentificado: 0, semDescricao: 0, semCentroCusto: 0, semBase: 0, fornecedoresNaoHomologados: 0, solicitacoesComFornecedorNaoHomologado: 0, aprovadasSemNenhumDocumento: 0, percentualPreenchimento: 95 },
    indicadores: {},
    funil: [],
    porStatus: [],
    serieTemporal: [
      { chave: '2026-09', rotulo: 'set/26', inicio: '2026-09-01T00:00:00-03:00', abertas: 4, valorSolicitado: 40_000, aprovadas: 3, valorAprovado: 35_000, rejeitadas: 1, valorRejeitado: 1000, canceladas: 0, pendentes: 0, taxaAutorizacao: 87 },
      { chave: '2026-10', rotulo: 'out/26', inicio: '2026-10-01T00:00:00-03:00', abertas: 6, valorSolicitado: 60_000, aprovadas: 5, valorAprovado: 55_000, rejeitadas: 0, valorRejeitado: 0, canceladas: 0, pendentes: 1, taxaAutorizacao: 91 }
    ],
    envelhecimento: [
      { faixa: '0-7', idadeMinimaDias: 0, idadeMaximaDias: 7, quantidade: 1, valor: 5000, porTipo: { COMPRA: 1, PAGAMENTO: 0 } },
      { faixa: '8-15', idadeMinimaDias: 8, idadeMaximaDias: 15, quantidade: 0, valor: 0, porTipo: { COMPRA: 0, PAGAMENTO: 0 } },
      { faixa: '>15', idadeMinimaDias: 16, idadeMaximaDias: null, quantidade: 0, valor: 0, porTipo: { COMPRA: 0, PAGAMENTO: 0 } }
    ],
    vencimentos: [
      { faixa: 'VENCIDO', rotulo: 'Vencido', quantidade: 0, valor: 0, percentualValor: 0, diasExtremo: 0 },
      { faixa: '0-7', rotulo: 'Em até 7 dias', quantidade: 0, valor: 0, percentualValor: 0, diasExtremo: 0 }
    ],
    porBase: [], porCentroCusto: [], porObra: [], porFornecedor: [ranking('f1', { percentualValor: 30 })], porTipoDespesa: [], porFormulario: [], porSolicitante: [],
    documentosPorTipo: [], documentosPorSituacao: [],
    prioridades: []
  } as unknown as DashboardFinanceiroResponse;
  const resultado = { ...base } as Record<string, unknown>;
  for (const [chave, valor] of Object.entries(extra)) {
    const atual = (base as unknown as Record<string, unknown>)[chave];
    resultado[chave] = Array.isArray(valor) || typeof valor !== 'object' || valor === null || Array.isArray(atual) ? valor : { ...(atual as object), ...valor };
  }
  return resultado as unknown as DashboardFinanceiroResponse;
}

function solicitacao(extra: Partial<SolicitacaoFinanceira> & { vencimento?: string; tiposDoc?: string[]; tipo?: 'COMPRA' | 'PAGAMENTO' }): SolicitacaoFinanceira {
  const { vencimento, tiposDoc = [], tipo = 'COMPRA', ...resto } = extra;
  return {
    id: 's1', numero: 101, status: 'APROVADO',
    formulario: { id: 'fm', tipoSolicitacao: tipo, codigo: 'F', titulo: 'Compra de material', padrao: true, ativo: true },
    valores: vencimento ? { vencimento: { valor: vencimento } } : {},
    valor: 1500, fornecedor: { id: 'f1', nome: 'Fornecedor A' } as SolicitacaoFinanceira['fornecedor'],
    usuarioSolicitanteId: 'u1', usuarioSolicitante: 'ana', nomeColaboradorSolicitante: 'Ana',
    desfecho: { valorAprovado: 1400 },
    documentos: tiposDoc.map((t, i) => ({ id: `d${i}`, tipo: t })) as unknown as SolicitacaoFinanceira['documentos'],
    acoes: {} as SolicitacaoFinanceira['acoes'], ativo: true, dataCriacao: '2026-10-01T10:00:00-03:00',
    ...resto
  } as SolicitacaoFinanceira;
}

describe('Painel do financeiro — análise', () => {
  describe('datas de gestão', () => {
    it('conta dias corridos e soma dias no calendário', () => {
      expect(diasEntre('2026-11-01', HOJE)).toBe(11);
      expect(diasEntre(HOJE, '2026-11-01')).toBe(-11);
      expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
      expect(diaDe('2026-11-12')).toBe('2026-11-12');
      expect(diaDe('2026-11-13T01:30:00Z')).toBe('2026-11-12');
    });
  });

  describe('cartões', () => {
    it('cada cartão abre a análise que o sustenta e usa tom pelo risco', () => {
      const cartoes = cartoesFinanceiros(dados());
      expect(cartoes.map((c) => c.alvo.value)).toEqual(['autorizacao', 'fila', 'vencimentos', 'documentacao']);
      expect(cartoes[0].progresso).toBe(90);
      expect(cartoes[0].detalhe).toContain('+12,5% vs. período anterior');
      expect(cartoes[2].tom).toBe('green');
      expect(cartoes[3].tom).toBe('green');
    });

    it('vencido vira vermelho e fila antiga também', () => {
      const d = dados({
        valores: { valorVencido: 3000, quantidadeVencida: 2, valorAVencer: 1000, quantidadeAVencer: 1 },
        ciclo: { idadeMaximaFilaDias: 20 },
        conformidade: { coberturaFiscal: 60, aprovadasSemDocumentoFiscal: 3, valorSemDocumentoFiscal: 9000 }
      });
      const [, fila, venc, doc] = cartoesFinanceiros(d);
      expect(fila.tom).toBe('red');
      expect(venc.tom).toBe('red');
      expect(venc.detalhe).toContain('2 despesas vencidas');
      expect(doc.tom).toBe('red');
      expect(doc.detalhe).toContain('3 despesas sem documento fiscal');
    });
  });

  describe('veredito e leituras', () => {
    it('recorte saudável fica sob controle, com a taxa de autorização como progresso', () => {
      const d = dados();
      const leituras = leiturasFinanceiras(d);
      const v = vereditoFinanceiro(d, leituras);
      expect(v.tom).toBe('success');
      expect(v.titulo).toBe('Financeiro sob controle');
      expect(v.progresso?.valor).toBe(90);
      expect(leituras.find((l) => l.id === 'documentacao')?.acao).toBeUndefined();
    });

    it('vencido sem comprovante pede ação agora e vem primeiro nas leituras', () => {
      const d = dados({
        valores: { valorVencido: 12_000, quantidadeVencida: 3 },
        vencimentos: [{ faixa: 'VENCIDO', rotulo: 'Vencido', quantidade: 3, valor: 12_000, percentualValor: 100, diasExtremo: 9 }]
      });
      const leituras = leiturasFinanceiras(d);
      expect(leituras[0].id).toBe('vencido');
      expect(leituras[0].texto).toContain('9 dias');
      expect(leituras[0].acao?.alvo).toEqual({ dimension: 'vencimento', value: 'VENCIDO' });
      const v = vereditoFinanceiro(d, leituras);
      expect(v.tom).toBe('danger');
      expect(v.rotulo).toBe('Agir agora');
      expect(v.titulo).toBe(`${formatarMoedaCompacta(12_000)} vencidos sem comprovante`);
    });

    it('fila antiga sem vencidos põe o número de pedidos acima de 15 dias no título', () => {
      const d = dados({
        ciclo: { idadeMaximaFilaDias: 40 },
        envelhecimento: [{ faixa: '>15', idadeMinimaDias: 16, idadeMaximaDias: null, quantidade: 4, valor: 8000, porTipo: { COMPRA: 2, PAGAMENTO: 2 } }]
      });
      const v = vereditoFinanceiro(d, leiturasFinanceiras(d));
      expect(v.tom).toBe('danger');
      expect(v.titulo).toBe('4 pedidos parados há mais de 15 dias na aprovação');
    });

    it('corte alto e decisão lenta deixam o recorte em acompanhamento', () => {
      const d = dados({ valores: { percentualCorte: 22, corteNaAprovacao: 20_000 }, ciclo: { p90DiasAteDecisao: 21 } });
      const leituras = leiturasFinanceiras(d);
      expect(leituras.map((l) => l.id)).toEqual(expect.arrayContaining(['corte', 'tempo']));
      expect(vereditoFinanceiro(d, leituras).tom).toBe('warning');
    });

    it('sem pedidos, sem fila e sem contas abertas o veredito diz que não há movimento', () => {
      const d = dados({ resumo: { total: 0, aprovadas: 0 }, envelhecimento: [], porFornecedor: [] });
      const v = vereditoFinanceiro(d, leiturasFinanceiras(d));
      expect(v.titulo).toBe('Sem movimento no recorte');
      expect(v.progresso).toBeUndefined();
    });

    it('priorizar mantém a ordem dentro do mesmo tom e corta no limite', () => {
      const itens = [{ tom: 'info' as const, id: 1 }, { tom: 'danger' as const, id: 2 }, { tom: 'info' as const, id: 3 }, { tom: 'warning' as const, id: 4 }];
      expect(priorizar(itens, 3).map((i) => i.id)).toEqual([2, 4, 1]);
    });
  });

  describe('recorte na listagem', () => {
    it('leva filtros de um valor, avisa os que a listagem não reproduz e respeita o que o chamador sobrepõe', () => {
      const r = recorteNaListagem({ tipo: 'PAGAMENTO', idFornecedor: ['f1'], idBase: ['b1', 'b2'], status: ['APROVADO'], prioridade: ['ALTA'] }, ['status']);
      expect(r.tipo).toBe('PAGAMENTO');
      expect(r.filtro).toEqual({ fornecedorId: 'f1' });
      expect(r.ignorados).toEqual(['idBase', 'prioridade']);
    });

    it('datas viram AAAA-MM-DD na URL da listagem e o tipo vai junto', () => {
      const r = recorteNaListagem({ tipo: 'COMPRA', idObra: ['o1'] });
      expect(paramsDaListagem(r, { status: 'SOLICITADO', dataCriacaoInicio: '2026-10-01T00:00:00-03:00', page: 0 })).toEqual({
        obraId: 'o1', status: 'SOLICITADO', dataCriacaoInicio: '2026-10-01', tipo: 'COMPRA'
      });
    });
  });

  describe('linhas de solicitação', () => {
    it('lê vencimento, comprovante, documento fiscal e espera na fila', () => {
      const vencida = linhaSolicitacao(solicitacao({ vencimento: '2026-11-02', tiposDoc: ['NOTA_FISCAL'], tipo: 'PAGAMENTO' }), HOJE);
      expect(vencida.diasParaVencer).toBe(-10);
      expect(vencida.temFiscal).toBe(true);
      expect(vencida.temComprovante).toBe(false);
      expect(textoVencimento(vencida)).toBe('02/11/2026 · venceu há 10 dias');
      const parada = linhaSolicitacao(solicitacao({ status: 'SOLICITADO', dataSubmissao: '2026-10-23T09:00:00-03:00' }), HOJE);
      expect(parada.esperaDias).toBe(20);
      expect(parada.valorAprovado).toBe(1400);
    });
  });

  describe('o que pede ação', () => {
    const filtros = { idFornecedor: ['f1'] };

    it('ordena do mais grave para o menos grave e leva cada linha ao destino que a reproduz', () => {
      const d = dados({
        prioridades: [
          prioridade('CONCENTRACAO_FORNECEDOR', 'BAIXA', { idFornecedor: ['f9'] }),
          prioridade('APROVACAO_PARADA', 'CRITICA', { status: ['SOLICITADO'], diasParadoMinimo: 7 }),
          prioridade('DOCUMENTO_AGUARDANDO_CONFERENCIA', 'MEDIA')
        ]
      });
      const itens = pendenciasFinanceiras(d, filtros, null, HOJE);
      expect(itens.map((p) => p.gravidade)).toEqual(['Crítica', 'Média', 'Baixa']);
      expect(itens[0].destino).toEqual({
        tipo: 'rota', rota: ['/financeiro/gestao/solicitacoes'],
        queryParams: { fornecedorId: 'f1', status: 'SOLICITADO', dataSubmissaoFim: '2026-11-05' }
      });
      expect(itens[1].destino).toEqual({ tipo: 'rota', rota: ['/financeiro/documentos'], queryParams: { aguardando: 'true' } });
      expect(itens[2].destino).toEqual({ tipo: 'analise', alvo: { dimension: 'ranking', value: 'fornecedor~f9' } });
    });

    it('registros individuais: só vencidas sem comprovante e pedidos parados além do prazo, abrindo o registro', () => {
      const registros = {
        vencidas: [
          solicitacao({ id: 'v1', numero: 1, vencimento: '2026-11-10', tipo: 'PAGAMENTO' }),
          solicitacao({ id: 'v2', numero: 2, vencimento: '2026-11-01', tiposDoc: ['COMPROVANTE_PAGAMENTO'] }),
          solicitacao({ id: 'v3', numero: 3, vencimento: '2026-10-20' })
        ],
        parados: [
          solicitacao({ id: 'p1', numero: 4, status: 'SOLICITADO', dataSubmissao: '2026-11-08T10:00:00-03:00' }),
          solicitacao({ id: 'p2', numero: 5, status: 'SOLICITADO', dataSubmissao: '2026-10-20T10:00:00-03:00' }),
          solicitacao({ id: 'p3', numero: 6, status: 'SOLICITADO', dataSubmissao: '2026-11-01T10:00:00-03:00' })
        ]
      };
      const itens = pendenciasFinanceiras(dados(), {}, registros, HOJE);
      expect(itens.map((p) => p.chave)).toEqual(['v-v3', 's-p2', 'v-v1', 's-p3']);
      expect(itens[0].prazo).toBe('Venceu há 23 dias');
      expect(itens[0].valor).toBe(1400);
      expect(itens[1].tom).toBe('danger');
      expect(itens[3].tom).toBe('warning');
      expect(itens[2].destino).toEqual({ tipo: 'rota', rota: ['/financeiro/pagamentos', 'v1'] });
    });

    it('sem prioridades nem registros, a lista fica vazia', () => {
      expect(pendenciasFinanceiras(dados(), {}, { parados: null, vencidas: null }, HOJE)).toEqual([]);
    });
  });

  describe('análises (drill-down)', () => {
    const pagina = { content: [solicitacao({ status: 'SOLICITADO', dataSubmissao: '2026-10-30T10:00:00-03:00' })], page: { totalElements: 1, totalPages: 1, number: 0, size: 200 } };
    const financeiro = { listarSolicitacoes: vi.fn(() => of(pagina)) } as unknown as ContextoAnaliseFinanceiro['financeiro'];
    const ctx = (d = dados()): ContextoAnaliseFinanceiro => ({ d, filtros: { tipo: 'COMPRA', idFornecedor: ['f1'] }, financeiro, hoje: HOJE });

    it('fila abre os pedidos aguardando decisão do mais antigo ao mais recente, com os filtros do painel', () => {
      const v = vistaFinanceiro({ dimension: 'kpi', value: 'fila' }, ctx())!;
      expect(v.eyebrow).toBe('Fila de aprovação');
      expect(v.origem!.chave).toContain('"status":"SOLICITADO"');
      expect(v.origem!.chave).toContain('"fornecedorId":"f1"');
      expect(v.origem!.chave).toContain('"sort":"dataSubmissao,asc"');
      expect(v.graficos[0].aoSelecionar!(0)).toEqual({ tipo: 'navegar', alvo: { dimension: 'faixa', value: '0-7' } });
      let linhas: unknown[] = [];
      v.origem!.carregar().subscribe((r) => (linhas = r.linhas));
      expect(financeiro.listarSolicitacoes).toHaveBeenCalledWith('COMPRA', expect.objectContaining({ status: 'SOLICITADO', fornecedorId: 'f1' }));
      expect((linhas[0] as { esperaDias: number }).esperaDias).toBe(13);
    });

    it('faixa de vencimento vira intervalo de datas e abre só o que falta comprovante', () => {
      const v = vistaFinanceiro({ dimension: 'vencimento', value: 'VENCIDO' }, ctx())!;
      expect(v.origem!.chave).toContain('"vencimentoFim":"2026-11-11"');
      expect(v.origem!.filtroInicial!.chave).toBe('sem-comprovante');
      expect(v.proximo!.alvo).toEqual({ dimension: 'vencimento', value: '0-7' });
      expect(vistaFinanceiro({ dimension: 'vencimento', value: 'X' }, ctx())).toBeNull();
    });

    it('período da série navega entre vizinhos e recorta a coorte de abertura', () => {
      const v = vistaFinanceiro({ dimension: 'periodo', value: '2026-09' }, ctx())!;
      expect(v.titulo).toBe('set/26');
      expect(v.anterior).toBeUndefined();
      expect(v.proximo!.alvo.value).toBe('2026-10');
      expect(v.origem!.chave).toContain('"dataCriacaoInicio":"2026-10-01T00:00:00-03:00"');
    });

    it('item do ranking filtra a listagem pela dimensão; dimensão sem filtro na listagem fica sem origem', () => {
      const fornecedor = vistaFinanceiro({ dimension: 'ranking', value: 'fornecedor~f1' }, ctx())!;
      expect(fornecedor.titulo).toBe('Item f1');
      expect(fornecedor.origem!.chave).toContain('"fornecedorId":"f1"');
      const centro = vistaFinanceiro({ dimension: 'ranking', value: 'centroCusto~c1' }, ctx(dados({ porCentroCusto: [ranking('c1')] })))!;
      expect(centro.origem).toBeUndefined();
      expect(vistaFinanceiro({ dimension: 'ranking', value: 'fornecedor~nao-existe' }, ctx())).toBeNull();
      expect(vistaFinanceiro({ dimension: 'kpi', value: 'outro' }, ctx())).toBeNull();
    });

    it('documentação abre as aprovadas do período filtradas pelas que não têm documento fiscal', () => {
      const v = vistaFinanceiro({ dimension: 'kpi', value: 'documentacao' }, ctx())!;
      expect(v.origem!.filtroInicial!.chave).toBe('sem-fiscal');
      expect(v.origem!.chave).toContain('"status":"APROVADO"');
      expect(v.links![0].rota).toBe('/financeiro/documentos');
    });
  });
});
