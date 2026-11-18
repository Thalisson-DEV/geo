import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  GeoReportNavigatorConfig,
  GeoReportNavigatorCriteria,
  GeoReportNavigatorDataSource,
  GeoReportNavigatorItem,
  GeoReportNavigatorPage
} from '../../design-system/patterns/report-navigator/report-navigator.models';
import { ObraResumoResponse } from '../../core/models/obras.models';
import { ObrasService } from '../../core/services/obras.service';

@Injectable({ providedIn: 'root' })
export class ObraReportNavigatorDataSource
  implements GeoReportNavigatorDataSource<ObraResumoResponse>
{
  private readonly service = inject(ObrasService);

  readonly initialCriteria: Partial<GeoReportNavigatorCriteria> = {
    scope: 'TODAS',
    sort: 'dataInicio,desc'
  };

  readonly config: GeoReportNavigatorConfig = {
    title: 'Obras e Projetos',
    icon: 'pi pi-building',
    eyebrow: 'Navegador',
    searchPlaceholder: 'Buscar por número ou título...',
    searchLabel: 'Buscar obras',
    listAllLabel: 'Ver todas as obras',
    scopeOptions: [
      { label: 'Todas', value: 'TODAS' },
      { label: 'Em andamento', value: 'EM_ANDAMENTO' },
      { label: 'Concluídas', value: 'CONCLUIDAS' }
    ],
    sortOptions: [
      { label: 'Mais recentes', value: 'dataInicio,desc' },
      { label: 'Mais antigas', value: 'dataInicio,asc' },
      { label: 'Número', value: 'numero,asc' }
    ],
    totalLabel: (total) => `${total} ${total === 1 ? 'obra' : 'obras'}`
  };

  load(
    criteria: GeoReportNavigatorCriteria
  ): Observable<GeoReportNavigatorPage<ObraResumoResponse>> {
    const page = 0;
    const size = 50;

    const filtros: any = {
      page,
      size,
      sort: criteria.sort || 'dataInicio,desc',
      buscaGlobal: criteria.search.trim() || undefined
    };

    if (criteria.scope === 'CONCLUIDAS') {
      filtros.statusConcluida = true;
    } else if (criteria.scope === 'EM_ANDAMENTO') {
      filtros.statusConcluida = false;
    }

    return this.service.listarObras(filtros).pipe(
      map((res) => ({
        items: res.content || [],
        totalElements: res.page?.totalElements ?? res.content.length
      }))
    );
  }

  toItem(raw: ObraResumoResponse): GeoReportNavigatorItem {
    return {
      id: raw.id,
      number: raw.numero || `#${raw.id.substring(0, 8)}`,
      typePill: {
        label: raw.tipoObra || 'Obra',
        icon: 'pi pi-building',
        variant: 'neutral'
      },
      title: raw.titulo || raw.notaObra || 'Obra',
      value: raw.valorProjeto != null ? raw.valorProjeto : null,
      status: {
        label: raw.statusNome || (raw.statusConcluida ? 'Concluída' : 'Em andamento'),
        tone: raw.statusConcluida ? 'success' : 'brand',
        icon: raw.statusConcluida ? 'pi-check-circle' : 'pi-play-circle'
      },
      metaAuthor: {
        label: raw.municipioNome || raw.agenteResponsavelNome || 'Local não informado',
        icon: 'pi pi-map-marker',
        title: `Local: ${raw.municipioNome || raw.agenteResponsavelNome || '-'}`
      },
      metaDate: {
        date: raw.dataInicio,
        title: 'Data de início'
      },
      raw
    };
  }

  getRouteForItem(item: GeoReportNavigatorItem | ObraResumoResponse): any[] {
    const id = (item as any).id;
    return ['/obras', id];
  }

  getListRoute(): any[] {
    return ['/obras'];
  }
}
