import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoConfirmationService,
  GeoDatepickerComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  NotificationService
} from '@geo/ui';
import { EventoPneu, Pneu, VeiculoPneus, erroKmMovimentacao, formatarKm, rotuloPosicao } from '../../../core/models/frota-pneu.models';
import { formatarPlaca, paraInstanteIso } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaPneuService } from '../../../core/services/frota-pneu.service';
import { FrotaPneuDiagramaComponent, PosicaoDiagrama } from './frota-pneu-diagrama.component';

/**
 * Rodízio dos pneus de um veículo: o diagrama de antes, como está hoje, e o de depois, onde os
 * pneus são trocados de posição arrastando ou tocando. Soltar sobre uma posição ocupada troca os
 * dois. Só grava ao salvar, de uma vez, com o km do veículo.
 */
@Component({
  selector: 'app-frota-pneu-rodizio',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    FrotaPneuDiagramaComponent
  ],
  styles: `
    :host { display: block; }
    .topo { display: grid; grid-template-columns: minmax(14rem, 22rem) repeat(2, minmax(10rem, 14rem)) 1fr; gap: 0.75rem; align-items: start; }
    .ultimo { justify-self: end; padding-top: 1.35rem; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); text-align: right; }
    .ultimo strong { color: var(--geo-foreground); }
    .area { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) minmax(15rem, 20rem); gap: 1rem; margin-top: 1rem; align-items: start; }
    .painel { display: grid; gap: 0.75rem; padding: 1rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg); background: var(--geo-surface);
      box-shadow: var(--geo-shadow-sm); min-width: 0; }
    .painel__titulo { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: 0; font-size: var(--geo-font-body); font-weight: 600; }
    .painel__sub { margin: 0; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .seta { align-self: center; color: var(--geo-brand); font-size: 1.5rem; }
    .trocas { display: grid; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
    .trocas li { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem 0.65rem; border: 1px solid var(--geo-border); border-left: 3px solid var(--geo-brand);
      border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); font-size: var(--geo-font-caption); }
    .trocas strong { display: block; font-size: var(--geo-font-body); }
    .guia { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: 0; min-height: 2rem; font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .guia--ativa { padding: 0.35rem 0.35rem 0.35rem 0.7rem; border-radius: var(--geo-radius-md); background: var(--geo-brand-soft); color: var(--geo-foreground); font-weight: 600; }
    /* Telas estreitas empilham os painéis: a gravação fica sempre à mão enquanto há mudança. */
    .barra-salvar { display: none; }
    @media (max-width: 1200px) {
      .barra-salvar { position: sticky; bottom: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 1rem; padding: 0.6rem 0.75rem;
        border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg); background: var(--geo-surface); box-shadow: var(--geo-shadow-md); }
      .barra-salvar span { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    }
    .estado { margin-top: 1rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg); background: var(--geo-surface); box-shadow: var(--geo-shadow-sm); }
    .rodape { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    @media (max-width: 1300px) { .area { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); } .area__trocas { grid-column: 1 / -1; } }
    @media (max-width: 900px) {
      .topo { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .ultimo { grid-column: 1 / -1; justify-self: start; padding-top: 0; text-align: left; }
      .area { grid-template-columns: minmax(0, 1fr); } .seta { justify-self: center; transform: rotate(90deg); } .area__depois { order: -1; } .seta, .area__antes { order: 0; }
    }
    @media (max-width: 640px) { .topo { grid-template-columns: minmax(0, 1fr); } }
  `,
  template: `
    <div class="topo">
      <geo-select label="Veículo" [options]="veiculos()" [value]="idVeiculo()" (valueChange)="escolherVeiculo($event)" [filter]="true" placeholder="Escolha a placa" [loading]="carregandoVeiculos()"></geo-select>
      @if (veiculo()?.eixos) {
        <geo-number-input [label]="veiculo()!.unidade === 'HORAS' ? 'Horímetro' : 'Km do veículo'" [(value)]="km" [min]="0" [error]="erroKm() ? 'Menor que o último registrado.' : undefined"
          [description]="veiculo()!.kmAtual != null ? 'Último registrado: ' + formatarKm(veiculo()!.kmAtual, veiculo()!.unidade) : 'Sem leitura registrada'"></geo-number-input>
        <geo-datepicker label="Quando" [(value)]="quando" [showTime]="true" [maxDate]="agora" description="Vazio: agora."></geo-datepicker>
        <p class="ultimo">
          @if (ultimo(); as u) {
            Último rodízio em <strong>{{ u.ocorridoEm | date: 'dd/MM/yyyy' }}</strong>
            @if (kmDesdeUltimo() !== null) { <br>{{ formatarKm(kmDesdeUltimo(), veiculo()!.unidade) }} rodados desde então }
          } @else {
            Nenhum rodízio registrado neste veículo
          }
        </p>
      }
    </div>

    <p class="sr" aria-live="polite">{{ anuncio() }}</p>

    @if (!idVeiculo()) {
      <geo-async-state class="estado" state="empty" icon="pi-sync" title="Escolha um veículo" description="O rodízio mostra como os pneus estão e como vão ficar."></geo-async-state>
    } @else if (carregando() && !veiculo()) {
      <geo-async-state class="estado" state="loading" title="Carregando os pneus do veículo" description="Só um instante."></geo-async-state>
    } @else if (erro()) {
      <geo-async-state class="estado" state="error" title="Não foi possível carregar os pneus do veículo" [description]="erro()!"
        actionLabel="Tentar novamente" actionIcon="pi pi-refresh" (action)="carregar()"></geo-async-state>
    } @else if (veiculo(); as v) {
      @if (!v.eixos) {
        <geo-async-state class="estado" state="empty" icon="pi-sitemap" title="Este veículo ainda não tem diagrama"
          description="Defina os eixos na aba Montagem e monte os pneus antes do rodízio." actionLabel="Ir para a montagem" actionIcon="pi pi-sitemap" (action)="irParaMontagem.emit()"></geo-async-state>
      } @else if (!temPneus()) {
        <geo-async-state class="estado" state="empty" icon="pi-info-circle" title="Nenhum pneu montado neste veículo"
          description="Monte os pneus antes do rodízio." actionLabel="Ir para a montagem" actionIcon="pi pi-sitemap" (action)="irParaMontagem.emit()"></geo-async-state>
      } @else {
        <div class="area">
          <section class="painel area__antes" aria-label="Antes do rodízio">
            <h3 class="painel__titulo">Antes <geo-status tone="neutral">Como está hoje</geo-status></h3>
            <app-frota-pneu-diagrama [eixos]="v.eixos" [posicoes]="antes()" [sulcoMinimo]="v.sulcoMinimoMm" [interativo]="false" [legenda]="false" [titulo]="placa(v.placa) + ', antes'"></app-frota-pneu-diagrama>
          </section>
          <i class="pi pi-arrow-right seta" aria-hidden="true"></i>
          <section class="painel area__depois" aria-label="Depois do rodízio">
            <h3 class="painel__titulo">Depois <geo-status [tone]="trocas().length ? 'info' : 'neutral'">{{ trocas().length ? (trocas().length === 1 ? '1 pneu muda' : trocas().length + ' pneus mudam') : 'Arraste para trocar' }}</geo-status></h3>
            <app-frota-pneu-diagrama [eixos]="v.eixos" [posicoes]="depois()" [sulcoMinimo]="v.sulcoMinimoMm" [arrastavel]="podeEditar()" [interativo]="podeEditar()"
              [selecionado]="selecionado()" [destacarDestinos]="!!selecionado() || !!arrastando()" [titulo]="placa(v.placa) + ', depois'" (posicaoAcionada)="acionar($event)" (soltoNaPosicao)="soltar($event)"
              (arrasteIniciado)="arrastando.set($event)" (arrasteTerminado)="arrastando.set(null)"></app-frota-pneu-diagrama>
            <div class="guia" [class.guia--ativa]="!!selecionado()">
              <span>{{ guia() }}</span>
              @if (selecionado()) {
                <geo-button size="sm" variant="ghost" label="Cancelar" ariaLabel="Cancelar a escolha (Esc)" (pressed)="cancelarEscolha()"></geo-button>
              }
            </div>
          </section>
          <section class="painel area__trocas" aria-label="Trocas do rodízio">
            <h3 class="painel__titulo">Trocas <geo-status [tone]="trocas().length ? 'info' : 'neutral'">{{ trocas().length }}</geo-status></h3>
            @if (trocas().length) {
              <ul class="trocas">
                @for (t of trocas(); track t.pneu.id) {
                  <li>
                    <span><strong>{{ t.pneu.marcaFogo }}</strong>{{ rotulo(t.de) }} → {{ rotulo(t.para) }}</span>
                    <geo-button size="sm" variant="ghost" icon="pi pi-undo" [ariaLabel]="'Desfazer a troca do pneu ' + t.pneu.marcaFogo" (pressed)="desfazerTroca(t.pneu.id)"></geo-button>
                  </li>
                }
              </ul>
              @if (erroKm()) {
                <geo-callout tone="danger" icon="pi pi-exclamation-triangle" [dense]="true" title="Confira o km do veículo">{{ erroKm() }}</geo-callout>
              }
              <div class="rodape">
                <geo-button variant="ghost" icon="pi pi-undo" label="Desfazer tudo" (pressed)="desfazer()"></geo-button>
                <geo-button icon="pi pi-check" label="Salvar rodízio" [loading]="salvando()" [disabled]="!podeEditar() || !!erroKm()" (pressed)="salvar()"></geo-button>
              </div>
            } @else {
              <p class="painel__sub">Nenhuma troca ainda. As trocas aparecem aqui antes de gravar.</p>
            }
          </section>
        </div>
        @if (trocas().length) {
          <div class="barra-salvar">
            <span>{{ erroKm() ? 'Confira o km do veículo' : 'Trocas ainda não salvas' }}</span>
            <geo-button size="sm" icon="pi pi-check" label="Salvar rodízio" [disabled]="!podeEditar() || !!erroKm()" [loading]="salvando()" (pressed)="salvar()"></geo-button>
          </div>
        }
      }
    }
  `
})
export class FrotaPneuRodizioComponent {
  private readonly servico = inject(FrotaPneuService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);

  readonly veiculos = input<GeoSelectOption<string>[]>([]);
  readonly carregandoVeiculos = input(false);
  /** A outra aba (montagem) tem mudanças não salvas deste veículo. */
  readonly rascunhoEmOutraAba = input(false);
  readonly podeEditar = input(false);
  readonly idVeiculoInicial = input<string | null>(null);
  readonly alterado = output<void>();
  readonly veiculoTrocado = output<string | null>();
  readonly irParaMontagem = output<void>();

  protected readonly placa = formatarPlaca;
  protected readonly formatarKm = formatarKm;
  protected readonly rotulo = rotuloPosicao;
  protected readonly agora = new Date();

  protected readonly idVeiculo = signal<string | null>(null);
  protected readonly veiculo = signal<VeiculoPneus | null>(null);
  protected readonly ultimo = signal<EventoPneu | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly salvando = signal(false);
  protected readonly km = signal<number | null>(null);
  protected readonly quando = signal<Date | null>(null);
  protected readonly selecionado = signal<string | null>(null);
  protected readonly arrastando = signal<string | null>(null);
  protected readonly anuncio = signal('');
  /** Posição de destino de cada pneu que mudou. */
  private readonly novasPosicoes = signal<Map<string, string>>(new Map());

  private readonly pneus = computed(() => (this.veiculo()?.posicoes ?? []).flatMap((p) => (p.pneu ? [p.pneu] : [])));
  protected readonly temPneus = computed(() => this.pneus().length > 0);
  protected readonly antes = computed<PosicaoDiagrama[]>(() => (this.veiculo()?.posicoes ?? []).map((pos) => ({ ...pos, alterada: !!pos.pneu && this.novasPosicoes().has(pos.pneu.id) })));
  protected readonly depois = computed<PosicaoDiagrama[]>(() => {
    const porPosicao = new Map(this.pneus().map((p) => [this.posicaoDe(p), p]));
    return (this.veiculo()?.posicoes ?? []).map((pos) => {
      const pneu = porPosicao.get(pos.codigo) ?? null;
      return { ...pos, pneu, alterada: (pos.pneu?.id ?? null) !== (pneu?.id ?? null) };
    });
  });
  protected readonly trocas = computed(() => this.pneus()
    .filter((p) => this.posicaoDe(p) !== p.posicao)
    .map((p) => ({ pneu: p, de: p.posicao, para: this.posicaoDe(p) })));
  protected readonly erroKm = computed(() => {
    const v = this.veiculo();
    return v ? erroKmMovimentacao(this.km(), v.kmAtual, !!this.quando(), v.unidade) : undefined;
  });
  protected readonly guia = computed(() => {
    const id = this.selecionado();
    const p = id ? this.pneus().find((x) => x.id === id) : null;
    return p ? `Pneu ${p.marcaFogo} escolhido. Toque na posição para onde ele vai.` : 'Arraste um pneu sobre outro para trocar os dois de lugar, ou toque num e depois no outro.';
  });
  protected readonly kmDesdeUltimo = computed(() => {
    const atual = this.veiculo()?.kmAtual;
    const noRodizio = this.ultimo()?.kmVeiculo;
    return atual != null && noRodizio != null && atual >= noRodizio ? atual - noRodizio : null;
  });

  constructor() {
    effect(() => {
      const inicial = this.idVeiculoInicial();
      if (inicial !== untracked(this.idVeiculo)) untracked(() => this.trocarVeiculo(inicial));
    });
  }

  temAlteracoes(): boolean {
    return this.trocas().length > 0;
  }

  quantasAlteracoes(): number {
    return this.trocas().length;
  }

  @HostListener('document:keydown.escape')
  protected cancelarEscolha(): void {
    if (!this.selecionado()) return;
    this.selecionado.set(null);
    this.anuncio.set('Escolha cancelada.');
  }

  protected async escolherVeiculo(id: string | null): Promise<void> {
    if (id === this.idVeiculo()) return;
    if (this.trocas().length || this.rascunhoEmOutraAba()) {
      const ok = await this.confirmacao.confirm({
        title: 'Descartar alterações?',
        message: 'As mudanças deste veículo ainda não foram salvas. Trocar de veículo descarta essas mudanças.',
        confirmLabel: 'Descartar e trocar',
        cancelLabel: 'Continuar neste veículo',
        variant: 'destructive'
      });
      if (!ok) {
        // O seletor já mostra o veículo escolhido: devolve ao atual.
        const atual = this.idVeiculo();
        this.idVeiculo.set(id);
        setTimeout(() => this.idVeiculo.set(atual), 50);
        return;
      }
    }
    this.trocarVeiculo(id);
  }

  protected trocarVeiculo(id: string | null): void {
    if (id === this.idVeiculo()) return;
    this.idVeiculo.set(id);
    this.veiculo.set(null);
    this.ultimo.set(null);
    this.novasPosicoes.set(new Map());
    this.selecionado.set(null);
    this.veiculoTrocado.emit(id);
    this.carregar();
  }

  carregar(): void {
    const id = this.idVeiculo();
    if (!id) return;
    this.carregando.set(true);
    this.erro.set(null);
    this.servico.veiculo(id).subscribe({
      next: (v) => (this.veiculo.set(v), this.km.set(v.kmAtual ?? null), this.carregando.set(false)),
      error: (e) => (this.erro.set(getErrorMessage(e)), this.carregando.set(false))
    });
    this.carregarUltimo(id);
  }

  protected acionar(codigo: string): void {
    const sel = this.selecionado();
    const ocupante = this.depois().find((p) => p.codigo === codigo)?.pneu ?? null;
    if (!sel) {
      if (ocupante) {
        this.selecionado.set(ocupante.id);
        this.anuncio.set(`Pneu ${ocupante.marcaFogo} selecionado. Escolha a posição para onde ele vai.`);
      }
      return;
    }
    this.selecionado.set(null);
    if (ocupante?.id !== sel) this.mover(sel, codigo);
  }

  protected soltar(codigo: string): void {
    const id = this.arrastando();
    this.arrastando.set(null);
    if (id) this.mover(id, codigo);
  }

  /** Desfaz a troca do pneu e a de quem ocupou o lugar dele, para não sobrar dois na mesma posição. */
  protected desfazerTroca(id: string): void {
    const mapa = new Map(this.novasPosicoes());
    const fila = [id];
    while (fila.length) {
      const atual = fila.pop()!;
      mapa.delete(atual);
      const origem = this.pneus().find((p) => p.id === atual)?.posicao;
      for (const [outro, para] of mapa) {
        if (para === origem) fila.push(outro);
      }
    }
    this.novasPosicoes.set(mapa);
    this.selecionado.set(null);
    this.anuncio.set('Troca desfeita.');
  }

  protected desfazer(): void {
    this.novasPosicoes.set(new Map());
    this.selecionado.set(null);
    this.anuncio.set('Trocas desfeitas.');
  }

  protected salvar(): void {
    const v = this.veiculo();
    const trocas = this.trocas();
    if (!v || !trocas.length || this.erroKm()) return;
    this.salvando.set(true);
    this.servico.movimentar({
      idVeiculo: v.idVeiculo, km: this.km(), realizadaEm: this.quando() ? paraInstanteIso(this.quando()!) : null, observacao: null,
      destinos: trocas.map((t) => ({ idPneu: t.pneu.id, destino: 'POSICAO' as const, posicao: t.para }))
    }).subscribe({
      next: (atualizado) => {
        this.salvando.set(false);
        this.veiculo.set(atualizado);
        this.km.set(atualizado.kmAtual ?? null);
        this.quando.set(null);
        this.novasPosicoes.set(new Map());
        this.notificacoes.success(`Rodízio do ${formatarPlaca(v.placa)} salvo.`);
        this.anuncio.set('Rodízio salvo.');
        this.carregarUltimo(v.idVeiculo);
        this.alterado.emit();
      },
      error: (e) => (this.salvando.set(false), this.notificacoes.error(getErrorMessage(e)))
    });
  }

  /** Leva o pneu à posição; quem estava lá vai para o lugar de onde ele saiu. */
  private mover(id: string, destino: string): void {
    const pneu = this.pneus().find((p) => p.id === id);
    if (!pneu) return;
    const origem = this.posicaoDe(pneu);
    if (origem === destino) return;
    const ocupante = this.pneus().find((p) => p.id !== id && this.posicaoDe(p) === destino);
    const mapa = new Map(this.novasPosicoes());
    mapa.set(id, destino);
    if (ocupante) mapa.set(ocupante.id, origem);
    for (const p of this.pneus()) if (mapa.get(p.id) === p.posicao) mapa.delete(p.id);
    this.novasPosicoes.set(mapa);
    this.anuncio.set(`Pneu ${pneu.marcaFogo} em ${rotuloPosicao(destino)}${ocupante ? `; ${ocupante.marcaFogo} em ${rotuloPosicao(origem)}` : ''}.`);
  }

  private posicaoDe(p: Pneu): string {
    return this.novasPosicoes().get(p.id) ?? p.posicao!;
  }

  private carregarUltimo(id: string): void {
    this.servico.eventos({ idVeiculo: id, tipos: ['RODIZIO'] }, { size: 1, sort: ['ocorridoEm,desc'] }).subscribe({
      next: (p) => this.ultimo.set(p.content[0] ?? null),
      error: () => this.ultimo.set(null)
    });
  }
}
