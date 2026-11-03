import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Cabeçalho institucional e faixa do título dos relatórios da frota, igual ao da solicitação
 * de material. Os metadados do título (número, emissão) entram por projeção.
 */
@Component({
  selector: 'app-frota-relatorio-cabecalho',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./frota-relatorio.css'],
  styles: `:host { background: transparent; min-height: 0; }`,
  template: `
    <header class="rel-cabecalho" aria-label="Cabeçalho institucional">
      <div class="rel-cabecalho__centro">
        <p class="rel-cabecalho__empresa">NEXO Construções LTDA</p>
        <p class="rel-cabecalho__area">Gestão de Frota · {{ area() }}</p>
        <p class="rel-cabecalho__cliente">Serviços prestados à distribuidora</p>
      </div>
    </header>
    <div class="rel-titulo">
      <h1>{{ titulo() }}</h1>
      <div class="rel-titulo__meta"><ng-content /></div>
      <div class="rel-titulo__acoes"><ng-content select="[acoes-titulo]" /></div>
    </div>
  `
})
export class FrotaRelatorioCabecalhoComponent {
  readonly area = input.required<string>();
  readonly titulo = input.required<string>();
}
