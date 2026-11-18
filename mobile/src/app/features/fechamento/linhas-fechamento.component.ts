import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { ToastService } from '../../core/ui/toast.service';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';
import { AlmoxService } from '../../core/almox/almox.service';
import { Material } from '../../core/almox/almox.models';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { FolhaComponent, IconeComponent, QuantidadeComponent, VazioComponent, numeroBr } from '../../ui';

export interface LinhaFechamento {
  idItem?: string | null;
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  /** Quanto já foi movimentado: a quantidade não pode ficar abaixo disso. */
  minimo?: number;
  removivel?: boolean;
  erro?: string | null;
}

const QUANTIDADE_MINIMA = 0.001;

/** Materiais de uma solicitação: quantidade por linha e busca no catálogo em folha inferior. */
@Component({
  selector: 'app-linhas-fechamento',
  standalone: true,
  imports: [FolhaComponent, IconeComponent, QuantidadeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (linhas().length) {
      <ul class="ces-grupo lista" [attr.aria-label]="rotulo()">
        @for (l of linhas(); track l.idMaterial; let i = $index) {
          <li class="ces-linha linha" [class.com-erro]="l.erro">
            <span class="ces-linha__texto">
              <span class="ces-linha__titulo">{{ l.descricao }}</span>
              <span class="ces-linha__apoio ces-num">Cód. {{ l.codigo }}@if (l.minimo) { · já movimentado {{ num(l.minimo) }} {{ l.unidade }} }</span>
            </span>
            @if (l.removivel !== false) {
              <button type="button" class="ces-btn-icone remover" (click)="remover(i)" [attr.aria-label]="'Tirar ' + l.descricao"><ces-icone nome="lixeira" [tamanho]="20" /></button>
            }
            <ces-quantidade [valor]="l.quantidade" (valorChange)="definir(i, $event)" [minimo]="minimoDe(l)" [grande]="true" [unidade]="l.unidade" [rotulo]="'quantidade de ' + l.descricao" />
            @if (l.erro) { <span class="ces-campo__erro erro" role="alert"><ces-icone nome="alerta" [tamanho]="16" />{{ l.erro }}</span> }
          </li>
        }
      </ul>
    }
    <button type="button" class="ces-btn ces-btn--tonal ces-btn--bloco adicionar" (click)="aberta.set(true)" [disabled]="!rede.isOnline()">
      <ces-icone nome="mais" [tamanho]="18" />{{ rede.isOnline() ? 'Adicionar material' : 'Adicionar material precisa de internet' }}</button>

    <ces-folha [aberta]="aberta()" (fechar)="aberta.set(false)" titulo="Adicionar material" descricao="Toque nos materiais. Eles entram na lista com quantidade 1.">
      <div class="busca"><ces-icone nome="busca" [tamanho]="18" />
        <input type="search" placeholder="Nome ou código" enterkeyhint="search" aria-label="Buscar no catálogo" [value]="busca()" (input)="busca.set($any($event.target).value)"></div>
      @if (buscando() && !catalogo().length) {
        <div class="ces-esqueletos" aria-busy="true">@for (i of [1, 2, 3]; track i) { <div class="ces-esqueleto" style="height: 60px"></div> }</div>
      } @else if (catalogo().length) {
        <ul class="ces-grupo catalogo">
          @for (m of catalogo(); track m.id) {
            <li><button type="button" class="ces-linha ces-linha--acao" (click)="adicionar(m)" [attr.aria-disabled]="foraDeObras(m) ? 'true' : null" [class.fora]="foraDeObras(m)">
              <span class="ces-linha__texto"><span class="ces-linha__titulo">{{ m.descricao }}</span>
                <span class="ces-linha__apoio ces-num">Cód. {{ m.codigo }} · {{ m.unidadeMedida || 'UN' }}</span>
                @if (foraDeObras(m)) { <span class="ces-linha__apoio aviso"><ces-icone nome="alerta" [tamanho]="14" />Material do comercial: não entra no encerramento</span> }</span>
              @if (tem(m.id)) { <span class="ces-etiqueta ces-etiqueta--ok"><ces-icone nome="check" [tamanho]="13" />Na lista</span> }
            </button></li>
          }
        </ul>
      } @else {
        <ces-vazio icone="busca" [titulo]="busca() ? 'Nenhum material encontrado' : 'Busque o material'" [texto]="busca() ? 'Confira o nome ou o código.' : 'Digite o nome ou o código para ver o catálogo.'" />
      }
      <div rodape class="ces-folha-rodape"><button type="button" class="ces-btn ces-btn--principal" (click)="aberta.set(false)">Pronto · {{ linhas().length }}</button></div>
    </ces-folha>
  `,
  styles: [`
    :host { display: block; }
    .linha { flex-wrap: wrap; row-gap: var(--ces-e2); }
    .linha .ces-linha__texto { flex: 1 1 60%; }
    .linha ces-quantidade { margin-left: auto; }
    .linha.com-erro { box-shadow: inset 3px 0 0 var(--ces-erro); }
    .erro { flex-basis: 100%; }
    .remover { color: var(--ces-texto-2); }
    .adicionar { width: calc(100% - 2 * var(--ces-e3)); margin: var(--ces-e2) var(--ces-e3) 0; min-height: 56px; }
    .busca { margin: 0 var(--ces-e3) var(--ces-e3); display: flex; align-items: center; gap: var(--ces-e2); padding: 0 var(--ces-e4); min-height: 48px;
      border-radius: var(--ces-r-pilula); background: var(--ces-superficie-2); color: var(--ces-texto-2); }
    .busca input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--ces-texto); font: var(--ces-t-corpo); font-size: 1rem; }
    .busca input:focus { outline: none; }
    .catalogo { background: var(--ces-fundo); }
    button.ces-linha.fora { opacity: 0.72; }
    .aviso { display: inline-flex; align-items: center; gap: 4px; color: var(--ces-atencao); }
    button.ces-linha { width: 100%; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; }
  `],
})
export class LinhasFechamentoComponent {
  private readonly almox = inject(AlmoxService);
  readonly rede = inject(ConnectivityService);
  private readonly toast = inject(ToastService);

  readonly linhas = model.required<LinhaFechamento[]>();
  readonly rotulo = input('Materiais');
  readonly aberta = signal(false);
  readonly busca = signal('');
  readonly catalogo = signal<Material[]>([]);
  readonly buscando = signal(false);
  private readonly ids = computed(() => new Set(this.linhas().map(l => l.idMaterial)));

  constructor() {
    toObservable(this.busca).pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap(() => this.buscando.set(true)),
      switchMap(q => (q.trim() ? this.almox.buscarMateriais(q, 0).pipe(catchError(() => of(null))) : of(null))),
      takeUntilDestroyed(),
    ).subscribe(r => {
      this.buscando.set(false);
      this.catalogo.set(r?.content ?? []);
    });
  }

  num(n: number): string {
    return numeroBr(n);
  }

  tem(id: string): boolean {
    return this.ids().has(id);
  }

  minimoDe(l: LinhaFechamento): number {
    return Math.max(QUANTIDADE_MINIMA, l.minimo ?? 0);
  }

  /** Só materiais do processo Obras entram no encerramento (a regra também vale no servidor). */
  foraDeObras(m: Material): boolean {
    return !!m.processo?.nome && m.processo.nome.trim().toUpperCase() !== 'OBRAS';
  }

  adicionar(m: Material): void {
    if (this.tem(m.id)) return;
    if (this.foraDeObras(m)) {
      this.toast.warning(`${m.codigo} é do processo comercial e não entra no fechamento. Ajuste o processo no cadastro do material, se ele também for de obras.`);
      return;
    }
    this.linhas.update(l => [...l, { idMaterial: m.id, codigo: m.codigo, descricao: m.descricao, unidade: m.unidadeMedida || 'UN', quantidade: 1 }]);
  }

  definir(i: number, quantidade: number): void {
    this.linhas.update(l => l.map((x, k) => (k === i ? { ...x, quantidade, erro: null } : x)));
  }

  remover(i: number): void {
    this.linhas.update(l => l.filter((_, k) => k !== i));
  }
}
