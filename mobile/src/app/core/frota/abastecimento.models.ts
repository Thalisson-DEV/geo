/**
 * Abastecimento no app: catálogo baixado na sincronização (postos, produtos e o combustível de cada
 * veículo), o pedido no aparelho (rascunho, fila e o que o servidor devolveu) e as regras que o app
 * confere antes de enfileirar. O servidor repete as validações; aqui é para a equipe não descobrir
 * o erro só depois.
 */

export type CategoriaProduto = 'COMBUSTIVEL' | 'ARLA' | 'OLEO' | 'FLUIDO';
export type SituacaoAbastecimento = 'AGUARDANDO_APROVACAO' | 'APROVADA' | 'REPROVADA' | 'LIBERADA' | 'REALIZADA' | 'CANCELADA' | 'VENCIDA';
export type StatusEnvio = 'RASCUNHO' | 'FILA' | 'ENVIANDO' | 'ENVIADO' | 'ERRO';

export interface PostoCatalogo {
  id: string;
  nome: string;
  idBaseOperacional: string | null;
  baseNome: string | null;
  /** Preço de hoje por produto: o realizado calcula o valor por ele. Ausente em catálogos antigos. */
  precos?: { idProduto: string; precoUnitario: number }[];
}

/** Preço do produto no posto (catálogo do aparelho), ou nulo sem cadastro. */
export function precoNoPosto(catalogo: CatalogoAbastecimento | null | undefined, idPosto: string | null | undefined,
                             idProduto: string | null | undefined): number | null {
  if (!catalogo || !idPosto || !idProduto) return null;
  return catalogo.postos.find((p) => p.id === idPosto)?.precos?.find((p) => p.idProduto === idProduto)?.precoUnitario ?? null;
}

export interface ProdutoCatalogo {
  id: string;
  nome: string;
  categoria: CategoriaProduto;
  unidade: 'L' | 'UN';
}

export interface CatalogoAbastecimento {
  geradoEm: string;
  postos: PostoCatalogo[];
  produtos: ProdutoCatalogo[];
  /** Combustível sugerido pela ficha de cada veículo. */
  preferidos: { idVeiculo: string; idProduto: string }[];
}

/** Foto guardada no aparelho no instante da captura. */
export interface FotoAbastecimentoLocal {
  idFoto: string;
  arquivo: Blob;
  nomeArquivo: string;
  enviada: boolean;
}

/** A equipe pede só o produto: quem aprova define a quantidade (gestores, 23/10/2026). */
export interface ItemPedidoLocal {
  idProduto: string;
  nome: string;
  categoria: CategoriaProduto;
  unidade: 'L' | 'UN';
  /** Só nos pedidos antigos do aparelho; não vai mais ao servidor. */
  quantidade?: number | null;
}

/** Item como o servidor gravou (o id é o que o realizado usa). */
export interface ItemServidor {
  id: string;
  categoria: CategoriaProduto;
  idProdutoPedido: string;
  produtoPedido: string;
  /** Só nos pedidos antigos: hoje a equipe pede só o produto. */
  quantidadePedida: number | null;
  /** Definida por quem aprova. */
  quantidadeAprovada?: number | null;
  /** Ajuste da liberação. */
  quantidadeLiberada?: number | null;
  /** A que vale no posto: liberada, senão aprovada. */
  quantidadeAutorizada?: number | null;
  unidade: string;
  idProduto: string | null;
  produto: string | null;
  quantidade: number | null;
  valorTotal: number | null;
  valorUnitario: number | null;
  tanqueCheio: boolean | null;
}

/** Resposta do servidor ao app (lista, pedido, cancelamento e realizado). */
export interface AbastecimentoServidor {
  id: string;
  idAparelho: string;
  idVeiculo: string;
  placa: string | null;
  situacao: SituacaoAbastecimento;
  situacaoRotulo: string;
  idPosto: string;
  posto: string;
  condutor: string | null;
  /** Nula só no avulso lançado na web sem KM. */
  medicaoSolicitacao: number | null;
  solicitadoEm: string;
  aprovadoEm: string | null;
  liberadoEm: string | null;
  venceEm: string | null;
  realizadoEm: string | null;
  motivoReprovacao: string | null;
  motivoCancelamento: string | null;
  itens: ItemServidor[];
  fotosPendentes: string[];
  podeCancelar: boolean;
  medicaoValida: boolean;
  motivoMedicao: string | null;
  /** Todas as fotos do pedido (id do aparelho), para o detalhe. Ausente em respostas antigas. */
  fotos?: FotoServidor[];
  aprovador?: string | null;
  liberador?: string | null;
  destino?: string | null;
}

export interface FotoServidor {
  idFoto: string;
  tipo: 'PAINEL_ANTES' | 'PAINEL_DEPOIS' | 'CUPOM';
  tipoRotulo: string;
  recebida: boolean;
}

export interface ItemRealizadoLocal {
  idItem: string;
  /** Produto entregue; nulo = o mesmo do pedido. */
  idProduto: string | null;
  quantidade: number | null;
  /** Digitado só quando o posto não tem preço do produto. */
  valorTotal: number | null;
  /** Preço do posto para o produto entregue; com ele, o valor sai calculado. */
  precoPosto?: number | null;
  tanqueCheio: boolean;
}

export interface RealizadoLocal {
  statusSync: Exclude<StatusEnvio, 'RASCUNHO'> | 'RASCUNHO';
  medicao: number | null;
  realizadoEm: string | null;
  itens: ItemRealizadoLocal[];
  fotoPainel: FotoAbastecimentoLocal | null;
  fotoCupom: FotoAbastecimentoLocal | null;
  registrado?: boolean;
  erro?: string | null;
}

export interface CancelamentoLocal {
  statusSync: Exclude<StatusEnvio, 'RASCUNHO'>;
  motivo: string;
  erro?: string | null;
}

/**
 * Pedido de abastecimento no aparelho. O `id` é o id do aparelho (idempotência no servidor).
 * RASCUNHO enquanto preenche; FILA depois de confirmado; ENVIANDO/ENVIADO conforme a fila; ERRO
 * quando o servidor recusou. Depois de enviado, `servidor` traz a situação (aprovado, liberado…).
 */
export interface AbastecimentoLocal {
  id: string;
  statusSync: StatusEnvio;
  passo: number;
  idVeiculo: string | null;
  placa: string | null;
  idCondutor: string | null;
  condutorNome: string | null;
  idPosto: string | null;
  postoNome: string | null;
  medicao: number | null;
  /** Para onde vai: a gestão define a quantidade por ele. */
  destino?: string;
  observacao: string;
  itens: ItemPedidoLocal[];
  fotoPainel: FotoAbastecimentoLocal | null;
  solicitadoEm: string | null;
  registrado?: boolean;
  erro?: string | null;
  /** Aviso devolvido pelo servidor (ex.: medição menor que a anterior). */
  aviso?: string | null;
  servidor?: AbastecimentoServidor | null;
  realizado?: RealizadoLocal | null;
  cancelamento?: CancelamentoLocal | null;
  criadoEm: string;
}

export const ROTULO_CATEGORIA: Record<CategoriaProduto, string> = {
  COMBUSTIVEL: 'Combustível',
  ARLA: 'ARLA',
  OLEO: 'Óleo',
  FLUIDO: 'Fluido'
};

const EM_ANDAMENTO: SituacaoAbastecimento[] = ['AGUARDANDO_APROVACAO', 'APROVADA', 'LIBERADA'];

/** Situação para a equipe: a do servidor, ou a do aparelho enquanto não chegou lá. */
export function situacaoParaEquipe(a: AbastecimentoLocal): { rotulo: string; tom: 'ok' | 'atencao' | 'erro' | 'neutro' | 'destaque'; apoio: string } {
  if (a.cancelamento && a.cancelamento.statusSync !== 'ENVIADO' && a.servidor?.situacao !== 'CANCELADA') {
    return a.cancelamento.statusSync === 'ERRO'
      ? { rotulo: 'Cancelamento recusado', tom: 'erro', apoio: a.cancelamento.erro ?? 'O servidor não aceitou o cancelamento.' }
      : { rotulo: 'Cancelando', tom: 'neutro', apoio: 'O cancelamento vai quando o sinal voltar.' };
  }
  if (a.realizado && a.realizado.statusSync !== 'RASCUNHO' && a.servidor?.situacao !== 'REALIZADA') {
    return a.realizado.statusSync === 'ERRO'
      ? { rotulo: 'Registro recusado', tom: 'erro', apoio: a.realizado.erro ?? 'O servidor não aceitou o registro.' }
      : { rotulo: 'Abastecido', tom: 'ok', apoio: 'Registro salvo no aparelho; vai quando o sinal voltar.' };
  }
  const s = a.servidor;
  if (!s && a.cancelamento?.statusSync === 'ENVIADO') return { rotulo: 'Cancelado', tom: 'neutro', apoio: a.cancelamento.motivo || 'Cancelado antes de sair do aparelho.' };
  if (!s) {
    if (a.statusSync === 'ERRO') return { rotulo: 'Recusado', tom: 'erro', apoio: a.erro ?? 'O servidor recusou o pedido.' };
    return { rotulo: 'Na fila', tom: 'neutro', apoio: 'O pedido vai para o gestor quando o sinal voltar.' };
  }
  switch (s.situacao) {
    case 'AGUARDANDO_APROVACAO': return { rotulo: 'Aguardando aprovação', tom: 'atencao', apoio: 'O gestor da placa ainda não decidiu.' };
    case 'APROVADA': return { rotulo: 'Aprovado', tom: 'destaque', apoio: 'Falta o administrativo liberar e avisar o posto.' };
    case 'LIBERADA': return { rotulo: 'Liberado', tom: 'ok', apoio: `Pode abastecer no ${s.posto} até as 23h59.` };
    case 'REALIZADA': return { rotulo: 'Abastecido', tom: 'ok', apoio: s.realizadoEm ? `Registrado ${hora(s.realizadoEm)}` : 'Registrado' };
    case 'REPROVADA': return { rotulo: 'Reprovado', tom: 'erro', apoio: s.motivoReprovacao ?? 'O gestor reprovou o pedido.' };
    case 'CANCELADA': return { rotulo: 'Cancelado', tom: 'neutro', apoio: s.motivoCancelamento ?? 'Pedido cancelado.' };
    default: return { rotulo: 'Venceu', tom: 'neutro', apoio: 'Não foi usado até o fim do dia. Se precisar, peça de novo.' };
  }
}

/** Ainda conta como pedido aberto (bloqueia outro pedido para o mesmo veículo). */
export function emAndamento(a: AbastecimentoLocal): boolean {
  if (a.statusSync === 'RASCUNHO') return false;
  if (a.cancelamento && a.cancelamento.statusSync !== 'ERRO') return false;
  if (a.realizado && a.realizado.statusSync !== 'RASCUNHO' && a.realizado.statusSync !== 'ERRO') return false;
  if (!a.servidor) return a.statusSync !== 'ERRO';
  return EM_ANDAMENTO.includes(a.servidor.situacao);
}

/** A equipe registra o abastecimento só depois de liberado. */
export function podeRegistrarRealizado(a: AbastecimentoLocal): boolean {
  return a.servidor?.situacao === 'LIBERADA' && (!a.realizado || a.realizado.statusSync === 'RASCUNHO' || a.realizado.statusSync === 'ERRO')
    && (!a.cancelamento || a.cancelamento.statusSync === 'ERRO');
}

/** Antes da liberação a equipe cancela; depois, só o administrativo (o servidor diz em `podeCancelar`). */
export function podeCancelar(a: AbastecimentoLocal): boolean {
  if (a.cancelamento && a.cancelamento.statusSync !== 'ERRO') return false;
  if (a.realizado && a.realizado.statusSync !== 'RASCUNHO' && a.realizado.statusSync !== 'ERRO') return false;
  if (!a.servidor) return a.statusSync === 'FILA' || a.statusSync === 'ERRO';
  return a.servidor.podeCancelar;
}

/** O que falta no pedido, por passo, ou lista vazia. */
export function pendenciasPedido(a: AbastecimentoLocal): { veiculo: string | null; inicio: string | null; itens: string | null; foto: string | null } {
  return {
    veiculo: a.idVeiculo ? null : 'Escolha o veículo.',
    inicio: !a.idCondutor ? 'Escolha quem vai dirigir.' : !a.idPosto ? 'Escolha o posto.' : a.medicao === null ? 'Informe a medição do painel.'
      : !a.destino?.trim() ? 'Informe o destino.' : null,
    itens: !a.itens.length ? 'Escolha o que precisa abastecer.' : null,
    foto: a.fotoPainel ? null : 'Tire a foto do painel mostrando a medição e o tanque.'
  };
}

export function pendenciasRealizado(r: RealizadoLocal): { valores: string | null; fotos: string | null } {
  const semQuantidade = r.itens.some((i) => i.quantidade === null || i.quantidade < 0);
  const semValor = r.itens.some((i) => i.precoPosto == null && !!i.quantidade && (i.valorTotal === null || i.valorTotal <= 0));
  return {
    valores: r.medicao === null ? 'Informe a medição do painel depois de abastecer.'
      : semQuantidade ? 'Informe a quantidade de cada item (zero se não veio).'
        : r.itens.every((i) => !i.quantidade) ? 'Nenhum item foi entregue. Se não abasteceu, peça o cancelamento.'
          : semValor ? 'O posto não tem preço deste produto cadastrado: informe o valor pago.' : null,
    fotos: !r.fotoPainel ? 'Tire a foto do painel depois de abastecer.' : !r.fotoCupom ? 'Tire a foto do cupom ou da nota.' : null
  };
}

/** Pedido do servidor (sem os arquivos: a foto sobe depois, pelo id). */
export function montarSolicitacao(a: AbastecimentoLocal) {
  return {
    idAparelho: a.id,
    idVeiculo: a.idVeiculo,
    idCondutor: a.idCondutor,
    idPosto: a.idPosto,
    medicao: a.medicao,
    destino: a.destino?.trim() || null,
    observacao: a.observacao.trim() || null,
    solicitadoEm: a.solicitadoEm,
    itens: a.itens.map((i) => ({ idProduto: i.idProduto })),
    idFotoPainel: a.fotoPainel?.idFoto ?? null
  };
}

export function montarRealizado(r: RealizadoLocal) {
  return {
    medicao: r.medicao,
    realizadoEm: r.realizadoEm,
    itens: r.itens.map((i) => ({ idItem: i.idItem, idProduto: i.idProduto, quantidade: i.quantidade,
      valorTotal: i.precoPosto != null ? null : i.valorTotal, tanqueCheio: i.tanqueCheio })),
    idFotoPainel: r.fotoPainel?.idFoto ?? null,
    idFotoCupom: r.fotoCupom?.idFoto ?? null
  };
}

/** Quantidade que vale no posto: a liberada (ou aprovada); a pedida só nos pedidos antigos. */
export function quantidadeAutorizada(i: ItemServidor): number | null {
  return i.quantidadeAutorizada ?? i.quantidadePedida ?? null;
}

/**
 * Realizado começa com o liberado: mesmo produto, a quantidade liberada e o valor pelo preço do
 * posto. A equipe só corrige a quantidade quando o tanque enche antes. Item retirado na
 * aprovação ou na liberação (zero) não entra.
 */
export function novoRealizado(s: AbastecimentoServidor, catalogo?: CatalogoAbastecimento | null): RealizadoLocal {
  return {
    statusSync: 'RASCUNHO',
    medicao: null,
    realizadoEm: null,
    itens: s.itens.filter((i) => quantidadeAutorizada(i) !== 0).map((i) => {
      const quantidade = quantidadeAutorizada(i);
      const precoPosto = precoNoPosto(catalogo, s.idPosto, i.idProdutoPedido);
      return { idItem: i.id, idProduto: null, quantidade, precoPosto, valorTotal: valorPeloPreco(quantidade, precoPosto), tanqueCheio: false };
    }),
    fotoPainel: null,
    fotoCupom: null
  };
}

/** Quantidade × preço do posto, em centavos, ou nulo sem preço. */
export function valorPeloPreco(quantidade: number | null, preco: number | null | undefined): number | null {
  if (preco == null || quantidade === null) return null;
  return Math.round(quantidade * preco * 100) / 100;
}

/** R$ por unidade (3 casas, como no cupom), ou nulo enquanto falta valor. */
export function precoUnitario(item: Pick<ItemRealizadoLocal, 'quantidade' | 'valorTotal'> & { precoPosto?: number | null }): number | null {
  if (item.precoPosto != null) return item.precoPosto;
  if (!item.quantidade || !item.valorTotal) return null;
  return Math.round((item.valorTotal / item.quantidade) * 1000) / 1000;
}

/** O que o servidor devolveu entra no registro do aparelho, sem perder o que só existe aqui. */
export function mesclarServidor(local: AbastecimentoLocal | undefined, s: AbastecimentoServidor): AbastecimentoLocal {
  const base: AbastecimentoLocal = local ?? {
    id: s.idAparelho,
    statusSync: 'ENVIADO',
    passo: 99,
    idVeiculo: s.idVeiculo,
    placa: s.placa,
    idCondutor: null,
    condutorNome: s.condutor,
    idPosto: s.idPosto,
    postoNome: s.posto,
    medicao: s.medicaoSolicitacao,
    destino: s.destino ?? '',
    observacao: '',
    itens: s.itens.map((i) => ({ idProduto: i.idProdutoPedido, nome: i.produtoPedido, categoria: i.categoria,
      unidade: i.unidade.toUpperCase() === 'L' ? 'L' : 'UN', quantidade: quantidadeAutorizada(i) })),
    fotoPainel: null,
    solicitadoEm: s.solicitadoEm,
    registrado: true,
    criadoEm: s.solicitadoEm
  };
  const realizado = base.realizado && s.situacao === 'REALIZADA' ? { ...base.realizado, statusSync: 'ENVIADO' as const, registrado: true, erro: null } : base.realizado;
  const cancelamento = base.cancelamento && s.situacao === 'CANCELADA' ? { ...base.cancelamento, statusSync: 'ENVIADO' as const, erro: null } : base.cancelamento;
  return { ...base, registrado: true, servidor: s, realizado, cancelamento };
}

/** Ordem da lista: o que pede ação primeiro (liberado para abastecer, recusado), depois o mais novo. */
export function ordenarParaEquipe(lista: AbastecimentoLocal[]): AbastecimentoLocal[] {
  const peso = (a: AbastecimentoLocal) =>
    podeRegistrarRealizado(a) ? 0 : situacaoParaEquipe(a).tom === 'erro' && emAndamento(a) ? 1 : emAndamento(a) ? 2 : 3;
  return [...lista].sort((a, b) => peso(a) - peso(b) || (b.solicitadoEm ?? b.criadoEm).localeCompare(a.solicitadoEm ?? a.criadoEm));
}

export function formatarQuantidade(valor: number | null | undefined, unidade: string): string {
  if (valor === null || valor === undefined) return '—';
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${unidade.toUpperCase() === 'L' ? 'l' : 'un'}`;
}

export function formatarMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function hora(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
