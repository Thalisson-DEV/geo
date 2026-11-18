import { HistoricoAlteracaoItem, HistoricoSolicitacaoEvento, HistoricoSolicitacaoResponse } from '../../../core/models/solicitacao-material-tecnica.models';
import { EfeitoEstoque, SituacaoFechamento } from '../../../core/models/fechamento-obra.models';
import { EFEITOS, SEM_COLABORADOR, SITUACOES } from './fechamento-ui';

type Registro = Record<string, unknown>;

/** Do que vem na criação, só isto faz sentido no fechamento: status, equipe e login não dizem nada aqui. */
const DETALHES_VISIVEIS = ['almoxarifado', 'observacao', 'itens'];
const CAMINHOS_OCULTOS = /^(encarregado|supervisor)/;
const EFEITO_DA_MOVIMENTACAO = /^movimentacoes\[[^\]]+\]\.efeitoEstoque$/;
const OUTRO_DADO_DA_MOVIMENTACAO = /^movimentacoes\[/;
const ITEM_POR_CODIGO = /^itens\[([^\]]+)\](.*)$/;

function registro(valor: unknown): Registro | null {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Registro) : null;
}

function itensDoEvento(evento: HistoricoSolicitacaoEvento): Registro[] {
  const itens = registro(evento.payload?.snapshots)?.['itens'];
  return Array.isArray(itens) ? itens.map(registro).filter((i): i is Registro => !!i) : [];
}

/** As alterações citam o material pelo código; a linha do tempo acha o item pelo id. */
function idDoItem(codigo: string, itens: Registro[]): string | null {
  const item = itens.find((i) => {
    const material = registro(i['material']);
    const rotulo = typeof material?.['snapshot'] === 'string' ? material['snapshot'] : '';
    return rotulo === codigo || rotulo.startsWith(`${codigo} - `);
  });
  return typeof item?.['id'] === 'string' ? item['id'] : null;
}

function nomeSituacao(valor: unknown): unknown {
  return typeof valor === 'string' && valor in SITUACOES ? SITUACOES[valor as SituacaoFechamento].label : valor;
}

function nomeEfeito(valor: unknown): unknown {
  return typeof valor === 'string' && valor in EFEITOS ? EFEITOS[valor as EfeitoEstoque].label : valor;
}

function alteracaoLegivel(a: HistoricoAlteracaoItem, itens: Registro[]): HistoricoAlteracaoItem | null {
  if (CAMINHOS_OCULTOS.test(a.caminho)) return null;
  if (a.caminho === 'situacao') {
    if (a.valorAnterior === a.valorNovo) return null;
    return { ...a, valorAnterior: nomeSituacao(a.valorAnterior), valorNovo: nomeSituacao(a.valorNovo) };
  }
  if (EFEITO_DA_MOVIMENTACAO.test(a.caminho)) {
    return { ...a, caminho: 'efeitoEstoque', valorAnterior: nomeEfeito(a.valorAnterior), valorNovo: nomeEfeito(a.valorNovo) };
  }
  if (OUTRO_DADO_DA_MOVIMENTACAO.test(a.caminho)) return null;
  const item = a.caminho.match(ITEM_POR_CODIGO);
  const id = item ? idDoItem(item[1], itens) : null;
  return id ? { ...a, caminho: `itens[${id}]${item![2]}` } : a;
}

function eventoLegivel(evento: HistoricoSolicitacaoEvento): HistoricoSolicitacaoEvento {
  const itens = itensDoEvento(evento);
  const snapshots = registro(evento.payload?.snapshots);
  const alteracoes = Array.isArray(evento.payload?.alteracoes) ? evento.payload.alteracoes : [];
  return {
    ...evento,
    // Id vazio: o nome não é trocado pelo login, e quem não tem colaborador aparece como tal.
    autor: evento.autor?.id ? { id: '', nome: evento.autor.nome ?? SEM_COLABORADOR } : evento.autor,
    payload: {
      ...evento.payload,
      alteracoes: alteracoes.map((a) => alteracaoLegivel(a, itens)).filter((a): a is HistoricoAlteracaoItem => !!a),
      snapshots: snapshots
        ? Object.fromEntries(
            Object.entries(snapshots)
              .filter(([campo]) => DETALHES_VISIVEIS.includes(campo))
              .map(([campo, valor]) => [campo, campo === 'itens' ? itens.map(({ tipoTecnico: _tipo, ...item }) => item) : valor])
          )
        : evento.payload?.snapshots
    }
  };
}

/**
 * O histórico do encerramento vem no mesmo contrato do técnico, mas com o vocabulário dele: aqui vira
 * o que a linha do tempo compartilhada sabe mostrar, sem o que não faz sentido para quem lê.
 */
export function historicoFechamentoLegivel(resposta: HistoricoSolicitacaoResponse): HistoricoSolicitacaoResponse {
  return { ...resposta, eventos: (resposta.eventos ?? []).map(eventoLegivel) };
}
