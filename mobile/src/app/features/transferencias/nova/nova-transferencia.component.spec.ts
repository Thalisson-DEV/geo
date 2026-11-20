import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { NovaTransferenciaComponent } from './nova-transferencia.component';
import { DbService } from '../../../core/db/db.service';
import { TokenService } from '../../../core/auth/token.service';
import { ToastService } from '../../../core/ui/toast.service';
import { TurnoService } from '../../../core/turno/turno.service';
import { OutboxService } from '../../../core/sync/outbox.service';
import { SyncService } from '../../../core/sync/sync.service';
import { ConnectivityService } from '../../../core/sync/connectivity.service';

describe('NovaTransferenciaComponent - Assinaturas Digitais', () => {
    let component: NovaTransferenciaComponent;
    let fixture: ComponentFixture<NovaTransferenciaComponent>;

    let dbServiceSpy: any;
    let tokenServiceSpy: any;
    let toastServiceSpy: any;
    let turnoServiceSpy: any;
    let routerSpy: any;
    let outboxServiceSpy: any;
    let syncServiceSpy: any;
    let connectivityServiceSpy: any;

    beforeEach(async () => {
        dbServiceSpy = {
            getEstoques: vi.fn().mockName("DbService.getEstoques"),
            getSaldosComMateriais: vi.fn().mockName("DbService.getSaldosComMateriais"),
            registrarTransferenciaOffline: vi.fn().mockName("DbService.registrarTransferenciaOffline")
        };
        dbServiceSpy.getEstoques.mockResolvedValue([
            { id: 'est-dest-1', nomeIdentificador: 'Base Sul', tipoEstoque: 'BASE' } as any,
        ]);
        dbServiceSpy.getSaldosComMateriais.mockResolvedValue([]);
        dbServiceSpy.registrarTransferenciaOffline.mockResolvedValue(undefined);

        tokenServiceSpy = {
            estoqueId: vi.fn().mockName("TokenService.estoqueId"),
            nomeUsuario: vi.fn().mockName("TokenService.nomeUsuario"),
            ownerId: vi.fn().mockName("TokenService.ownerId")
        };
        tokenServiceSpy.ownerId.mockReturnValue('u-1');
        tokenServiceSpy.estoqueId.mockReturnValue('est-origem-1');
        tokenServiceSpy.nomeUsuario.mockReturnValue('Equipe Teste');

        toastServiceSpy = {
            success: vi.fn().mockName("ToastService.success"),
            warning: vi.fn().mockName("ToastService.warning"),
            error: vi.fn().mockName("ToastService.error")
        };
        turnoServiceSpy = {
            loadTurnoAtivo: vi.fn().mockName("TurnoService.loadTurnoAtivo"),
            turnoAtivo: signal({ id: 'turno-1' })
        };
        turnoServiceSpy.loadTurnoAtivo.mockResolvedValue(undefined);

        routerSpy = {
            navigate: vi.fn().mockName("Router.navigate")
        };
        outboxServiceSpy = {
            updateStatus: vi.fn().mockName("OutboxService.updateStatus"),
            discard: vi.fn().mockName("OutboxService.discard")
        };
        syncServiceSpy = {
            syncOutbox: vi.fn().mockName("SyncService.syncOutbox")
        };
        connectivityServiceSpy = {
            isOnline: vi.fn().mockName("ConnectivityService.isOnline"),
            statusConexao: vi.fn().mockName("ConnectivityService.statusConexao")
        };
        connectivityServiceSpy.statusConexao.mockReturnValue('online');
        connectivityServiceSpy.isOnline.mockReturnValue(true);

        await TestBed.configureTestingModule({
            imports: [NovaTransferenciaComponent],
            providers: [
                { provide: DbService, useValue: dbServiceSpy },
                { provide: TokenService, useValue: tokenServiceSpy },
                { provide: ToastService, useValue: toastServiceSpy },
                { provide: TurnoService, useValue: turnoServiceSpy },
                { provide: Router, useValue: routerSpy },
                { provide: OutboxService, useValue: outboxServiceSpy },
                { provide: SyncService, useValue: syncServiceSpy },
                { provide: ConnectivityService, useValue: connectivityServiceSpy },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(NovaTransferenciaComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('deve ter 4 etapas no wizard e iniciar na etapa 1', () => {
        expect(component.currentStep()).toBe(1);
        expect(component.stepTitle()).toBe('Estoque de destino');
    });

    it('deve avançar para a etapa 4 de assinatura digital e validar obrigatoriedade das assinaturas', () => {
        component.idEstoqueDestino.set('est-dest-1');
        component.selectedItens.set([
            {
                idMaterial: 'mat-1',
                codigo: '1001',
                descricao: 'Cabo',
                unidadeMedida: 'M',
                quantidade: 10,
                condicao: 'NOVO',
                detalhaSerie: false,
                saldoDisponivel: 50,
            },
        ]);

        component.currentStep.set(3);
        expect(component.stepTitle()).toBe('Revisão dos itens');
        expect(component.canAdvance()).toBe(true);

        // Avança para a Etapa 4
        component.nextStep();
        expect(component.currentStep()).toBe(4);
        expect(component.stepTitle()).toBe('Assinatura digital');

        // Na etapa 4, não pode avançar sem ambas as assinaturas
        expect(component.canAdvance()).toBe(false);

        component.assinaturaEntregador.set('data:image/png;base64,assinatura1');
        expect(component.canAdvance()).toBe(false);

        component.assinaturaRecebedor.set('data:image/png;base64,assinatura2');
        expect(component.canAdvance()).toBe(true);
    });

    it('deve abrir e fechar o modal de assinatura para entregador e recebedor', () => {
        component.openSignaturePad('entregador');
        expect(component.activeSignatureModal()).toBe('entregador');

        component.closeSignaturePad();
        expect(component.activeSignatureModal()).toBeNull();

        component.openSignaturePad('recebedor');
        expect(component.activeSignatureModal()).toBe('recebedor');
    });

    it('deve submeter a transferência enviando ambas as assinaturas digitais', async () => {
        component.idEstoqueDestino.set('est-dest-1');
        component.selectedItens.set([
            {
                idMaterial: 'mat-1',
                codigo: '1001',
                descricao: 'Cabo',
                unidadeMedida: 'M',
                quantidade: 5,
                condicao: 'NOVO',
                detalhaSerie: false,
                saldoDisponivel: 20,
            },
        ]);
        component.assinaturaEntregador.set('data:image/png;base64,entregador-ok');
        component.assinaturaRecebedor.set('data:image/png;base64,recebedor-ok');
        component.currentStep.set(4);

        await component.confirm();

        expect(dbServiceSpy.registrarTransferenciaOffline).toHaveBeenCalledWith('est-origem-1', 'est-dest-1', [
            {
                idMaterial: 'mat-1',
                quantidade: 5,
                condicao: 'NOVO',
                numSerie: null,
            },
        ], 'data:image/png;base64,entregador-ok', 'data:image/png;base64,recebedor-ok');
        expect(syncServiceSpy.syncOutbox).toHaveBeenCalled();
        expect(toastServiceSpy.success).toHaveBeenCalled();
        expect(routerSpy.navigate).toHaveBeenCalledWith(['/transferencias']);
    });
});
