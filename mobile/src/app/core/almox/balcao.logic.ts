/** Cópia das regras do balcão do web (frontend/.../balcao/balcao.logic.ts): as duas telas montam o mesmo pedido. */
import {
  AtendimentoEquipe,
  ComprovanteBalcao,
  DestinoDevolucao,
  GrupoCaminhao,
  PessoaBalcao,
  RegistrarDevolucaoRequest,
  RegistrarRetiradaRequest,
  RegrasBalcao,
  RetiradaObra,
} from './balcao.models';

/** Quantidade a entregar de cada item da retirada, por id do item da solicitação. */
export type QuantidadesRetirada = Record<string, number | null>;

/** Linha editável da devolução: uma por material, condição e obra do caminhão (ou incluída à mão). */
export interface LinhaDevolucao {
  chave: string;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string | null;
  condicao: 'NOVO' | 'SUCATA';
  idObra: string | null;
  numeroObra: string | null;
  noCaminhao: number;
  quantidade: number | null;
  destino: DestinoDevolucao;
  detalhaSerie: boolean;
  series: string[];
  incluida: boolean;
}

export function chaveLinha(idMaterial: string, condicao: string, idObra: string | null): string {
  return `${idMaterial}|${condicao}|${idObra ?? 'livre'}`;
}

/** Retirada pronta para conferir: tudo o que falta de cada item. */
export function quantidadesIniciais(retiradas: RetiradaObra[]): QuantidadesRetirada {
  const q: QuantidadesRetirada = {};
  for (const r of retiradas) for (const i of r.itens) q[i.idItem] = i.falta;
  return q;
}

/** Devolução sugerida: tudo o que está no caminhão volta (a rotina de Timon devolve a sobra todo dia). */
export function linhasDevolucao(caminhao: GrupoCaminhao[]): LinhaDevolucao[] {
  const linhas: LinhaDevolucao[] = [];
  for (const g of caminhao) {
    for (const i of g.itens) {
      if (i.detalhaSerie && i.series.length) {
        // Material com série volta uma série por linha.
        for (const serie of i.series) {
          linhas.push({
            chave: chaveLinha(i.idMaterial, i.condicao, g.idObra) + '|' + serie,
            idMaterial: i.idMaterial, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade,
            condicao: i.condicao, idObra: g.idObra, numeroObra: g.numeroObra, noCaminhao: 1, quantidade: 1,
            destino: 'GUARDAR', detalhaSerie: true, series: [serie], incluida: false,
          });
        }
        continue;
      }
      linhas.push({
        chave: chaveLinha(i.idMaterial, i.condicao, g.idObra),
        idMaterial: i.idMaterial, codigo: i.codigo, descricao: i.descricao, unidade: i.unidade,
        condicao: i.condicao, idObra: g.idObra, numeroObra: g.numeroObra, noCaminhao: i.quantidade,
        quantidade: i.quantidade, destino: 'GUARDAR', detalhaSerie: i.detalhaSerie, series: [], incluida: false,
      });
    }
  }
  return linhas;
}

export interface ItemRetiradaResumo {
  itens: number;
  excedentes: number;
  semReserva: string[];
}

export function resumoRetirada(retiradas: RetiradaObra[], q: QuantidadesRetirada, reservas: Record<string, string>): ItemRetiradaResumo {
  let itens = 0;
  let excedentes = 0;
  const semReserva: string[] = [];
  for (const r of retiradas) {
    let algum = false;
    for (const i of r.itens) {
      const valor = q[i.idItem] ?? 0;
      if (valor > 0) {
        itens++;
        algum = true;
        if (valor > i.falta) excedentes++;
      }
    }
    if (algum && !r.reserva && !(reservas[r.idSolicitacao] ?? '').trim()) semReserva.push(r.numeroObra ?? 'sem número');
  }
  return { itens, excedentes, semReserva };
}

export function montarRetirada(
  atendimento: AtendimentoEquipe,
  q: QuantidadesRetirada,
  reservas: Record<string, string>,
  motivos: Record<string, string>,
  comprovante: ComprovanteBalcao,
): RegistrarRetiradaRequest {
  return {
    idAlmoxarifado: atendimento.idAlmoxarifado,
    comprovante,
    solicitacoes: atendimento.retiradas
      .map((r) => ({
        idSolicitacao: r.idSolicitacao,
        numeroReserva: r.reserva ? null : (reservas[r.idSolicitacao] ?? '').trim() || null,
        itens: r.itens
          .filter((i) => (q[i.idItem] ?? 0) > 0)
          .map((i) => ({
            idItemSolicitacao: i.idItem,
            quantidade: q[i.idItem] as number,
            motivoExcedente: (q[i.idItem] as number) > i.falta ? (motivos[i.idItem] ?? '').trim() || null : null,
          })),
      }))
      .filter((s) => s.itens.length > 0),
  };
}

export function montarDevolucao(idAlmoxarifado: string, linhas: LinhaDevolucao[], comprovante: ComprovanteBalcao): RegistrarDevolucaoRequest {
  return {
    idAlmoxarifado,
    comprovante,
    itens: linhas
      .filter((l) => (l.quantidade ?? 0) > 0)
      .map((l) => ({
        idMaterial: l.idMaterial,
        condicao: l.condicao,
        idObra: l.idObra,
        quantidade: l.quantidade as number,
        numeroSerie: l.detalhaSerie ? l.series[0] ?? null : null,
        destino: l.destino,
      })),
  };
}

/** O que ainda falta para registrar (vazio = pode confirmar). */
export function pendenciasComprovante(regras: RegrasBalcao, c: ComprovanteBalcao, pessoa: PessoaBalcao | null): string[] {
  const faltas: string[] = [];
  // Quem retira é escolhido (da equipe ou de fora); a matrícula vem do cadastro do colaborador. De quem é de fora o
  // sistema confere a matrícula ao registrar.
  if (!c.idColaborador) faltas.push('quem retira');
  else if (regras.exigeMatricula && pessoa && !pessoa.deFora && !pessoa.matricula) faltas.push('a matrícula no cadastro');
  if (regras.exigeAssinatura && !c.assinatura) faltas.push('a assinatura');
  if (regras.exigeFoto && !c.foto) faltas.push('a foto');
  return faltas;
}

/** "a matrícula, a assinatura e a foto" */
export function juntarFaltas(faltas: string[]): string {
  if (faltas.length <= 1) return faltas[0] ?? '';
  return `${faltas.slice(0, -1).join(', ')} e ${faltas[faltas.length - 1]}`;
}

/** Pessoa da equipe pela matrícula digitada (sem diferença de maiúsculas e espaços). */
export function pessoaPelaMatricula(pessoas: PessoaBalcao[], matricula: string | null | undefined): PessoaBalcao | null {
  const alvo = (matricula ?? '').trim().toUpperCase();
  if (!alvo) return null;
  return pessoas.find((p) => (p.matricula ?? '').toUpperCase() === alvo) ?? null;
}

export function numeroBr(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}
