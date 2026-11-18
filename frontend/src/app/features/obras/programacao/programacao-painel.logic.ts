import { PainelProgramacao } from '../../../core/models/obras-programacao.models';
import { DashboardInsight } from '../../../shared/components/dashboard/dashboard-ui.components';
import { formatarMoeda } from '../obras-ui';
import { formatarNumero, semanaDe } from './programacao.logic';

export type PeriodoPainel = 'mes' | 'mes-anterior' | 'semana' | 'proximos-30' | 'ultimos-90';

/** Onde a leitura leva quando o gestor quer agir sobre ela. */
export type DestinoLeitura = 'atrasadas' | 'a-programar' | 'equipes' | 'motivos' | 'proximos';

export interface LeituraPainel extends DashboardInsight {
  destino: DestinoLeitura;
}

export function periodoRapido(periodo: PeriodoPainel, hoje = new Date()): { inicio: Date; fim: Date } {
  const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  switch (periodo) {
    case 'mes-anterior':
      return { inicio: new Date(dia.getFullYear(), dia.getMonth() - 1, 1), fim: new Date(dia.getFullYear(), dia.getMonth(), 0) };
    case 'semana':
      return semanaDe(dia);
    case 'proximos-30':
      return { inicio: dia, fim: new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 29) };
    case 'ultimos-90':
      return { inicio: new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() - 89), fim: dia };
    default:
      return { inicio: new Date(dia.getFullYear(), dia.getMonth(), 1), fim: new Date(dia.getFullYear(), dia.getMonth() + 1, 0) };
  }
}

function plural(n: number, um: string, varios: string): string {
  return `${formatarNumero(n)} ${n === 1 ? um : varios}`;
}

/**
 * Leituras de gestão a partir do painel: o que pede ação agora, o que acompanhar e o que vai bem. No máximo quatro,
 * das mais graves para as mais leves, para o gestor não ter de garimpar os números.
 */
export function gerarLeituras(d: PainelProgramacao): LeituraPainel[] {
  const t = d.totais;
  const leituras: LeituraPainel[] = [];
  const atrasadas = d.atrasadas.length;

  if (atrasadas) {
    leituras.push({
      tone: 'critical', icon: 'pi-exclamation-triangle', destino: 'atrasadas',
      title: `${plural(atrasadas, 'programação passou', 'programações passaram')} do prazo sem concluir`,
      description: 'O período terminou e a execução não fechou. Sem reprogramar, a obra some da agenda e o atraso fica invisível.',
      action: 'Ver atrasadas e reprogramar'
    });
  }

  if (t.taxaCumprimento != null && t.vencidas >= 3) {
    const baixa = t.taxaCumprimento < 70;
    leituras.push({
      tone: baixa ? 'warning' : 'positive', icon: baixa ? 'pi-chart-line' : 'pi-check-circle', destino: 'equipes',
      title: `${formatarNumero(t.taxaCumprimento)}% de cumprimento no período`,
      description: `Das ${t.vencidas} programações que já deviam ter terminado, ${t.concluidas} foram concluídas.`
        + (baixa ? ' A agenda está prometendo mais do que as equipes entregam.' : ' A agenda está aderente ao que as equipes entregam.'),
      action: baixa ? 'Ver equipes com atraso' : 'Ver equipes'
    });
  }

  const mudancas = t.reprogramacoes + t.cancelamentos;
  if (t.programacoes && mudancas) {
    const taxa = (mudancas / t.programacoes) * 100;
    const motivo = d.motivos[0];
    leituras.push({
      tone: taxa >= 25 ? 'warning' : 'neutral', icon: 'pi-calendar-clock', destino: 'motivos',
      title: `${plural(t.reprogramacoes, 'reprogramação', 'reprogramações')} e ${plural(t.cancelamentos, 'cancelamento', 'cancelamentos')}`,
      description: (motivo ? `Motivo mais frequente: “${motivo.motivo}” (${motivo.quantidade}×). ` : '')
        + `São ${formatarNumero(Math.round(taxa))} mudanças para cada 100 programações do período.`,
      action: 'Ver motivos'
    });
  }

  const ociosas = d.proximosDias.filter((dia) => dia.diaUtil && dia.equipesLivres > 0);
  const livresAmanha = ociosas.find((dia) => !ehHoje(dia.data));
  if (d.obrasAProgramar && livresAmanha) {
    leituras.push({
      tone: 'warning', icon: 'pi-users', destino: 'a-programar',
      title: `${plural(livresAmanha.equipesLivres, 'equipe livre', 'equipes livres')} em ${livresAmanha.data.slice(0, 5)} com ${plural(d.obrasAProgramar, 'obra', 'obras')} a programar`,
      description: `Há ${formatarMoeda(d.valorAProgramar)} em serviço planejado sem programação. Capacidade parada é faturamento que não volta.`,
      action: 'Programar obras pendentes'
    });
  } else if (d.obrasAProgramar) {
    leituras.push({
      tone: 'neutral', icon: 'pi-building', destino: 'a-programar',
      title: `${plural(d.obrasAProgramar, 'obra planejada', 'obras planejadas')} sem programação`,
      description: `${formatarMoeda(d.valorAProgramar)} em serviço pendente. As de prazo mais curto aparecem primeiro.`,
      action: 'Ver obras a programar'
    });
  }

  const sobrepostas = d.equipes.filter((e) => e.sobreposicoes > 0);
  if (sobrepostas.length) {
    leituras.push({
      tone: 'warning', icon: 'pi-clone', destino: 'equipes',
      title: `${plural(sobrepostas.length, 'equipe com', 'equipes com')} programação sobreposta`,
      description: `${sobrepostas.slice(0, 3).map((e) => e.codigo).join(', ')}${sobrepostas.length > 3 ? ' e outras' : ''} têm duas programações no mesmo turno em algum dia.`,
      action: 'Ver ocupação das equipes'
    });
  }

  if (!leituras.length) {
    leituras.push({
      tone: 'positive', icon: 'pi-check-circle', destino: 'proximos',
      title: 'Agenda em dia',
      description: 'Nenhuma programação atrasada, sobreposta ou obra planejada esperando programação neste recorte.',
      action: 'Ver próximos dias'
    });
  }
  const peso = { critical: 0, warning: 1, neutral: 2, positive: 3 } as const;
  return leituras.sort((a, b) => peso[a.tone] - peso[b.tone]).slice(0, 4);
}

function ehHoje(data: string): boolean {
  const hoje = new Date();
  const dd = String(hoje.getDate()).padStart(2, '0');
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  return data === `${dd}/${mm}/${hoje.getFullYear()}`;
}
