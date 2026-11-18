import { ICONE_STATUS_EVENTO } from '../../../core/models/sst-evento.models';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  CesReportNavigatorConfig,
  CesReportNavigatorCriteria,
  CesReportNavigatorDataSource,
  CesReportNavigatorItem,
  CesReportNavigatorPage
} from '../../../design-system/patterns/report-navigator/report-navigator.models';
import {
  EventoSstFilter,
  EventoSstResumoResponse,
  STATUS_EVENTO_LABELS,
  StatusEventoSst,
  TIPO_EVENTO_LABELS
} from '../../../core/models/sst-evento.models';
import { SstService } from '../../../core/services/sst.service';
import { CesTone } from '../../../design-system/core';

const STATUS_TONES: Record<StatusEventoSst, CesTone> = {
  REGISTRADO: 'warning',
  EM_TRATATIVA: 'info',
  CONCLUIDO: 'success',
  CANCELADO: 'neutral'
};

/** Navegador lateral do relatório de evento de segurança (mesmo modelo do de inspeções). */
@Injectable({ providedIn: 'root' })
export class EventoSstReportNavigatorDataSource
  implements CesReportNavigatorDataSource<EventoSstResumoResponse>
{
  private readonly service = inject(SstService);

  readonly initialCriteria: Partial<CesReportNavigatorCriteria> = {
    scope: 'TODOS',
    sort: 'dataOcorrencia,desc'
  };

  readonly config: CesReportNavigatorConfig = {
    title: 'Eventos de segurança',
    icon: 'pi pi-exclamation-triangle',
    eyebrow: 'Navegador',
    searchPlaceholder: 'Buscar por registro, local ou base...',
    searchLabel: 'Buscar eventos',
    listAllLabel: 'Ver todos os eventos',
    scopeOptions: [
      { label: 'Todos', value: 'TODOS' },
      { label: 'Em aberto', value: 'ABERTOS' },
      { label: 'Concluídos', value: 'CONCLUIDO' }
    ],
    sortOptions: [
      { label: 'Mais recentes', value: 'dataOcorrencia,desc' },
      { label: 'Mais antigos', value: 'dataOcorrencia,asc' }
    ],
    totalLabel: (total) => `${total} ${total === 1 ? 'evento' : 'eventos'}`
  };

  load(criteria: CesReportNavigatorCriteria): Observable<CesReportNavigatorPage<EventoSstResumoResponse>> {
    const filtros: EventoSstFilter = {
      page: 0,
      size: 50,
      sort: criteria.sort || 'dataOcorrencia,desc',
      buscaGlobal: criteria.search.trim() || undefined
    };
    if (criteria.scope === 'ABERTOS') filtros.status = ['REGISTRADO', 'EM_TRATATIVA'];
    if (criteria.scope === 'CONCLUIDO') filtros.status = ['CONCLUIDO'];

    return this.service.listarEventos(filtros).pipe(
      map((res) => ({
        items: res.content || [],
        totalElements: res.page?.totalElements ?? res.content.length
      }))
    );
  }

  toItem(raw: EventoSstResumoResponse): CesReportNavigatorItem {
    return {
      id: raw.id,
      number: raw.numeroRegistro,
      typePill: {
        label: TIPO_EVENTO_LABELS[raw.tipo] || 'Evento',
        icon: 'pi pi-exclamation-triangle',
        variant: raw.comLesao ? 'warning' : 'info'
      },
      title: [raw.equipeCodigo || raw.baseNome, raw.atividadeNome].filter(Boolean).join(' · ') || 'Evento',
      status: {
        label: STATUS_EVENTO_LABELS[raw.status] || raw.status,
        tone: STATUS_TONES[raw.status] || 'neutral',
        icon: ICONE_STATUS_EVENTO[raw.status]
      },
      metaAuthor: {
        label: raw.gestorNome || 'Gestor',
        icon: 'pi pi-user',
        title: `Gestor: ${raw.gestorNome || '-'}`
      },
      metaDate: {
        date: raw.dataOcorrencia,
        title: 'Data da ocorrência'
      },
      raw
    };
  }

  getRouteForItem(item: CesReportNavigatorItem | EventoSstResumoResponse): any[] {
    return ['/sst', 'eventos', (item as { id: string }).id];
  }

  getListRoute(): any[] {
    return ['/sst', 'eventos'];
  }
}
