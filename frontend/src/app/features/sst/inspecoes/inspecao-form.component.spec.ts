import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../core/services/auth.service';
import { LookupStore } from '../../../core/lookup/store/lookup.store';
import { RhService } from '../../../core/services/rh.service';
import { SstService } from '../../../core/services/sst.service';
import { InspecaoFormComponent } from './inspecao-form.component';

describe('InspecaoFormComponent', () => {
  const colaboradoresMock = {
    items: [
      { value: 'colab-1', label: 'Joao da Silva' },
      { value: 'colab-2', label: 'Maria Souza' },
    ],
    nextCursor: null,
    hasMore: false,
  };

  const equipesMock = {
    content: [
      {
        id: 'equipe-1',
        codigo: 'EQ-01',
        ativo: true,
        membros: [
          {
            id: 'membro-1',
            idColaborador: 'colab-1',
            nomeColaborador: 'Joao da Silva',
            vinculoAtivo: true,
          },
          {
            id: 'membro-2',
            idColaborador: 'colab-2',
            nomeColaborador: 'Maria Souza',
            vinculoAtivo: true,
          },
        ],
      },
    ],
    page: { size: 30, number: 0, totalElements: 1, totalPages: 1 },
  };
  const veiculosMock = {
    content: [{ id: 'veiculo-1', placa: 'ABC-1234', modelo: 'Strada', ativo: true }],
    page: { size: 30, number: 0, totalElements: 1, totalPages: 1 },
  };

  let rhServiceMock: any;
  let sstServiceMock: any;
  let searchCollaborators: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    searchCollaborators = vi.fn(() => of(colaboradoresMock));
    rhServiceMock = {
      listarEquipes: vi.fn(() => of(equipesMock)),
      listarVeiculos: vi.fn(() => of(veiculosMock)),
      listarProcessosAtivos: vi.fn(() =>
        of({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } }),
      ),
      listarBasesOperacionais: vi.fn(() =>
        of({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } }),
      ),
    };
    sstServiceMock = {
      listarFormulariosAtivos: vi.fn(() =>
        of({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } }),
      ),
      listarOpcoesTiposInspecao: vi.fn(() =>
        of([{ id: 'tipo-campo', nome: 'Campo', ativo: true }]),
      ),
      buscarFormularioPorId: vi.fn(() => of({ grupos: [] })),
      registrarInspecao: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [InspecaoFormComponent],
      providers: [
        provideRouter([]),
        MessageService,
        { provide: RhService, useValue: rhServiceMock },
        { provide: LookupStore, useValue: { searchCollaborators } },
        { provide: SstService, useValue: sstServiceMock },
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({ permissoes: ['rh:base-operacional:read', 'sst:inspecao:write'] }),
          },
        },
      ],
    }).compileComponents();
  });

  it('nao carrega colaboradores automaticamente na inicializacao', async () => {
    const fixture = TestBed.createComponent(InspecaoFormComponent);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(searchCollaborators).not.toHaveBeenCalled();
  });

  it('adiciona colaboradores pesquisados sem duplicar e limpa o campo', async () => {
    const fixture = TestBed.createComponent(InspecaoFormComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as any;
    component.searchColaboradores('Maria');
    await new Promise((resolve) => setTimeout(resolve, 350));
    component.onAdicionarColaborador('colab-1');
    component.onAdicionarColaborador('colab-2');
    component.onAdicionarColaborador('colab-2');

    expect(component.inspecionados()).toEqual([
      { id: 'colab-1', nome: 'Joao da Silva' },
      { id: 'colab-2', nome: 'Maria Souza' },
    ]);
    expect(component.colaboradorParaAdicionarId).toBeNull();
  });

  it('sem evidencia, registrar avisa o motivo e leva ate as fotos em vez de nao fazer nada', () => {
    const fixture = TestBed.createComponent(InspecaoFormComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as any;
    const add = vi.spyOn(fixture.debugElement.injector.get(MessageService), 'add');
    const scrollIntoView = vi.fn();
    component.evidenciasUpload = { temEvidencia: () => false, enviando: () => false };
    component.evidenciasEl = { nativeElement: { scrollIntoView } };
    component.validar = () => component.motivoBloqueioLancamento();

    component.lancar();

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warn',
        summary: 'Inspeção ainda não registrada',
        detail: expect.stringContaining('evidência fotográfica'),
      }),
    );
    expect(scrollIntoView).toHaveBeenCalled();
    expect(sstServiceMock.registrarInspecao).not.toHaveBeenCalled();
  });

  it('hidrata as opcoes ao adicionar os membros de uma equipe', () => {
    const fixture = TestBed.createComponent(InspecaoFormComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as any;
    component.equipeLookup.setSeed(equipesMock.content);
    component.idEquipe = 'equipe-1';

    component.onSelecionarEquipe();

    expect(component.inspecionados()).toEqual([
      { id: 'colab-1', nome: 'Joao da Silva' },
      { id: 'colab-2', nome: 'Maria Souza' },
    ]);
    expect(component.colaboradores()).toEqual([
      { value: 'colab-1', label: 'Joao da Silva' },
      { value: 'colab-2', label: 'Maria Souza' },
    ]);
    expect(JSON.stringify(component.colaboradores())).not.toContain('null');
  });

  it('normaliza a busca remota de colaboradores', async () => {
    const fixture = TestBed.createComponent(InspecaoFormComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as any;
    component.searchColaboradores('  Maria ');
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(searchCollaborators).toHaveBeenCalledWith({ query: 'maria', cursor: null });
  });

  it('mapeia a gravidade para os tons do design system (sem cor literal)', () => {
    const fixture = TestBed.createComponent(InspecaoFormComponent);
    const component = fixture.componentInstance as any;
    expect(component.tomGravidade('BAIXA')).toBe('neutral');
    expect(component.tomGravidade('MEDIA')).toBe('warning');
    expect(component.tomGravidade('ALTA')).toBe('danger');
    expect(component.tomGravidade('CRITICA')).toBe('danger');
  });

  it('marca a opção escolhida com tokens que acompanham o tema (boxClass)', () => {
    const fixture = TestBed.createComponent(InspecaoFormComponent);
    const component = fixture.componentInstance as any;

    expect(component.boxClass('p1', 'o1', false)).toContain('bg-[var(--geo-surface)]');

    component.respostas['p1'] = { opcoesSelecionadas: ['o1'] };
    expect(component.boxClass('p1', 'o1', false)).toContain('bg-[var(--geo-brand)]');
    expect(component.boxClass('p1', 'o1', true)).toContain('bg-[var(--geo-danger)]');
  });
});
