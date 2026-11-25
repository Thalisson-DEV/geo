import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, WritableSignal, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GeoAsyncStateComponent, GeoButtonComponent, GeoStatusComponent } from '@geo/ui';
import { AtendimentoResumo } from '../../../core/models/balcao.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { NavigationHistoryService } from '../../../core/navigation/navigation-history.service';
import { BalcaoService } from '../../../core/services/balcao.service';
import { numeroBr } from './balcao.logic';

/** Termo de retirada ou devolução do balcão: o que saiu ou voltou, quem, matrícula, assinatura e foto. */
@Component({
  selector: 'app-termo-atendimento',
  standalone: true,
  imports: [DatePipe, GeoAsyncStateComponent, GeoButtonComponent, GeoStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (carregando()) {
      <geo-async-state state="loading" title="Carregando o termo"></geo-async-state>
    } @else if (erro()) {
      <geo-async-state state="error" title="Termo indisponível" [description]="erro() ?? undefined" actionLabel="Tentar de novo" (action)="carregar()"></geo-async-state>
    } @else if (termo(); as t) {
      <div class="geo-relatorio-acoes print:hidden">
        <geo-button variant="ghost" icon="pi pi-arrow-left" label="Voltar" (pressed)="voltar()"></geo-button>
        <geo-button variant="outline" icon="pi pi-print" label="Imprimir" (pressed)="imprimir()"></geo-button>
      </div>
      <article class="geo-relatorio-folha">
        <div class="geo-relatorio-timbre">Termo de {{ t.tipo === 'RETIRADA' ? 'retirada' : 'devolução' }} de material</div>
        <header class="ta-cab">
          <div>
            <h1 class="geo-relatorio-titulo">{{ t.tipo === 'RETIRADA' ? 'Retirada' : 'Devolução' }} de material · {{ t.equipe }}</h1>
            <span class="ta-fraco">{{ t.realizadoEm | date: "dd/MM/yyyy 'às' HH:mm" }}@if (t.operador) { · atendido por {{ t.operador }} }</span>
          </div>
          <geo-status [tone]="t.tipo === 'RETIRADA' ? 'info' : 'success'">{{ itensTexto() }}</geo-status>
        </header>

        <section class="geo-relatorio-secao">
          <h2>Itens</h2>
          <table class="ta-tabela">
            <thead>
              <tr>
                <th scope="col">Material</th>
                <th scope="col">Obra</th>
                <th scope="col">Condição</th>
                @if (t.tipo === 'DEVOLUCAO') { <th scope="col">Destino</th> }
                <th scope="col" class="ta-num">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              @for (i of t.itens; track $index) {
                <tr>
                  <td><span class="ta-cod">{{ i.codigo }}</span> {{ i.descricao }}@if (i.numeroSerie) { <span class="ta-fraco"> · série {{ i.numeroSerie }}</span> }
                    @if (i.excedente) { <div class="ta-excedente">+{{ num(i.excedente) }} acima do pedido{{ i.motivoExcedente ? ': ' + i.motivoExcedente : '' }}</div> }
                  </td>
                  <td>{{ i.numeroObra ?? 'Sem obra' }}</td>
                  <td>{{ i.condicao === 'SUCATA' ? 'Sucata' : 'Novo' }}</td>
                  @if (t.tipo === 'DEVOLUCAO') { <td>{{ i.destino === 'DESCARTAR' ? 'Descarte' : 'Estoque' }}</td> }
                  <td class="ta-num">{{ num(i.quantidade) }} {{ i.unidade }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>

        <section class="geo-relatorio-secao ta-quem">
          <h2>{{ t.tipo === 'RETIRADA' ? 'Quem retirou' : 'Quem devolveu' }}</h2>
          <div class="ta-quem__grade">
            <div class="ta-dados">
              <span class="ta-fraco">Nome</span><strong>{{ t.nomeColaborador ?? '—' }}</strong>
              <span class="ta-fraco">Matrícula</span><strong>{{ t.matricula ?? '—' }}</strong>
              @if (t.observacao) { <span class="ta-fraco">Observação</span><span>{{ t.observacao }}</span> }
            </div>
            <figure class="ta-figura">
              @if (assinaturaUrl()) { <img [src]="assinaturaUrl()" alt="Assinatura" class="ta-assinatura" /> }
              @else if (t.assinaturaFisica) { <div class="ta-linha"></div> }
              @else { <span class="ta-fraco">Sem assinatura</span> }
              <figcaption>{{ t.assinaturaFisica ? 'Assinatura (termo em papel)' : 'Assinatura' }}</figcaption>
            </figure>
            <figure class="ta-figura">
              @if (fotoUrl()) { <img [src]="fotoUrl()" alt="Foto de quem retirou" class="ta-foto" /> } @else { <span class="ta-fraco">Sem foto</span> }
              <figcaption>Foto (só para consulta)</figcaption>
            </figure>
          </div>
        </section>
      </article>
    }
  `,
  styles: `
    :host { display: block; }
    .ta-cab { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--geo-space-3); margin-bottom: var(--geo-space-4); }
    .ta-fraco { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .ta-tabela { width: 100%; border-collapse: collapse; font-size: var(--geo-font-table); }
    .ta-tabela th { text-align: left; color: var(--geo-foreground-muted); font-size: var(--geo-font-table-meta); font-weight: var(--geo-font-weight-medium); padding: var(--geo-space-1) var(--geo-space-2); border-bottom: 1px solid var(--geo-border); }
    .ta-tabela td { padding: var(--geo-space-1) var(--geo-space-2); border-bottom: 1px solid var(--geo-border); vertical-align: top; }
    .ta-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    th.ta-num { text-align: right; }
    .ta-cod { font-family: var(--geo-font-family-mono); color: var(--geo-foreground-muted); }
    .ta-excedente { color: var(--geo-warning-text); font-size: var(--geo-font-caption); }
    .ta-quem__grade { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--geo-space-4); align-items: start; }
    .ta-dados { display: grid; grid-template-columns: auto 1fr; gap: var(--geo-space-1) var(--geo-space-3); align-items: baseline; }
    .ta-figura { margin: 0; display: grid; gap: var(--geo-space-1); justify-items: start; }
    .ta-figura figcaption { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .ta-assinatura { max-width: 100%; max-height: 7rem; background: var(--p-surface-0); border: 1px solid var(--geo-border); border-radius: var(--geo-radius-sm); }
    .ta-foto { max-width: 100%; max-height: 10rem; border-radius: var(--geo-radius-sm); }
    .ta-linha { width: 100%; height: 4rem; border-bottom: 1px solid var(--geo-foreground); }
    @media (max-width: 800px) { .ta-quem__grade { grid-template-columns: 1fr; } }
  `,
})
export class TermoAtendimentoComponent {
  private readonly balcao = inject(BalcaoService);
  private readonly route = inject(ActivatedRoute);
  private readonly historico = inject(NavigationHistoryService);
  private readonly urls: string[] = [];

  protected readonly num = numeroBr;
  protected readonly termo = signal<AtendimentoResumo | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly assinaturaUrl = signal<string | null>(null);
  protected readonly fotoUrl = signal<string | null>(null);
  protected readonly itensTexto = computed(() => {
    const n = this.termo()?.itens.length ?? 0;
    return `${n} ${n === 1 ? 'material' : 'materiais'}`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.urls.forEach((u) => URL.revokeObjectURL(u)));
    this.carregar();
  }

  protected carregar(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.carregando.set(true);
    this.erro.set(null);
    this.balcao.atendimentoPorId(id).subscribe({
      next: (t) => {
        this.termo.set(t);
        this.carregando.set(false);
        if (t.temAssinatura) this.baixar(id, 'assinatura', this.assinaturaUrl);
        if (t.temFoto) this.baixar(id, 'foto', this.fotoUrl);
      },
      error: (e) => {
        this.erro.set(getErrorMessage(e));
        this.carregando.set(false);
      },
    });
  }

  protected voltar(): void {
    this.historico.back('/almoxarifado/balcao');
  }

  protected imprimir(): void {
    window.print();
  }

  private baixar(id: string, parte: 'assinatura' | 'foto', alvo: WritableSignal<string | null>): void {
    this.balcao.comprovante(id, parte).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.urls.push(url);
        alvo.set(url);
      },
      error: () => undefined,
    });
  }
}
