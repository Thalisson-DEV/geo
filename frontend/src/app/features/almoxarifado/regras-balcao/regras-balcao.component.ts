import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  GeoAsyncStateComponent,
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoFormSectionComponent,
  GeoPageHeaderComponent,
  NotificationService,
} from '@geo/ui';
import { RegrasBalcao } from '../../../core/models/balcao.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { BalcaoService } from '../../../core/services/balcao.service';

/** Regras do almoxarifado: o que o balcão exige e o que ele permite. Cada empresa ajusta ao seu processo. */
@Component({
  selector: 'app-regras-balcao',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoAsyncStateComponent, GeoBooleanControlComponent, GeoButtonComponent, GeoFormSectionComponent, GeoPageHeaderComponent],
  template: `
    <div class="geo-page">
      <geo-page-header title="Regras do balcão" icon="pi pi-sliders-h"
        [breadcrumb]="[{ label: 'Almoxarifado' }, { label: 'Cadastros' }, { label: 'Regras do balcão' }]"
        description="O que o balcão exige de quem retira ou devolve e o que o almoxarife pode fazer.">
      </geo-page-header>

      @if (erro() && !regras()) {
        <geo-async-state state="error" title="Não foi possível carregar as regras" [description]="erro() ?? undefined" actionLabel="Tentar de novo" (action)="carregar()"></geo-async-state>
      } @else if (!regras()) {
        <geo-async-state state="loading" title="Carregando as regras"></geo-async-state>
      } @else {
        <div class="rb">
          <geo-form-section title="Quem retira ou devolve" icon="pi pi-id-card">
            <geo-boolean-control kind="toggle" label="Exigir matrícula no cadastro de quem retira" [value]="valor('exigeMatricula')" (valueChange)="definir('exigeMatricula', $event)"
              description="O almoxarife só escolhe a pessoa; a matrícula vem do cadastro do colaborador e sai no termo junto com o nome. Quem não tem matrícula cadastrada não retira."></geo-boolean-control>
            <geo-boolean-control kind="toggle" label="Exigir assinatura" [value]="valor('exigeAssinatura')" (valueChange)="definir('exigeAssinatura', $event)"
              description="Digital na tela ou termo em papel."></geo-boolean-control>
            <geo-boolean-control kind="toggle" label="Exigir foto" [value]="valor('exigeFoto')" (valueChange)="definir('exigeFoto', $event)"
              description="Foto do rosto de quem retira, só para consulta se a retirada for contestada."></geo-boolean-control>
          </geo-form-section>
          <geo-form-section title="Retirada" icon="pi pi-arrow-up-right">
            <geo-boolean-control kind="toggle" label="Separação obrigatória" [value]="valor('separacaoObrigatoria')" (valueChange)="definir('separacaoObrigatoria', $event)"
              description="Desligado, o balcão entrega direto e a separação fica registrada como feita na hora."></geo-boolean-control>
            <geo-boolean-control kind="toggle" label="Entregar acima do pedido" [value]="valor('entregaAcimaPedido')" (valueChange)="definir('entregaAcimaPedido', $event)"
              description="O almoxarife pode entregar mais que o solicitado; o excedente fica no termo com o motivo e aparece na obra."></geo-boolean-control>
          </geo-form-section>
          <geo-form-section title="Devolução" icon="pi pi-arrow-down-left">
            <geo-boolean-control kind="toggle" label="Aceitar material novo além do que está no caminhão" [value]="valor('devolucaoAcimaCaminhao')" (valueChange)="definir('devolucaoAcimaCaminhao', $event)"
              description="Desligado, a devolução de material novo para no saldo do caminhão. Sucata sempre entra."></geo-boolean-control>
          </geo-form-section>
          <div class="geo-actions-row rb-acoes">
            <geo-button variant="ghost" label="Desfazer" [disabled]="!alterado()" (pressed)="desfazer()"></geo-button>
            <geo-button icon="pi pi-check" label="Salvar regras" [disabled]="!alterado()" [loading]="salvando()" (pressed)="salvar()"></geo-button>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .rb { display: grid; gap: var(--geo-space-4); max-width: 48rem; }
    .rb-acoes { justify-content: flex-end; }
  `,
})
export class RegrasBalcaoComponent {
  private readonly balcao = inject(BalcaoService);
  private readonly notificacao = inject(NotificationService);
  private original: RegrasBalcao | null = null;

  protected readonly regras = signal<RegrasBalcao | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly alterado = computed(() => !!this.original && JSON.stringify(this.regras()) !== JSON.stringify(this.original));

  constructor() {
    this.carregar();
  }

  protected carregar(): void {
    this.erro.set(null);
    this.balcao.regras().subscribe({
      next: (r) => {
        this.original = r;
        this.regras.set({ ...r });
      },
      error: (e) => this.erro.set(getErrorMessage(e)),
    });
  }

  protected valor(chave: keyof RegrasBalcao): boolean {
    return this.regras()?.[chave] ?? false;
  }

  protected definir(chave: keyof RegrasBalcao, valor: boolean): void {
    this.regras.update((r) => (r ? { ...r, [chave]: valor } : r));
  }

  protected desfazer(): void {
    if (this.original) this.regras.set({ ...this.original });
  }

  protected salvar(): void {
    const r = this.regras();
    if (!r) return;
    this.salvando.set(true);
    this.balcao.salvarRegras(r).subscribe({
      next: (salvo) => {
        this.original = salvo;
        this.regras.set({ ...salvo });
        this.salvando.set(false);
        this.notificacao.success('Regras do balcão salvas.');
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacao.error(getErrorMessage(e));
      },
    });
  }
}
