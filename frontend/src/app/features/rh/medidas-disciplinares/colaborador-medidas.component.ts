import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CesButtonComponent, CesCalloutComponent, CesStatusComponent } from '@ces/ui';
import {
  MedidaDisciplinar,
  MotivoMedidaDisciplinar,
  TipoMedidaDisciplinar,
  situacaoMedida
} from '../../../core/models/rh-medida-disciplinar.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { RhMedidaDisciplinarService } from '../../../core/services/rh-medida-disciplinar.service';
import { MedidaDisciplinarDrawerComponent } from './medida-disciplinar-drawer.component';

/**
 * Aba "Medidas disciplinares" do colaborador: o histórico disciplinar dele, do mais recente ao
 * mais antigo, e o atalho para registrar uma nova. Só existe para quem tem
 * `rh:medida-disciplinar:read` — quem só lê o cadastro não vê a aba.
 */
@Component({
  selector: 'app-colaborador-medidas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, CesButtonComponent, CesCalloutComponent, CesStatusComponent, MedidaDisciplinarDrawerComponent],
  styles: `
    .topo { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.75rem; }
    .topo p { margin: 0; color: var(--ces-foreground-muted); font-size: var(--ces-font-caption); }
    .lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
    .medida { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.25rem 0.75rem; width: 100%; padding: 0.625rem 0.75rem;
      border: 1px solid var(--ces-border); border-radius: var(--ces-radius-md); background: var(--ces-surface); color: inherit;
      font: inherit; text-align: start; cursor: pointer; }
    .medida:hover { background: var(--ces-surface-subtle); }
    .medida:focus-visible { outline: 2px solid var(--ces-focus-ring); outline-offset: 1px; }
    .medida strong { font-weight: 600; }
    .medida span { font-size: var(--ces-font-caption); color: var(--ces-foreground-muted); }
  `,
  template: `
    <div class="topo">
      <p>{{ resumo() }}</p>
      <span class="ces-actions-row">
        <ces-button size="sm" variant="ghost" label="Ver na lista" icon="pi pi-external-link" routerLink="/rh/medidas-disciplinares"
          [queryParams]="{ colaborador: idColaborador() }"></ces-button>
        @if (podeEditar()) {
          <ces-button size="sm" icon="pi pi-plus" label="Lançar medida" (pressed)="nova()"></ces-button>
        }
      </span>
    </div>

    @if (erro(); as e) {
      <ces-callout tone="danger" icon="pi pi-exclamation-circle" [dense]="true" title="Não foi possível carregar as medidas">{{ e }}</ces-callout>
    } @else if (carregando()) {
      <p class="ces-cell-muted" role="status">Carregando medidas…</p>
    } @else if (!medidas().length) {
      <ces-callout tone="info" icon="pi pi-check-circle" [dense]="true" title="Nenhuma medida disciplinar">Este colaborador não tem medidas registradas.</ces-callout>
    } @else {
      <ul class="lista">
        @for (m of medidas(); track m.id) {
          @let s = situacao(m);
          <li>
            <button type="button" class="medida" (click)="abrir(m)" [attr.aria-label]="'Abrir ' + m.tipoNome + ' de ' + (m.dataFato | date: 'dd/MM/yyyy')">
              <strong>{{ m.tipoNome }} · {{ m.motivoNome }}</strong>
              <ces-status [tone]="s.tom" [icon]="'pi ' + s.icone">{{ s.rotulo }}</ces-status>
              <span>Fato em {{ m.dataFato | date: 'dd/MM/yyyy' }} · aplicada em {{ m.dataAplicacao | date: 'dd/MM/yyyy' }}</span>
            </button>
          </li>
        }
      </ul>
    }

    <app-medida-disciplinar-drawer [(visivel)]="drawerAberto" [medida]="emEdicao()" [tipos]="tipos()" [motivos]="motivos()"
      [colaborador]="emEdicao() ? null : { id: idColaborador(), nome: nomeColaborador() }"
      [podeEditar]="podeEditar()" [podeCancelar]="podeCancelar()" (salva)="aoSalvar($event)"></app-medida-disciplinar-drawer>
  `
})
export class ColaboradorMedidasComponent {
  private readonly servico = inject(RhMedidaDisciplinarService);
  private readonly auth = inject(AuthService);

  readonly idColaborador = input.required<string>();
  readonly nomeColaborador = input('');

  protected readonly situacao = situacaoMedida;
  private readonly tem = (p: string) => computed(() => this.auth.currentUser()?.permissoes?.includes(p) ?? false);
  protected readonly podeEditar = this.tem('rh:medida-disciplinar:write');
  protected readonly podeCancelar = this.tem('rh:medida-disciplinar:cancelar');

  protected readonly medidas = signal<MedidaDisciplinar[]>([]);
  protected readonly tipos = signal<TipoMedidaDisciplinar[]>([]);
  protected readonly motivos = signal<MotivoMedidaDisciplinar[]>([]);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly drawerAberto = signal(false);
  protected readonly emEdicao = signal<MedidaDisciplinar | null>(null);

  protected readonly resumo = computed(() => {
    const vigentes = this.medidas().filter((m) => m.situacao === 'APLICADA').length;
    const total = this.medidas().length;
    if (!total) return 'Histórico disciplinar do colaborador.';
    return `${total === 1 ? '1 medida' : total + ' medidas'}, ${vigentes === 1 ? '1 aplicada' : vigentes + ' aplicadas'}.`;
  });

  constructor() {
    effect(() => {
      const id = this.idColaborador();
      untracked(() => this.carregar(id));
    });
    this.servico.tipos(false).subscribe({ next: (t) => this.tipos.set(t), error: () => undefined });
    this.servico.motivos(false).subscribe({ next: (m) => this.motivos.set(m), error: () => undefined });
  }

  protected nova(): void {
    this.emEdicao.set(null);
    this.drawerAberto.set(true);
  }

  protected abrir(m: MedidaDisciplinar): void {
    this.servico.buscar(m.id).subscribe({
      next: (d) => {
        this.emEdicao.set(d);
        this.drawerAberto.set(true);
      },
      error: () => undefined
    });
  }

  protected aoSalvar(m: MedidaDisciplinar): void {
    if (this.drawerAberto()) this.emEdicao.set(m);
    this.carregar(this.idColaborador());
  }

  private carregar(id: string): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.servico.listar({ idColaborador: id }, { page: 0, size: 100, sort: ['dataFato,desc'] }).subscribe({
      next: (p) => {
        this.medidas.set(p.content);
        this.carregando.set(false);
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.carregando.set(false);
      }
    });
  }
}
