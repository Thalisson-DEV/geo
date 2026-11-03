import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  CesReportNavigatorConfig,
  CesReportNavigatorCriteria,
  CesReportNavigatorDataSource,
  CesReportNavigatorItem,
  CesReportNavigatorPage
} from '../../../design-system/patterns/report-navigator/report-navigator.models';
import { AbastecimentoResumo, SituacaoAbastecimento } from '../../../core/models/frota-abastecimento.models';
import { ChecklistResumo } from '../../../core/models/frota-checklist.models';
import {
  OrdemServico,
  ROTULO_SITUACAO_OS,
  ROTULO_TIPO_MANUTENCAO,
  SituacaoOrdemServico,
  TOM_SITUACAO_OS,
  formatarPlaca,
  identificacaoOs
} from '../../../core/models/frota.models';
import { FrotaAbastecimentoService } from '../../../core/services/frota-abastecimento.service';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { FrotaService } from '../../../core/services/frota.service';
import { TOM_SITUACAO as TOM_ABASTECIMENTO, moeda } from '../abastecimentos/frota-abastecimento.util';

const ordem = (sort: string | undefined, padrao: string) => [sort || padrao];

/** Navegador lateral do relatório da OS: troca de OS sem voltar à lista. */
@Injectable({ providedIn: 'root' })
export class OrdemServicoReportNavigatorDataSource implements CesReportNavigatorDataSource<OrdemServico> {
  private readonly service = inject(FrotaService);

  readonly initialCriteria: Partial<CesReportNavigatorCriteria> = { sort: 'abertaEm,desc' };

  readonly config: CesReportNavigatorConfig = {
    title: 'Ordens de serviço',
    icon: 'pi pi-wrench',
    eyebrow: 'Navegador',
    searchPlaceholder: 'Buscar por número, placa ou descrição...',
    searchLabel: 'Buscar ordens de serviço',
    listAllLabel: 'Ver todas as OS',
    statusChips: [
      { label: 'Todas', value: null, icon: 'pi pi-list' },
      { label: 'A agendar', value: 'PENDENTE', tone: 'warning', icon: 'pi pi-clock' },
      { label: 'Agendadas', value: 'AGENDADA', tone: 'info', icon: 'pi pi-calendar' },
      { label: 'Em execução', value: 'EM_ANDAMENTO', tone: 'brand', icon: 'pi pi-play' },
      { label: 'Concluídas', value: 'CONCLUIDA', tone: 'success', icon: 'pi pi-check-circle' }
    ],
    sortOptions: [
      { label: 'Mais recentes', value: 'abertaEm,desc' },
      { label: 'Mais antigas', value: 'abertaEm,asc' }
    ],
    totalLabel: (total) => `${total} OS`
  };

  load(criteria: CesReportNavigatorCriteria): Observable<CesReportNavigatorPage<OrdemServico>> {
    return this.service
      .listarOrdensServico(
        {
          busca: criteria.search.trim() || null,
          situacoes: criteria.status ? [criteria.status as SituacaoOrdemServico] : []
        },
        { page: 0, size: 50, sort: ordem(criteria.sort, 'abertaEm,desc') }
      )
      .pipe(map((res) => ({ items: res.content, totalElements: res.page?.totalElements ?? res.content.length })));
  }

  toItem(os: OrdemServico): CesReportNavigatorItem {
    return {
      id: os.id,
      number: `OS ${os.numero}`,
      typePill: { label: ROTULO_TIPO_MANUTENCAO[os.tipoManutencao], icon: 'pi pi-wrench', variant: os.tipoManutencao === 'PREVENTIVA' ? 'info' : 'brand' },
      value: os.valorTotal !== null ? moeda(os.valorTotal) : null,
      title: `${identificacaoOs(os)} · ${os.descricao}`,
      status: { label: ROTULO_SITUACAO_OS[os.situacao], tone: TOM_SITUACAO_OS[os.situacao] },
      metaAuthor: { label: os.base ?? 'Sem base', icon: 'pi pi-map-marker' },
      metaDate: { date: os.abertaEm, title: 'Abertura' },
      raw: os
    };
  }

  getRouteForItem(item: CesReportNavigatorItem | OrdemServico): any[] {
    return ['/frota', 'ordens-servico', String(item.id), 'relatorio'];
  }

  getListRoute(): any[] {
    return ['/frota', 'ordens-servico'];
  }
}

/** Navegador lateral do relatório do checklist. */
@Injectable({ providedIn: 'root' })
export class ChecklistReportNavigatorDataSource implements CesReportNavigatorDataSource<ChecklistResumo> {
  private readonly service = inject(FrotaChecklistService);

  readonly initialCriteria: Partial<CesReportNavigatorCriteria> = { sort: 'preenchidoEm,desc' };

  readonly config: CesReportNavigatorConfig = {
    title: 'Checklists',
    icon: 'pi pi-list-check',
    eyebrow: 'Navegador',
    searchPlaceholder: 'Filtre pelos chips abaixo',
    searchLabel: 'Buscar checklists',
    listAllLabel: 'Ver todos os checklists',
    statusChips: [
      { label: 'Todos', value: null, icon: 'pi pi-list' },
      { label: 'Com problema', value: 'PROBLEMA', tone: 'warning', icon: 'pi pi-exclamation-triangle' },
      { label: 'Tudo OK', value: 'OK', tone: 'success', icon: 'pi pi-check' }
    ],
    sortOptions: [
      { label: 'Mais recentes', value: 'preenchidoEm,desc' },
      { label: 'Mais antigos', value: 'preenchidoEm,asc' }
    ],
    totalLabel: (total) => `${total} ${total === 1 ? 'checklist' : 'checklists'}`
  };

  load(criteria: CesReportNavigatorCriteria): Observable<CesReportNavigatorPage<ChecklistResumo>> {
    const comProblema = criteria.status === 'PROBLEMA' ? true : criteria.status === 'OK' ? false : null;
    return this.service
      .checklists({ comProblema }, { page: 0, size: 50, sort: ordem(criteria.sort, 'preenchidoEm,desc') })
      .pipe(map((res) => ({ items: res.content, totalElements: res.page?.totalElements ?? res.content.length })));
  }

  toItem(c: ChecklistResumo): CesReportNavigatorItem {
    return {
      id: c.id,
      number: formatarPlaca(c.placa),
      typePill: { label: c.passagemVeiculo ? 'Troca de condutor' : 'Primeiro uso', icon: 'pi pi-list-check', variant: 'neutral' },
      title: `${c.modeloNome}${c.condutorNome ? ' · ' + c.condutorNome : ''}`,
      status: c.problemas
        ? { label: `${c.problemas} ${c.problemas === 1 ? 'problema' : 'problemas'}`, tone: 'warning' }
        : { label: 'Tudo OK', tone: 'success' },
      metaAuthor: { label: c.baseNome ?? 'Sem base', icon: 'pi pi-map-marker' },
      metaDate: { date: c.preenchidoEm, title: 'Preenchimento' },
      raw: c
    };
  }

  getRouteForItem(item: CesReportNavigatorItem | ChecklistResumo): any[] {
    return ['/frota', 'checklists', String(item.id), 'relatorio'];
  }

  getListRoute(): any[] {
    return ['/frota', 'checklists'];
  }
}

/** Navegador lateral do relatório do abastecimento. */
@Injectable({ providedIn: 'root' })
export class AbastecimentoReportNavigatorDataSource implements CesReportNavigatorDataSource<AbastecimentoResumo> {
  private readonly service = inject(FrotaAbastecimentoService);

  readonly initialCriteria: Partial<CesReportNavigatorCriteria> = { sort: 'solicitadoEm,desc' };

  readonly config: CesReportNavigatorConfig = {
    title: 'Abastecimentos',
    icon: 'pi pi-car',
    eyebrow: 'Navegador',
    searchPlaceholder: 'Buscar por placa ou posto...',
    searchLabel: 'Buscar abastecimentos',
    listAllLabel: 'Ver todos os abastecimentos',
    statusChips: [
      { label: 'Todos', value: null, icon: 'pi pi-list' },
      { label: 'A aprovar', value: 'AGUARDANDO_APROVACAO', tone: 'warning', icon: 'pi pi-clock' },
      { label: 'Liberados', value: 'LIBERADA', tone: 'brand', icon: 'pi pi-send' },
      { label: 'Realizados', value: 'REALIZADA', tone: 'success', icon: 'pi pi-check-circle' }
    ],
    sortOptions: [
      { label: 'Mais recentes', value: 'solicitadoEm,desc' },
      { label: 'Mais antigos', value: 'solicitadoEm,asc' }
    ],
    totalLabel: (total) => `${total} ${total === 1 ? 'abastecimento' : 'abastecimentos'}`
  };

  load(criteria: CesReportNavigatorCriteria): Observable<CesReportNavigatorPage<AbastecimentoResumo>> {
    return this.service
      .listar(
        { busca: criteria.search.trim() || null, situacoes: criteria.status ? [criteria.status as SituacaoAbastecimento] : [] },
        { page: 0, size: 50, sort: ordem(criteria.sort, 'solicitadoEm,desc') }
      )
      .pipe(map((res) => ({ items: res.content, totalElements: res.page?.totalElements ?? res.content.length })));
  }

  toItem(a: AbastecimentoResumo): CesReportNavigatorItem {
    return {
      id: a.id,
      number: formatarPlaca(a.placa),
      typePill: a.alertas.length ? { label: `${a.alertas.length} alerta${a.alertas.length === 1 ? '' : 's'}`, icon: 'pi pi-exclamation-triangle', variant: 'warning' } : undefined,
      value: a.valorTotal !== null ? moeda(a.valorTotal) : null,
      title: `${a.posto} · ${a.itens}`,
      status: { label: a.situacaoRotulo, tone: TOM_ABASTECIMENTO[a.situacao] },
      metaAuthor: { label: a.solicitante ?? '—', icon: 'pi pi-user' },
      metaDate: { date: a.solicitadoEm, title: 'Pedido' },
      raw: a
    };
  }

  getRouteForItem(item: CesReportNavigatorItem | AbastecimentoResumo): any[] {
    return ['/frota', 'abastecimentos', String(item.id), 'relatorio'];
  }

  getListRoute(): any[] {
    return ['/frota', 'abastecimentos'];
  }
}
