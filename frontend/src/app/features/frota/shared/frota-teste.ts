import { Provider, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';

import { LookupStore } from '../../../core/lookup';
import { AuthService } from '../../../core/services/auth.service';
import { FrotaChecklistService } from '../../../core/services/frota-checklist.service';
import { FrotaService } from '../../../core/services/frota.service';
import { OrdemServico } from '../../../core/models/frota.models';

/** Página de resposta vazia/simples dos endpoints da frota, para os testes. */
export function paginaDe<T>(content: T[], totalElements = content.length) {
  return of({ content, page: { size: 25, number: 0, totalElements, totalPages: 1 } });
}

export const OPCOES_VAZIAS = {
  situacoes: [],
  regimes: [],
  combustiveis: [],
  provedoresTelemetria: [],
  categoriasCnh: [],
  tiposDocumento: [],
  origensOdometro: [],
  situacoesOrdemServico: [],
  criticidades: [],
  tiposManutencao: [],
  origensOrdemServico: [],
  tiposOficina: [],
  motivosServico: [],
  naturezasServico: [],
  situacoesAprovacao: [],
  causasManutencao: [],
  origensPeca: [],
  tiposSinistro: [],
  situacoesSinistro: []
};

/** OS em andamento, atrasada, com veículo parado e compra aguardando aprovação. */
export const OS_BASE: OrdemServico = {
  id: 'os1',
  numero: 42,
  idVeiculo: 'v1',
  placa: 'ABC1234',
  veicular: true,
  descricaoEquipamento: null,
  idBaseOperacional: 'b1',
  base: 'BASE SALVADOR',
  tipoManutencao: 'CORRETIVA',
  origem: 'VERBAL',
  criticidade: 'URGENTE',
  motivo: null,
  situacao: 'EM_ANDAMENTO',
  descricao: 'Freio rangendo na descida',
  itens: ['PASTILHA DE FREIO DIANTEIRA'],
  idCondutor: 'c1',
  condutor: 'MARIA SOUZA',
  abertaEm: '2026-10-10T08:00:00-03:00',
  usuarioAbertura: 'gestor',
  kmAbertura: 12000,
  unidadeMedicao: 'KM',
  causa: null,
  tipoOficina: 'EXTERNA',
  idFornecedor: null,
  oficinaNome: 'OFICINA DO ZÉ',
  oficina: 'OFICINA DO ZÉ',
  agendadaPara: null,
  localAgendamento: null,
  inicioReal: '2026-10-10T09:00:00-03:00',
  previsaoTermino: '2026-10-11T18:00:00-03:00',
  fimReal: null,
  atrasada: true,
  veiculoParado: true,
  paradoDesde: '2026-10-10T08:00:00-03:00',
  liberadoEm: null,
  paradaEmCurso: true,
  descricaoServico: null,
  itensSubstituidos: null,
  valorTotal: null,
  kmEncerramento: null,
  canceladaEm: null,
  motivoCancelamento: null,
  situacaoAprovacao: 'AGUARDANDO_APROVACAO',
  quantidadeOrcamentos: 1,
  temRepeticao: false
};

/** Abre uma tela da frota roteada em `caminho`, com serviço, lookups e permissões simulados. */
export async function abrirTelaFrota<T>(
  componente: Type<T>,
  caminho: string,
  url: string,
  frota: object,
  permissoes: string[],
  extras: Provider[] = []
): Promise<{ harness: RouterTestingHarness; componente: T; el: HTMLElement }> {
  TestBed.configureTestingModule({
    providers: [
      provideNoopAnimations(),
      provideRouter([{ path: caminho, component: componente }]),
      MessageService,
      ConfirmationService,
      { provide: FrotaService, useValue: frota },
      {
        provide: LookupStore,
        useValue: {
          operationalBases: signal([{ value: 'b1', label: 'BASE SALVADOR' }]),
          loadBootstrap: () => of({}),
          searchCollaborators: () => of({ items: [] })
        }
      },
      { provide: AuthService, useValue: { currentUser: () => ({ permissoes }) } },
      { provide: FrotaChecklistService, useValue: { semChecklistHoje: () => of([]) } },
      ...extras
    ]
  });
  const harness = await RouterTestingHarness.create();
  const instancia = await harness.navigateByUrl(url, componente);
  harness.detectChanges();
  await harness.fixture.whenStable();
  harness.detectChanges();
  return { harness, componente: instancia, el: harness.routeNativeElement as HTMLElement };
}

export function chipsDoResumo(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('.ces-filter-panel__chip')).map((c) => c.textContent!.trim());
}
