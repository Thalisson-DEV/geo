import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  GeoReportNavigatorConfig,
  GeoReportNavigatorCriteria,
  GeoReportNavigatorDataSource,
  GeoReportNavigatorItem,
  GeoReportNavigatorPage
} from '../../design-system/patterns/report-navigator/report-navigator.models';
import {
  ExecucaoComercialResponse,
  ExecucaoFilters,
  StatusExecucao
} from '../../core/models/execucao.models';
import { ExecucaoService } from '../../core/services/execucao.service';
import { GeoTone } from '../../design-system/core';

const STATUS_LABELS: Record<StatusExecucao, string> = {
  INICIADO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  EDITADO: 'Editado'
};

const STATUS_ICONES: Record<StatusExecucao, string> = {
  INICIADO: 'pi-clock',
  CONCLUIDO: 'pi-check-circle',
  EDITADO: 'pi-pencil'
};

const STATUS_TONES: Record<StatusExecucao, GeoTone> = {
  INICIADO: 'warning',
  CONCLUIDO: 'success',
  EDITADO: 'info'
};

@Injectable({ providedIn: 'root' })
export class ExecucaoReportNavigatorDataSource
  implements GeoReportNavigatorDataSource<ExecucaoComercialResponse>
{
  private readonly service = inject(ExecucaoService);

  readonly initialCriteria: Partial<GeoReportNavigatorCriteria> = {
    scope: 'TODAS',
    sort: 'dataLancamento,desc'
  };

  readonly config: GeoReportNavigatorConfig = {
    title: 'Execuções Comerciais',
    icon: 'pi pi-bolt',
    eyebrow: 'Navegador',
    searchPlaceholder: 'Buscar por nota ou equipe...',
    searchLabel: 'Buscar execuções',
    listAllLabel: 'Ver todas as execuções',
    scopeOptions: [
      { label: 'Todas', value: 'TODAS' },
      { label: 'Em andamento', value: 'INICIADO' },
      { label: 'Concluídas', value: 'CONCLUIDO' }
    ],
    sortOptions: [
      { label: 'Mais recentes', value: 'dataLancamento,desc' },
      { label: 'Mais antigas', value: 'dataLancamento,asc' },
      { label: 'Nota fiscal', value: 'referenciaNota,asc' }
    ],
    totalLabel: (total) => `${total} ${total === 1 ? 'execução' : 'execuções'}`
  };

  load(
    criteria: GeoReportNavigatorCriteria
  ): Observable<GeoReportNavigatorPage<ExecucaoComercialResponse>> {
    const filtros: ExecucaoFilters = {
      page: 0,
      size: 50,
      sort: criteria.sort || 'dataLancamento,desc',
      status:
        criteria.scope && criteria.scope !== 'TODAS'
          ? (criteria.scope as StatusExecucao)
          : undefined,
      buscaGlobal: criteria.search.trim() || undefined
    };

    return this.service.listarExecucoes(filtros).pipe(
      map((res) => ({
        items: res.content || [],
        totalElements: res.page?.totalElements ?? res.content.length
      }))
    );
  }

  toItem(raw: ExecucaoComercialResponse): GeoReportNavigatorItem {
    const status = raw.statusExecucao;
    const equipeNome = raw.equipe?.codigo || 'Equipe';

    return {
      id: raw.id,
      number: raw.referenciaNota || `#${raw.id.substring(0, 8)}`,
      typePill: {
        label: 'Execução',
        icon: 'pi pi-bolt',
        variant: 'brand'
      },
      title: `Nota: ${raw.referenciaNota || '-'}${raw.municipio?.nome ? ' · ' + raw.municipio.nome : ''}`,
      value: raw.valorTotalFaturado,
      status: {
        label: STATUS_LABELS[status] || status,
        tone: STATUS_TONES[status] || 'neutral',
        icon: STATUS_ICONES[status]
      },
      metaAuthor: {
        label: equipeNome,
        icon: 'pi pi-users',
        title: `Equipe: ${equipeNome}`
      },
      metaDate: {
        date: raw.dataLancamento,
        title: 'Lançamento'
      },
      raw
    };
  }

  getRouteForItem(item: GeoReportNavigatorItem | ExecucaoComercialResponse): any[] {
    const id = (item as any).id;
    return ['/execucao', 'comercial', id];
  }

  getListRoute(): any[] {
    return ['/execucao', 'comercial'];
  }
}
