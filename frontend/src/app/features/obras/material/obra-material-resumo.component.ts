import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GeoAsyncStateComponent, GeoButtonComponent } from '@geo/ui';
import { MaterialDaObra } from '../../../core/models/estoque-obra.models';
import { EstoqueObraService } from '../../../core/services/estoque-obra.service';

/**
 * Resumo do material na ficha da obra: quantos materiais já foram entregues, aplicados, estão com as equipes e
 * voltaram, onde estão, e um aviso curto se algo pede conferência. O detalhe fica na página Material da obra.
 */
@Component({
  selector: 'app-obra-material-resumo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, GeoAsyncStateComponent, GeoButtonComponent],
  template: `
    @if (erro()) {
      <p class="mr-fraco">Não foi possível carregar o material. <button type="button" class="mr-link" (click)="carregar()">Tentar de novo</button></p>
    } @else if (!dados()) {
      <geo-async-state state="loading" [compact]="true" title="Carregando o material"></geo-async-state>
    } @else {
      <div class="mr">
        <dl class="mr-balanco">
          <div><dt>Previstos</dt><dd>{{ totais().previstos }}</dd></div>
          <div><dt>Entregues</dt><dd>{{ totais().entregues }}</dd></div>
          <div><dt>Aplicados</dt><dd>{{ totais().aplicados }}</dd></div>
          <div><dt>Com as equipes</dt><dd>{{ totais().comEquipes }}</dd></div>
          <div><dt>Devolvidos</dt><dd>{{ totais().devolvidos }}</dd></div>
        </dl>
        <div class="mr-linha">
          @if (locais().length) {
            <span class="mr-onde"><i class="pi pi-truck" aria-hidden="true"></i>
              @for (l of locais(); track l.nome; let ultimo = $last) { <span><strong>{{ l.nome }}</strong> com {{ l.itens }} {{ l.itens === 1 ? 'material' : 'materiais' }}{{ ultimo ? '' : ',' }}</span> }
            </span>
          } @else {
            <span class="mr-fraco">Nenhum material desta obra com as equipes agora.</span>
          }
          @if (retiradasAbertas()) {
            <span class="mr-fraco">e {{ retiradasAbertas() }} {{ retiradasAbertas() === 1 ? 'retirada aberta no almoxarifado' : 'retiradas abertas no almoxarifado' }}</span>
          }
        </div>
        @if (conferir()) {
          <p class="mr-aviso"><i class="pi pi-info-circle" aria-hidden="true"></i>{{ conferir() }}</p>
        }
        <geo-button class="mr-abrir" variant="secondary" size="sm" icon="pi pi-arrow-right" label="Material da obra"
          [routerLink]="['/obras', idObra(), 'material']"></geo-button>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .mr { display: grid; gap: var(--geo-space-3); }
    .mr-balanco { display: flex; flex-wrap: wrap; margin: 0; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); }
    .mr-balanco div { flex: 1 1 7rem; display: flex; align-items: baseline; justify-content: space-between; gap: var(--geo-space-2);
      padding: var(--geo-space-2) var(--geo-space-3); border-right: 1px solid var(--geo-border); }
    .mr-balanco div:last-child { border-right: 0; }
    .mr-balanco dt { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .mr-balanco dd { margin: 0; font-weight: var(--geo-font-weight-semibold); font-variant-numeric: tabular-nums; }
    .mr-linha { display: flex; flex-wrap: wrap; gap: var(--geo-space-1); align-items: center; font-size: var(--geo-font-body); }
    .mr-onde { display: inline-flex; flex-wrap: wrap; gap: var(--geo-space-1); align-items: center; }
    .mr-onde i { color: var(--geo-foreground-muted); }
    .mr-fraco { margin: 0; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .mr-aviso { margin: 0; display: flex; gap: var(--geo-space-2); align-items: flex-start; color: var(--geo-warning-text); font-size: var(--geo-font-caption); }
    .mr-abrir { justify-self: start; }
    .mr-link { border: 0; background: none; color: var(--geo-brand-text); cursor: pointer; padding: 0; font: inherit; }
  `,
})
export class ObraMaterialResumoComponent {
  private readonly service = inject(EstoqueObraService);
  readonly idObra = input.required<string>();
  readonly retiradasAbertas = input(0);

  protected readonly dados = signal<MaterialDaObra | null>(null);
  protected readonly erro = signal(false);

  protected readonly totais = computed(() => {
    const m = this.dados()?.materiais ?? [];
    const conta = (f: (l: (typeof m)[number]) => boolean) => m.filter(f).length;
    return {
      previstos: conta((l) => l.previsto > 0),
      entregues: conta((l) => l.entregue > 0),
      aplicados: conta((l) => l.aplicado > 0),
      comEquipes: conta((l) => l.comEquipes > 0),
      devolvidos: conta((l) => l.devolvido > 0),
    };
  });
  protected readonly locais = computed(() => {
    const mapa = new Map<string, number>();
    for (const l of this.dados()?.materiais ?? []) for (const o of l.onde) mapa.set(o.nome, (mapa.get(o.nome) ?? 0) + 1);
    return [...mapa.entries()].map(([nome, itens]) => ({ nome, itens })).sort((a, b) => a.nome.localeCompare(b.nome));
  });
  protected readonly conferir = computed(() => {
    const m = this.dados()?.materiais ?? [];
    const semSaldo = m.filter((l) => l.aplicadoSemSaldo > 0).length;
    const outras = m.filter((l) => l.recebido > 0 || l.semMaterialDaObra - l.aplicadoSemSaldo > 0).length;
    if (semSaldo) return `${semSaldo} ${semSaldo === 1 ? 'material foi aplicado' : 'materiais foram aplicados'} sem constar no caminhão da equipe. Confira na página do material.`;
    if (outras) return `${outras} ${outras === 1 ? 'material aplicado veio' : 'materiais aplicados vieram'} de outra obra ou do estoque livre da equipe.`;
    return null;
  });

  constructor() {
    effect(() => {
      const id = this.idObra();
      untracked(() => this.carregar(id));
    });
  }

  protected carregar(id = this.idObra()): void {
    this.erro.set(false);
    this.dados.set(null);
    this.service.materialDaObra(id).subscribe({
      next: (d) => {
        if (id === this.idObra()) this.dados.set(d);
      },
      error: () => {
        if (id === this.idObra()) this.erro.set(true);
      },
    });
  }
}
