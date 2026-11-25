import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GeoAsyncStateComponent, GeoButtonComponent, GeoPageHeaderComponent } from '@geo/ui';
import { getErrorMessage } from '../../../core/models/shared.models';
import {
  MovimentacaoResumoObra,
  ProjecaoObraSolicitacoesResponse,
  SolicitacaoResumoObra,
} from '../../../core/models/solicitacao-material-tecnica.models';
import { NavigationHistoryService } from '../../../core/navigation/navigation-history.service';
import { AuthService } from '../../../core/services/auth.service';
import { ObrasService } from '../../../core/services/obras.service';
import { SolicitacaoMaterialTecnicaService } from '../../../core/services/solicitacao-material-tecnica.service';
import { ObraEstoqueComponent } from '../detalhe/obra-estoque.component';
import { ObraMateriaisComponent } from '../detalhe/obra-materiais.component';

/**
 * Material da obra numa página própria: o balanço por material (previsto, entregue, aplicado, com as equipes,
 * devolvido), onde está agora, o rastro entre obras, as solicitações e as movimentações agrupadas por dia. A ficha
 * da obra mostra só o resumo e traz para cá.
 */
@Component({
  selector: 'app-obra-material',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, GeoAsyncStateComponent, GeoButtonComponent, GeoPageHeaderComponent, ObraEstoqueComponent, ObraMateriaisComponent],
  template: `
    <div class="geo-page">
      <geo-page-header [title]="'Material da obra ' + (numero() ?? '')" icon="pi pi-box"
        [breadcrumb]="[{ label: 'Obras', route: '/obras' }, { label: numero() ?? 'Obra', route: '/obras/' + idObra }, { label: 'Material' }]"
        [description]="titulo() ?? 'O que foi entregue, aplicado e devolvido, e onde está o material desta obra agora.'">
        <div actions class="om-acoes">
          <geo-button variant="ghost" icon="pi pi-arrow-left" label="Voltar" (pressed)="voltar()"></geo-button>
          <geo-button variant="secondary" icon="pi pi-inbox" label="Balcão" routerLink="/almoxarifado/balcao"></geo-button>
          <geo-button icon="pi pi-cart-plus" label="Solicitar materiais" (pressed)="solicitar()"></geo-button>
        </div>
      </geo-page-header>

      <section class="om-painel" aria-label="Balanço do material">
        @if (podeVerSaldo) {
          <app-obra-estoque [idObra]="idObra" [podeMovimentar]="podeMovimentar" (movimentado)="carregar()"></app-obra-estoque>
        } @else {
          <p class="om-fraco">Sem acesso ao saldo do estoque.</p>
        }
      </section>

      <section class="om-painel" aria-label="Solicitações e movimentações">
        @switch (carga().estado) {
          @case ('loading') { <geo-async-state state="loading" [compact]="true" title="Carregando solicitações e movimentações"></geo-async-state> }
          @case ('error') {
            <geo-async-state state="error" [compact]="true" title="Não foi possível carregar" [description]="erro()" actionLabel="Tentar de novo" (action)="carregar()"></geo-async-state>
          }
          @default {
            <app-obra-materiais [solicitacoes]="solicitacoes()" [movimentacoes]="movimentacoes()" [truncadas]="truncadas()" [saldo]="null"></app-obra-materiais>
          }
        }
      </section>
    </div>
  `,
  styles: `
    .om-acoes { display: flex; gap: var(--geo-space-2); flex-wrap: wrap; }
    .om-painel { padding: var(--geo-space-4); margin-bottom: var(--geo-space-4); border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg); background: var(--geo-surface); }
    .om-fraco { margin: 0; color: var(--geo-foreground-muted); }
  `,
})
export class ObraMaterialComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly historico = inject(NavigationHistoryService);
  private readonly obras = inject(ObrasService);
  private readonly solicitacaoService = inject(SolicitacaoMaterialTecnicaService);
  private readonly permissoes = inject(AuthService).currentUser()?.permissoes ?? [];

  protected readonly idObra = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly podeVerSaldo = this.permissoes.includes('estoque:saldo:read');
  protected readonly podeMovimentar = this.permissoes.includes('estoque:movimentacao:write');
  protected readonly numero = signal<string | null>(null);
  protected readonly titulo = signal<string | null>(null);
  protected readonly carga = signal<{ estado: 'loading' | 'error' | 'ready'; dados?: ProjecaoObraSolicitacoesResponse | null; mensagem?: string }>({ estado: 'loading' });
  protected readonly erro = computed(() => this.carga().mensagem ?? '');
  protected readonly solicitacoes = computed<(SolicitacaoResumoObra & { ocorrencia?: string | null })[]>(() => {
    const proj = this.carga().dados;
    if (!proj) return [];
    if (proj.ocorrencias?.length) return proj.ocorrencias.flatMap((oc) => oc.solicitacoes.map((s) => ({ ...s, ocorrencia: oc.codigo || 'Geral' })));
    return proj.solicitacoes ?? [];
  });
  protected readonly movimentacoes = computed<MovimentacaoResumoObra[]>(() => this.carga().dados?.movimentacoes ?? []);
  protected readonly truncadas = computed(() => !!this.carga().dados?.movimentacoesTruncadas);

  constructor() {
    this.obras.buscarObraPorId(this.idObra).subscribe({
      next: (o) => {
        this.numero.set(o.numero);
        this.titulo.set(o.titulo);
      },
      error: () => undefined,
    });
    this.carregar();
  }

  protected carregar(): void {
    this.carga.set({ estado: 'loading' });
    this.solicitacaoService.obterProjecaoObra(this.idObra).subscribe({
      next: (dados) => this.carga.set({ estado: 'ready', dados }),
      error: (e) => this.carga.set({ estado: 'error', mensagem: getErrorMessage(e) }),
    });
  }

  protected voltar(): void {
    this.historico.back(['/obras', this.idObra]);
  }

  protected solicitar(): void {
    void this.router.navigate(['/almoxarifado/solicitacoes-tecnicas/nova'], { queryParams: { idObra: this.idObra } });
  }
}
