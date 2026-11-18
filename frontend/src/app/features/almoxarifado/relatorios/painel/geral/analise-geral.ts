import { CesTone } from '@ces/ui';

import {
  EstoqueRelatorioResponse,
  FechamentoRelatorioResponse,
  MovimentacaoRelatorio,
  MovimentacoesRelatorioResponse
} from '../../../../../core/models/almoxarifado-relatorios.models';
import { PainelSolicitacoesResponse } from '../../../../../core/models/painel-solicitacoes.models';
import { LeituraGerencial, VereditoGerencial } from '../../../../../shared/components/dashboard/dashboard-visao-gerencial.component';
import { diaHora, eixoDoPeriodo, inteiro, natureza, pct, plural, priorizar, recortavelMov, recortavelSaldo } from '../almox-analise-comum';
import { ModeloConsumo, modeloConsumo, visaoConsumo } from '../consumo/analise-consumo';
import { ModeloEstoque, modeloEstoque, visaoEstoque } from '../estoque/analise-estoque';
import { ModeloFechamento, modeloFechamento, visaoFechamento } from '../fechamento/analise-fechamento';
import { ModeloMov, modeloMov, visaoMov } from '../movimentacoes/analise-movimentacoes';
import { Recortavel } from '../recorte-almox.service';
import { recortavelSolicitacao, visaoDoProcesso } from '../solicitacoes/analise-solicitacoes';
import { Recorte, atrasada, diasDeAtraso, recortar, rotuloEtapa } from '../solicitacoes/solicitacoes-calculos';

/** Fontes da visão geral; cada uma pode faltar quando o perfil não lê aquela área. */
export interface FontesGeral {
  mov: MovimentacoesRelatorioResponse | null;
  estoque: EstoqueRelatorioResponse | null;
  solicitacoes: PainelSolicitacoesResponse | null;
  fechamento: FechamentoRelatorioResponse | null;
}

export type Area = 'comerciais' | 'tecnicas' | 'fechamento' | 'movimentacoes' | 'estoque' | 'consumo';

export const AREAS: Record<Area, { rotulo: string; curto: string; rota: string; icone: string }> = {
  comerciais: { curto: 'Comercial', rotulo: 'Solicitações comerciais', rota: '/almoxarifado/relatorios/solicitacoes-comerciais', icone: 'pi pi-shopping-cart' },
  tecnicas: { curto: 'Técnico', rotulo: 'Solicitações técnicas', rota: '/almoxarifado/relatorios/solicitacoes-tecnicas', icone: 'pi pi-wrench' },
  fechamento: { curto: 'Encerramento', rotulo: 'Encerramento de obras', rota: '/almoxarifado/relatorios/fechamento', icone: 'pi pi-flag' },
  movimentacoes: { curto: 'Movimentações', rotulo: 'Movimentações', rota: '/almoxarifado/relatorios/movimentacoes', icone: 'pi pi-arrow-right-arrow-left' },
  estoque: { curto: 'Estoque', rotulo: 'Estoque e saldos', rota: '/almoxarifado/relatorios/estoque', icone: 'pi pi-box' },
  consumo: { curto: 'Consumo', rotulo: 'Consumo de materiais', rota: '/almoxarifado/relatorios/consumo', icone: 'pi pi-chart-bar' }
};

/** Item da lista "o que pede ação hoje", de qualquer área. */
export interface Pendencia {
  chave: string;
  area: Area;
  /** Tag curta: atrasado, prazo vencido, em falta, acabando. */
  situacao: string;
  /** Ícone da tag de situação. */
  icone: string;
  tipo: string;
  descricao: string;
  responsavel: string;
  desde: string;
  atraso: number;
  tom: CesTone;
  /** Destino: rota do registro ou do relatório com a análise aberta. */
  rota: unknown[];
  queryParams?: Record<string, string>;
}

export interface ModeloGeral {
  f: FontesGeral;
  comercial: Recorte | null;
  tecnico: Recorte | null;
  fechamento: ModeloFechamento | null;
  mov: ModeloMov | null;
  estoque: ModeloEstoque | null;
  consumo: ModeloConsumo | null;
  leituras: (LeituraGerencial & { area: Area })[];
  pendencias: Pendencia[];
  fluxo: { rotulos: string[]; entradas: number[]; saidas: number[]; chaves: string[] } | null;
}

export function modeloGeral(f: FontesGeral, aceita: (r: Recortavel) => boolean, almox: string[] | undefined): ModeloGeral {
  const aceitaMov = (m: MovimentacaoRelatorio) => aceita(recortavelMov(m));
  const sol = f.solicitacoes ? { ...f.solicitacoes, solicitacoes: f.solicitacoes.solicitacoes.filter((s) => aceita(recortavelSolicitacao(s))) } : null;
  const comercial = sol ? recortar(sol, 'COMERCIAL') : null;
  const tecnico = sol ? recortar(sol, 'TECNICO') : null;
  const set = almox?.length ? new Set(almox) : null;
  const fechamento = f.fechamento ? modeloFechamento(f.fechamento, (s) => !set || (!!s.idAlmoxarifado && set.has(s.idAlmoxarifado))) : null;
  const mov = f.mov ? modeloMov(f.mov, aceitaMov) : null;
  const estoque = f.estoque && f.mov ? modeloEstoque(f.estoque, f.mov, (s) => aceita(recortavelSaldo(s)), aceitaMov, []) : null;
  const consumo = f.mov ? modeloConsumo(f.mov, aceitaMov) : null;

  const leituras: (LeituraGerencial & { area: Area })[] = [];
  const juntar = (area: Area, l: LeituraGerencial[]) =>
    l.filter((x) => x.tom === 'danger' || x.tom === 'warning').slice(0, 2).forEach((x) => leituras.push({
      ...x, area, id: `${area}.${x.id}`, titulo: `${AREAS[area].curto} · ${x.titulo}`,
      // Na visão geral, a ação leva ao relatório da área com a mesma análise aberta.
      acao: x.acao ? { rotulo: x.acao.rotulo, alvo: { dimension: 'ir', value: `${area}|${x.acao.alvo.dimension}:${x.acao.alvo.value}` } } : undefined
    }));
  if (comercial && (comercial.periodo.length || comercial.abertas.length)) juntar('comerciais', visaoDoProcesso(comercial, 'COMERCIAL').leituras);
  if (tecnico && (tecnico.periodo.length || tecnico.abertas.length)) juntar('tecnicas', visaoDoProcesso(tecnico, 'TECNICO').leituras);
  if (fechamento && fechamento.todas.length) juntar('fechamento', visaoFechamento(fechamento).leituras);
  if (estoque) juntar('estoque', visaoEstoque(estoque).leituras);
  if (mov && mov.linhas.length) juntar('movimentacoes', visaoMov(mov).leituras);
  if (consumo && consumo.saidas.length) juntar('consumo', visaoConsumo(consumo).leituras);

  const pendencias: Pendencia[] = [];
  for (const [r, area] of [[comercial, 'comerciais'], [tecnico, 'tecnicas']] as const) {
    if (!r) continue;
    for (const s of r.abertas.filter((x) => atrasada(x, r.hoje))) {
      pendencias.push({
        chave: `s-${s.id}`, area, situacao: 'Atrasada', icone: 'pi pi-clock', tipo: area === 'comerciais' ? 'Pedido comercial' : `Solicitação técnica ${s.tipoTecnico ?? ''}`.trim(),
        descricao: `${rotuloEtapa(s.etapa)}${s.numeroObra ? ` · obra ${s.numeroObra}` : ''}`, responsavel: s.equipe ?? s.almoxarifado ?? '—',
        desde: s.dataSolicitacao, atraso: diasDeAtraso(s, r.hoje), tom: 'danger',
        rota: s.contexto === 'TECNICO' ? ['/almoxarifado/solicitacoes-tecnicas', s.id] : ['/almoxarifado/solicitacoes', s.id]
      });
    }
  }
  if (fechamento) {
    const agora = Date.parse(f.fechamento!.geradoEm);
    for (const s of fechamento.atrasadas) {
      pendencias.push({
        chave: `f-${s.id}`, area: 'fechamento', situacao: 'Prazo vencido', icone: 'pi pi-calendar-times', tipo: `Encerramento ${s.tipo}`,
        descricao: `${s.situacao === 'AGUARDANDO_RESERVA' ? 'Aguardando reserva' : 'Aguardando movimentação'} · obra ${s.numeroObra ?? ''}`,
        responsavel: s.supervisor ?? s.solicitante ?? '—', desde: s.criadaEm,
        atraso: s.prazoVigenteAte ? Math.max(0, Math.round((agora - Date.parse(s.prazoVigenteAte)) / 86_400_000)) : 0, tom: 'danger',
        rota: ['/obras/encerramento', s.id]
      });
    }
  }
  if (estoque) {
    for (const p of [...estoque.porFaixa.ruptura, ...estoque.porFaixa.critica]) {
      pendencias.push({
        chave: `e-${p.chave}`, area: 'estoque', situacao: p.faixa === 'ruptura' ? 'Em falta' : 'Acaba em 7 dias', icone: p.faixa === 'ruptura' ? 'pi pi-ban' : 'pi pi-hourglass', tipo: 'Material',
        descricao: `${p.codigo} · ${p.descricao}`, responsavel: p.estoque, desde: p.ultimaSaida ?? '', atraso: 0, tom: p.faixa === 'ruptura' ? 'danger' : 'warning',
        rota: [AREAS.estoque.rota], queryParams: { drill: `posicao:${p.chave}` }
      });
    }
  }
  pendencias.sort((a, b) => (a.tom === b.tom ? 0 : a.tom === 'danger' ? -1 : 1) || b.atraso - a.atraso);

  let fluxo: ModeloGeral['fluxo'] = null;
  if (f.mov && mov) {
    const eixo = eixoDoPeriodo(f.mov.de, f.mov.ate);
    const i = new Map(eixo.chaves.map((c, k) => [c, k]));
    const entradas = eixo.chaves.map(() => 0);
    const saidas = eixo.chaves.map(() => 0);
    for (const m of mov.linhas) {
      const k = i.get(eixo.chaveDe(m.dataHora));
      if (k === undefined) continue;
      const n = natureza(m);
      if (n === 'abastecimento' || n === 'retorno' || n === 'sucata-recebida') entradas[k]++;
      else if (n === 'atendimento' || n === 'baixa') saidas[k]++;
    }
    fluxo = { rotulos: eixo.rotulos, entradas, saidas, chaves: eixo.chaves };
  }
  return { f, comercial, tecnico, fechamento, mov, estoque, consumo, leituras: priorizar(leituras, 6), pendencias, fluxo };
}

export function vereditoGeral(m: ModeloGeral): VereditoGerencial {
  const graves = m.leituras.filter((l) => l.tom === 'danger');
  const areas = [...new Set(graves.map((l) => AREAS[l.area].rotulo.toLowerCase()))];
  const abertas = (m.comercial?.abertas.length ?? 0) + (m.tecnico?.abertas.length ?? 0) + (m.fechamento?.abertas.length ?? 0);
  const atrasos = m.pendencias.filter((p) => p.area !== 'estoque').length;
  const faltas = m.estoque ? m.estoque.porFaixa.ruptura.length : 0;
  return {
    tom: graves.length ? 'danger' : m.leituras.length ? 'warning' : 'success',
    rotulo: graves.length ? 'Agir agora' : m.leituras.length ? 'Acompanhar' : 'Sob controle',
    titulo: graves.length ? `${plural(areas.length, 'área pede', 'áreas pedem')} ação agora` : m.leituras.length ? 'Operação com pontos de atenção' : 'Almoxarifado sob controle',
    texto: `${graves.length ? `${areas.map((a, i) => (i ? a : a[0].toUpperCase() + a.slice(1))).join(', ')}. ` : ''}${plural(abertas, 'solicitação em aberto', 'solicitações em aberto')} (${plural(atrasos, 'atrasada', 'atrasadas')})`
      + `${m.estoque ? `, ${plural(faltas, 'material em falta', 'materiais em falta')}` : ''}`
      + `${m.mov ? ` e ${plural(m.mov.operacoes, 'operação', 'operações')} no balcão no período` : ''}.`
  };
}

export const descricaoPendencia = (p: Pendencia) => (p.desde ? diaHora(p.desde) : '—');
export { inteiro, pct };
