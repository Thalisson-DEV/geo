import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { GeoButtonComponent, GeoFormDrawerComponent } from '@geo/ui';

const INTEIRO = new Intl.NumberFormat('pt-BR');

export type FormatoExportacao = 'resumo' | 'detalhado';

export interface OpcaoFormatoExportacao {
  /** Ex.: "Resumido". */
  rotulo: string;
  /** Ex.: "1 linha por nota". */
  dica: string;
}

/**
 * Drawer de exportação em CSV no desenho das solicitações de material: escolha do formato
 * (resumido ou detalhado), o recorte com os filtros da tela (projetados pelo pai) e, no rodapé,
 * quantos registros vão no arquivo. Acima do limite, avisa que só os mais recentes entram.
 */
@Component({
  selector: 'app-exportacao-csv-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoButtonComponent, GeoFormDrawerComponent],
  styleUrls: ['../../features/almoxarifado/solicitacoes-material/nova-solicitacao/nova-solicitacao.css'],
  styles: `
    .ex-formato { display: grid; gap: 0.5rem; }
    .ex-recorte { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.875rem; }
    @media (max-width: 40rem) { .ex-recorte { grid-template-columns: minmax(0, 1fr); } }
  `,
  template: `
    <geo-form-drawer #drawer [(visible)]="visible" [title]="titulo()" [description]="descricao()" size="md">
      <div class="ns">
        <section class="ns-secao" aria-labelledby="ex-formato">
          <h3 id="ex-formato" class="ns-secao__titulo"><i class="pi pi-file" aria-hidden="true"></i>Formato</h3>
          <div class="ex-formato">
            <div class="ns-pilulas" role="radiogroup" aria-labelledby="ex-formato">
              @for (opcao of opcoes(); track opcao.valor) {
                <button type="button" class="ns-pilula" role="radio" [attr.aria-checked]="formato() === opcao.valor" (click)="formato.set(opcao.valor)">
                  {{ opcao.rotulo }}
                </button>
              }
            </div>
            <p class="ns-secao__dica">{{ dicaFormato() }}</p>
          </div>
        </section>

        <section class="ns-secao" aria-labelledby="ex-recorte">
          <div class="ns-secao__topo">
            <h3 id="ex-recorte" class="ns-secao__titulo"><i class="pi pi-filter" aria-hidden="true"></i>Recorte</h3>
            <p class="ns-secao__dica">Começa igual à lista; mudar aqui não mexe na tela.</p>
          </div>
          <div class="ns-cartao">
            <div class="ex-recorte">
              <ng-content></ng-content>
            </div>
          </div>
        </section>

        @if (acimaDoLimite()) {
          <p class="ns-info ns-info--aviso" role="status">
            <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
            <span>
              O recorte tem <strong>{{ n(total()) }}</strong> {{ plural() }}. O arquivo leva no máximo
              <strong>{{ n(limite()) }}</strong>, {{ maisRecentes() }}; encurte o período para levar o resto.
            </span>
          </p>
        } @else {
          <p class="ns-info">
            <i class="pi pi-info-circle" aria-hidden="true"></i>
            <span>O arquivo leva no máximo {{ n(limite()) }} {{ plural() }}, {{ maisRecentes() }}.</span>
          </p>
        }
      </div>

      <div drawer-footer class="ns-rodape">
        <span class="ns-rodape__resumo" aria-live="polite">
          @if (contando()) {
            Contando {{ plural() }}…
          } @else if (total() === 0) {
            Nenhum{{ feminino() ? 'a' : '' }} {{ singular() }} nesse recorte
          } @else if (total() !== null) {
            @if (acimaDoLimite()) {
              <strong>{{ n(limite()) }}</strong> de {{ n(total()) }} {{ plural() }}
            } @else {
              <strong>{{ n(total()) }}</strong> {{ total() === 1 ? singular() : plural() }} no arquivo
            }
          }
        </span>
        <span class="ns-rodape__acoes">
          <geo-button label="Cancelar" variant="ghost" (pressed)="drawer.requestClose()" />
          <geo-button label="Baixar CSV" icon="pi pi-download" [loading]="exportando()" [disabled]="total() === 0" (pressed)="exportar.emit(formato())" />
        </span>
      </div>
    </geo-form-drawer>
  `
})
export class ExportacaoCsvDrawerComponent {
  readonly visible = model(false);
  readonly formato = model<FormatoExportacao>('resumo');
  readonly titulo = input.required<string>();
  readonly descricao = input<string>();
  readonly resumo = input.required<OpcaoFormatoExportacao>();
  readonly detalhado = input.required<OpcaoFormatoExportacao>();
  /** "nota", "turno"... */
  readonly singular = input.required<string>();
  readonly plural = input.required<string>();
  readonly feminino = input(false);
  /** Quantos registros o recorte tem; nulo enquanto não se sabe. */
  readonly total = input<number | null>(null);
  readonly contando = input(false);
  readonly limite = input.required<number>();
  readonly exportando = input(false);
  readonly exportar = output<FormatoExportacao>();

  protected readonly opcoes = computed(() => [
    { valor: 'resumo' as const, rotulo: this.resumo().rotulo },
    { valor: 'detalhado' as const, rotulo: this.detalhado().rotulo }
  ]);
  protected readonly dicaFormato = computed(() => (this.formato() === 'resumo' ? this.resumo() : this.detalhado()).dica);
  protected readonly acimaDoLimite = computed(() => (this.total() ?? 0) > this.limite());
  /** Milhar com ponto, independente do locale da aplicação. */
  protected n(valor: number | null): string {
    return valor === null ? '' : INTEIRO.format(valor);
  }

  protected readonly maisRecentes = computed(() => (this.feminino() ? 'as mais recentes' : 'os mais recentes'));
}
