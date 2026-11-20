import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoStatusComponent } from '@geo/ui';
import { catchError, of } from 'rxjs';
import { ItemMedido, MedicaoDaObra, MedicaoDetalhe } from '../../../core/models/obras-medicoes.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { NavigationHistoryService } from '../../../core/navigation/navigation-history.service';
import { ObrasMedicoesService } from '../../../core/services/obras-medicoes.service';
import { imprimirSempreNoTemaClaro } from '../../execucao/relatorios/relatorio-impressao';
import { formatarMoeda } from '../obras-ui';
import { STATUS_MEDICAO, TIPO_MEDICAO, rotuloCompetencia } from './medicoes.logic';

const OPERACAO = { INSTALAR: 'Instalar', RETIRAR: 'Retirar' } as const;
const ORDEM_NATURAL = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

/** Linha do resumo: o mesmo serviço (código, operação, unidade e preço) somado em todos os locais. */
export interface LinhaResumoServico {
  chave: string;
  codigo: string | null;
  descricao: string | null;
  operacao: string;
  unidade: string | null;
  quantidade: number;
  valorUnitario: number | null;
  valorTotal: number;
  locais: number;
}

/** Soma os itens medidos por serviço, na ordem do código. */
export function resumirPorServico(itens: ItemMedido[]): LinhaResumoServico[] {
  const grupos = new Map<string, LinhaResumoServico>();
  for (const i of itens) {
    const chave = [i.codigo, i.operacao, i.unidade, i.valorUnitario].join('|');
    const atual = grupos.get(chave);
    if (atual) {
      atual.quantidade += i.quantidade;
      atual.valorTotal += i.valorTotal ?? 0;
      atual.locais += 1;
    } else {
      grupos.set(chave, {
        chave,
        codigo: i.codigo,
        descricao: i.descricao,
        operacao: OPERACAO[i.operacao] ?? i.operacao,
        unidade: i.unidade ?? null,
        quantidade: i.quantidade,
        valorUnitario: i.valorUnitario ?? null,
        valorTotal: i.valorTotal ?? 0,
        locais: 1
      });
    }
  }
  return [...grupos.values()].sort((a, b) => ORDEM_NATURAL.compare(a.codigo ?? '', b.codigo ?? '') || a.operacao.localeCompare(b.operacao));
}

/**
 * Boletim de medição: o documento que vai para a fiscalização. Segue o padrão de relatório (ações no topo, folha,
 * título): identificação da obra e da medição, posição financeira da obra, resumo por serviço, detalhe por local
 * e assinaturas.
 */
@Component({
  selector: 'app-boletim-medicao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, GeoAsyncStateComponent, GeoButtonComponent, GeoCalloutComponent, GeoStatusComponent],
  template: `
    @if (erro(); as mensagem) {
      <geo-async-state state="error" title="Não foi possível abrir o boletim" [description]="mensagem" actionLabel="Voltar" (action)="voltar()"></geo-async-state>
    } @else if (!dados()) {
      <geo-async-state state="loading" title="Montando o boletim de medição"></geo-async-state>
    } @else {
      @let m = dados()!.medicao;
      @let st = status[m.status];
      <div class="geo-relatorio-acoes print:hidden">
        <geo-button variant="ghost" icon="pi pi-arrow-left" label="Voltar" (pressed)="voltar()"></geo-button>
        <geo-button variant="outline" icon="pi pi-building" label="Ficha da obra" (pressed)="irParaObra(m.idObra)"></geo-button>
        <geo-button icon="pi pi-print" label="Imprimir" (pressed)="imprimir()"></geo-button>
      </div>

      <article class="geo-relatorio-folha boletim">
        <header class="geo-relatorio-titulo">
          <h2>Boletim de medição #{{ m.numero }}</h2>
          <div class="boletim__identificacao">
            <span>Obra <strong>{{ m.numeroObra }}</strong></span>
            <span aria-hidden="true">·</span>
            <span>Competência <strong>{{ competencia(m.competencia) }}</strong></span>
            <span aria-hidden="true">·</span>
            <span>{{ tipo[m.tipo] }}</span>
            <span aria-hidden="true">·</span>
            <geo-status [tone]="st.tom" [icon]="st.icone">{{ st.rotulo }}</geo-status>
          </div>
        </header>

        @if (m.status === 'ESTORNADA') {
          <geo-callout tone="warning" icon="pi pi-undo" [dense]="true"
            [title]="'Medição estornada em ' + (m.dataEstorno | date: 'dd/MM/yyyy HH:mm') + (m.usuarioEstorno ? ' por ' + m.usuarioEstorno : '')">
            {{ m.justificativaEstorno }}. Este boletim não vale para cobrança.
          </geo-callout>
        }

        <section class="boletim__dados" aria-label="Identificação">
          <dl>
            <dt class="boletim__grupo">Obra</dt>
            <div><dt>Número</dt><dd><a [routerLink]="['/obras', m.idObra]">{{ m.numeroObra }}</a></dd></div>
            <div><dt>Título</dt><dd>{{ m.tituloObra || '—' }}</dd></div>
            <div><dt>Município</dt><dd>{{ obra()?.municipio || '—' }}</dd></div>
          </dl>
          <dl>
            <dt class="boletim__grupo">Medição</dt>
            <div><dt>Tipo</dt><dd>{{ tipo[m.tipo] }}</dd></div>
            <div><dt>Competência</dt><dd>{{ competencia(m.competencia) }}</dd></div>
            <div><dt>Gerada</dt><dd>{{ m.dataCriacao | date: 'dd/MM/yyyy HH:mm' }}{{ m.usuarioCriacao ? ' · ' + m.usuarioCriacao : '' }}</dd></div>
          </dl>
          <dl>
            <dt class="boletim__grupo">Conteúdo</dt>
            <div><dt>Serviços medidos</dt><dd>{{ m.servicos }}</dd></div>
            <div><dt>Locais</dt><dd>{{ locais() }}</dd></div>
            @if (m.observacao) { <div><dt>Observação</dt><dd>{{ m.observacao }}</dd></div> }
          </dl>
        </section>

        <section class="geo-kpis boletim__kpis" aria-label="Posição financeira">
          <div class="geo-kpi" data-tone="info">
            <span class="geo-kpi__icon"><i class="pi pi-calculator" aria-hidden="true"></i></span>
            <span class="geo-kpi__body"><span class="geo-kpi__label">Valor desta medição</span>
              <span class="geo-kpi__value">{{ moeda(m.valorTotal) }}</span>
              <span class="geo-kpi__detail">{{ m.servicos }} {{ m.servicos === 1 ? 'serviço' : 'serviços' }}</span></span>
          </div>
          @if (obra(); as o) {
            <div class="geo-kpi">
              <span class="geo-kpi__icon"><i class="pi pi-wallet" aria-hidden="true"></i></span>
              <span class="geo-kpi__body"><span class="geo-kpi__label">Valor de projeto</span>
                <span class="geo-kpi__value">{{ o.valorProjeto != null ? moeda(o.valorProjeto) : '—' }}</span>
                <span class="geo-kpi__detail">Carteira da obra</span></span>
            </div>
            <div class="geo-kpi" data-tone="success">
              <span class="geo-kpi__icon"><i class="pi pi-check-square" aria-hidden="true"></i></span>
              <span class="geo-kpi__body"><span class="geo-kpi__label">Medido na obra até hoje</span>
                <span class="geo-kpi__value">{{ moeda(o.valorMedido) }}</span>
                <span class="geo-kpi__detail">{{ ativas() }} {{ ativas() === 1 ? 'medição ativa' : 'medições ativas' }}</span></span>
            </div>
            <div class="geo-kpi" [attr.data-tone]="o.saldo != null && o.saldo < 0 ? 'danger' : 'neutral'">
              <span class="geo-kpi__icon"><i class="pi pi-chart-bar" aria-hidden="true"></i></span>
              <span class="geo-kpi__body"><span class="geo-kpi__label">Saldo do projeto</span>
                <span class="geo-kpi__value">{{ o.saldo != null ? moeda(o.saldo) : '—' }}</span>
                <span class="geo-kpi__detail">{{ moeda(o.valorPendente) }} executado a medir</span></span>
            </div>
          }
        </section>

        <section class="boletim__secao" aria-labelledby="boletim-resumo">
          <h3 id="boletim-resumo">Resumo por serviço</h3>
          <div class="boletim__tabela">
            <table>
              <thead>
                <tr><th scope="col">Código</th><th scope="col">Serviço</th><th scope="col">Operação</th><th scope="col" class="num">Locais</th>
                  <th scope="col" class="num">Quantidade</th><th scope="col">Un.</th><th scope="col" class="num">Unitário</th><th scope="col" class="num">Total</th></tr>
              </thead>
              <tbody>
                @for (l of resumo(); track l.chave) {
                  <tr>
                    <td class="cod">{{ l.codigo || '—' }}</td>
                    <td>{{ l.descricao || '—' }}</td>
                    <td>{{ l.operacao }}</td>
                    <td class="num">{{ l.locais }}</td>
                    <td class="num">{{ numero(l.quantidade) }}</td>
                    <td>{{ l.unidade || '—' }}</td>
                    <td class="num">{{ l.valorUnitario != null ? moeda(l.valorUnitario) : '—' }}</td>
                    <td class="num forte">{{ moeda(l.valorTotal) }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr><th scope="row" colspan="7">Total da medição</th><td class="num forte">{{ moeda(m.valorTotal) }}</td></tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section class="boletim__secao" aria-labelledby="boletim-detalhe">
          <h3 id="boletim-detalhe">Detalhe por local</h3>
          <div class="boletim__tabela">
            <table>
              <thead>
                <tr><th scope="col">Local</th><th scope="col">Código</th><th scope="col">Serviço</th><th scope="col">Kit</th>
                  <th scope="col" class="num">Quantidade</th><th scope="col" class="num">Valor</th><th scope="col">Concluído em</th></tr>
              </thead>
              <tbody>
                @for (i of detalhe(); track i.id) {
                  <tr>
                    <td class="cod">{{ i.local || '—' }}</td>
                    <td class="cod">{{ i.codigo || '—' }}</td>
                    <td>{{ i.descricao || '—' }}</td>
                    <td>{{ i.codigoKit || '—' }}</td>
                    <td class="num">{{ numero(i.quantidade) }} {{ i.unidade || '' }}</td>
                    <td class="num">{{ i.valorTotal != null ? moeda(i.valorTotal) : '—' }}</td>
                    <td>{{ i.concluidoEm || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="boletim__assinaturas" aria-label="Assinaturas">
          <div><span class="boletim__linha"></span><span>Responsável pela medição</span></div>
          <div><span class="boletim__linha"></span><span>Fiscalização da distribuidora</span></div>
        </section>
        <p class="boletim__emissao">Emitido em {{ emissao | date: 'dd/MM/yyyy HH:mm' }}</p>
      </article>
    }
  `,
  styles: `
    :host { display: block; }
    .boletim__identificacao { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem 0.5rem; color: var(--geo-foreground-muted); font-size: var(--geo-text-body); }
    .boletim__identificacao strong { color: var(--geo-foreground); font-weight: 600; }
    .boletim__dados { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.25rem 2rem; margin: 1.25rem 0; padding: 1rem 1.25rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg); }
    .boletim__dados dl { display: flex; flex-direction: column; gap: 0.5rem; margin: 0; min-width: 0; }
    .boletim__dados dl > div { display: grid; grid-template-columns: 8.5rem minmax(0, 1fr); gap: 0.5rem; }
    .boletim__dados dt { color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .boletim__dados dd { margin: 0; color: var(--geo-foreground); font-size: var(--geo-text-body); font-weight: 600; overflow-wrap: anywhere; }
    .boletim__dados dd a { color: var(--geo-brand); }
    .boletim__dados .boletim__grupo { color: var(--geo-foreground); font-size: var(--geo-font-caption); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .boletim__kpis { margin-bottom: 1.5rem; }
    .boletim__secao { margin-top: 1.5rem; }
    .boletim__secao h3 { margin: 0 0 0.625rem; padding-left: 0.625rem; border-left: 3px solid var(--geo-brand); color: var(--geo-foreground); font-size: var(--geo-text-body); font-weight: 600; }
    .boletim__tabela { overflow-x: auto; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg); }
    .boletim__tabela table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
    .boletim__tabela th, .boletim__tabela td { padding: 0.4375rem 0.75rem; border-bottom: 1px solid var(--geo-border); text-align: left; vertical-align: top; }
    .boletim__tabela thead th { background: var(--geo-surface-subtle); color: var(--geo-foreground-muted); font-weight: 600; white-space: nowrap; }
    .boletim__tabela tbody tr:last-child td { border-bottom: 0; }
    .boletim__tabela tfoot th, .boletim__tabela tfoot td { border-top: 1px solid var(--geo-border-strong); border-bottom: 0; background: var(--geo-surface-subtle); color: var(--geo-foreground); font-weight: 600; }
    .boletim__tabela tfoot th { text-align: right; }
    .boletim__tabela .num { text-align: right; white-space: nowrap; }
    .boletim__tabela .cod { white-space: nowrap; }
    .boletim__tabela .forte { color: var(--geo-foreground); font-weight: 600; }
    .boletim__assinaturas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3rem; margin-top: 3.5rem; }
    .boletim__assinaturas div { display: flex; flex-direction: column; align-items: center; gap: 0.375rem; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); }
    .boletim__linha { width: 100%; max-width: 18rem; border-top: 1px solid var(--geo-foreground-muted); }
    .boletim__emissao { margin: 2rem 0 0; color: var(--geo-foreground-muted); font-size: var(--geo-font-caption); text-align: right; }
    @media (max-width: 767px) {
      .boletim__dados { grid-template-columns: minmax(0, 1fr); }
      .boletim__assinaturas { grid-template-columns: minmax(0, 1fr); }
    }
    @media print {
      .boletim__dados { grid-template-columns: repeat(3, minmax(0, 1fr)); padding: 0.5rem 0; border-width: 1px 0; border-radius: 0; }
      .boletim__tabela { overflow: visible; border-radius: 0; }
      .boletim__tabela tr { break-inside: avoid; }
      .boletim__assinaturas { break-inside: avoid; }
    }
  `
})
export class BoletimMedicaoComponent {
  private readonly api = inject(ObrasMedicoesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly navegacao = inject(NavigationHistoryService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = STATUS_MEDICAO;
  protected readonly tipo = TIPO_MEDICAO;
  protected readonly competencia = rotuloCompetencia;
  protected readonly moeda = formatarMoeda;
  protected readonly emissao = new Date();

  protected readonly dados = signal<MedicaoDetalhe | null>(null);
  protected readonly obra = signal<MedicaoDaObra | null>(null);
  protected readonly erro = signal<string | null>(null);

  protected readonly resumo = computed(() => resumirPorServico(this.dados()?.itens ?? []));
  protected readonly detalhe = computed(() =>
    [...(this.dados()?.itens ?? [])].sort((a, b) => ORDEM_NATURAL.compare(a.local ?? '', b.local ?? '') || ORDEM_NATURAL.compare(a.codigo ?? '', b.codigo ?? ''))
  );
  protected readonly locais = computed(() => new Set((this.dados()?.itens ?? []).map((i) => i.local ?? '')).size);
  protected readonly ativas = computed(() => (this.obra()?.medicoes ?? []).filter((x) => x.status === 'GERADA').length);

  constructor() {
    imprimirSempreNoTemaClaro();
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const id = p.get('id');
      if (id) this.carregar(id);
    });
  }

  protected numero(valor: number): string {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  }

  protected voltar(): void {
    this.navegacao.back('/obras/medicoes?aba=geradas');
  }

  protected irParaObra(id: string): void {
    void this.router.navigate(['/obras', id]);
  }

  protected imprimir(): void {
    window.print();
  }

  private carregar(id: string): void {
    this.erro.set(null);
    this.dados.set(null);
    this.api.detalhar(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (d) => {
        this.dados.set(d);
        this.api.daObra(d.medicao.idObra).pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef)).subscribe((o) => this.obra.set(o));
        if (this.route.snapshot.queryParamMap.get('mode') === 'print') window.setTimeout(() => window.print(), 300);
      },
      error: (e) => this.erro.set(getErrorMessage(e))
    });
  }
}
