import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { FechamentoFiltro, FechamentoResumo } from '../../../core/models/fechamento-obra.models';
import { FechamentoObraService } from '../../../core/services/fechamento-obra.service';
import {
  GeoReportNavigatorConfig,
  GeoReportNavigatorCriteria,
  GeoReportNavigatorDataSource,
  GeoReportNavigatorItem,
  GeoReportNavigatorPage
} from '../../../design-system/patterns/report-navigator/report-navigator.models';
import { ATALHOS, SITUACOES, atalhoFechamento, iconeTipo, nomePessoa, rotuloObra, tipoFechamento } from './fechamento-ui';

@Injectable({ providedIn: 'root' })
export class FechamentoReportNavigatorDataSource implements GeoReportNavigatorDataSource<FechamentoResumo> {
  private readonly service = inject(FechamentoObraService);

  readonly initialCriteria: Partial<GeoReportNavigatorCriteria> = { sort: 'solicitacao,desc' };

  readonly config: GeoReportNavigatorConfig = {
    title: 'Encerramento de obras',
    icon: 'pi pi-flag',
    eyebrow: 'Navegador',
    searchPlaceholder: 'Buscar por obra ou reserva...',
    searchLabel: 'Buscar solicitações de encerramento',
    listAllLabel: 'Ver todas as solicitações de encerramento',
    statusChips: [
      { label: 'Todas', value: null, icon: 'pi pi-list' },
      ...ATALHOS.map((a) => ({ label: a.atalho, value: a.value, tone: a.tone, icon: a.icon }))
    ],
    sortOptions: [
      { label: 'Mais recentes', value: 'solicitacao,desc' },
      { label: 'Mais antigas', value: 'solicitacao,asc' }
    ],
    showMineToggle: true,
    mineToggleLabel: 'Só as minhas',
    totalLabel: (total) => `${total} ${total === 1 ? 'solicitação' : 'solicitações'}`
  };

  load(criteria: GeoReportNavigatorCriteria): Observable<GeoReportNavigatorPage<FechamentoResumo>> {
    const [ordenacao, direcao] = (criteria.sort || 'solicitacao,desc').split(',');
    const atalho = atalhoFechamento(criteria.status as string | null);
    const filtro: FechamentoFiltro = {
      page: 0,
      size: 50,
      ordenacao: ordenacao as FechamentoFiltro['ordenacao'],
      direcao: direcao as FechamentoFiltro['direcao'],
      busca: criteria.search.trim() || undefined,
      minhas: criteria.mine || undefined,
      situacoes: atalho?.situacoes,
      prazo: atalho?.prazo
    };
    return this.service.listar(filtro).pipe(map((r) => ({ items: r.content ?? [], totalElements: r.page?.totalElements ?? r.content.length })));
  }

  toItem(raw: FechamentoResumo): GeoReportNavigatorItem {
    const situacao = SITUACOES[raw.situacao];
    return {
      id: raw.id,
      number: raw.numeroReserva ? `#${raw.numeroReserva}` : `#${raw.id.substring(0, 8)}`,
      typePill: { label: raw.tipo, icon: iconeTipo(raw.tipo), variant: tipoFechamento(raw.tipo).adicao ? 'info' : 'devolucao' },
      title: rotuloObra(raw.obra),
      status: { label: situacao.label, tone: situacao.tone, icon: situacao.icon },
      metaAuthor: { label: nomePessoa(raw.solicitante), icon: 'pi pi-user', title: `Solicitante: ${nomePessoa(raw.solicitante)}` },
      metaDate: { date: raw.criadaEm, title: 'Data da solicitação' },
      raw
    };
  }

  getRouteForItem(item: GeoReportNavigatorItem | FechamentoResumo): string[] {
    return ['/obras', 'fechamento', String(item.id)];
  }

  getListRoute(): string[] {
    return ['/obras', 'fechamento'];
  }
}
