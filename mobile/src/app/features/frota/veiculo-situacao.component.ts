import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { formatarPlaca } from '../../core/frota/checklist-veiculo.models';
import { ChecklistVeiculoService } from '../../core/frota/checklist-veiculo.service';
import { MeuVeiculoService } from '../../core/frota/meu-veiculo';
import {
  OrdemVeiculo, PendenciaVeiculo, PreventivaVeiculo, SituacaoVeiculo, Tom, formatarMedicao, organizarFicha, quando,
  resumoDocumentos, resumoVeiculo, situacaoOrdem, situacaoPendencia, situacaoPreventiva
} from '../../core/frota/situacao-veiculo.models';
import { SituacaoVeiculoService } from '../../core/frota/situacao-veiculo.service';
import { DocumentosVeiculoService } from '../../core/frota/documentos-veiculo.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { BarraTopoComponent, IconeComponent, IndicadorRedeComponent, OpcaoSeletor, SeletorComponent, VazioComponent } from '../../ui';

type Carga = 'ocioso' | 'carregando' | 'pronto' | 'sem-sinal' | 'erro';

/**
 * Ficha do veículo para quem dirige, na ordem em que a pessoa decide: se pode sair com ele, o que
 * está em manutenção (com os problemas e a revisão que cada OS já resolve), o que ainda espera o
 * gestor, os documentos e o histórico. Só consulta: quem decide e agenda é o gestor, na web. A
 * última ficha vista fica no aparelho para quando faltar sinal.
 */
@Component({
  selector: 'app-veiculo-situacao',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, IndicadorRedeComponent, SeletorComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ces-barra-topo titulo="Ficha do veículo" [subtitulo]="subtitulo()" (voltar)="voltar()">
      <button type="button" class="ces-btn-icone" [disabled]="carga() === 'carregando' || !idVeiculo()" (click)="carregar()" aria-label="Atualizar">
        <ces-icone nome="atualizar" />
      </button>
      <ces-indicador-rede />
    </ces-barra-topo>

    <div class="escolha">
      <ces-seletor rotulo="Veículo" placeholder="Escolher a placa" [opcoes]="opcoesVeiculo()" [valor]="idVeiculo()" (valorChange)="escolher($event)" />
    </div>

    @if (!idVeiculo()) {
      <ces-vazio icone="caminhao" titulo="Escolha um veículo" texto="Veja se ele pode rodar, o que está em manutenção e os documentos." />
    } @else if (carga() === 'carregando') {
      <div class="ces-esqueletos" aria-busy="true" aria-label="Carregando">
        <div class="ces-esqueleto" style="height: 64px"></div><div class="ces-esqueleto" style="height: 140px"></div><div class="ces-esqueleto" style="height: 120px"></div>
      </div>
    } @else if (dados(); as d) {
      @if (vistaEm(); as em) {
        <p class="aviso"><ces-icone nome="sem_rede" [tamanho]="16" />Sem internet: ficha como estava {{ quando(em) }}.</p>
      }

      @let r = resumo();
      <section class="ces-faixa-estado" [class.ces-faixa-estado--atencao]="r.tom === 'atencao'" [class.ces-faixa-estado--erro]="r.tom === 'erro'" aria-live="polite">
        <span [class]="'ces-etiqueta ces-etiqueta--' + etiqueta(r.tom)">{{ r.rotulo }}</span>
        <p>{{ r.apoio }}</p>
      </section>

      <dl class="ces-dados">
        @if (d.modelo) { <div><dt>Modelo</dt><dd>{{ d.modelo }}</dd></div> }
        @if (d.baseOperacional) { <div><dt>Base</dt><dd>{{ d.baseOperacional }}</dd></div> }
        <div><dt>Condutor</dt><dd>{{ d.condutorAtual ?? 'Ninguém vinculado agora' }}</dd></div>
        @if (d.medicaoAtual != null) {
          <div><dt>{{ d.unidadeMedicao === 'HORAS' ? 'Horímetro' : 'Odômetro' }}</dt>
            <dd class="ces-num">{{ medicao(d) }}@if (d.medicaoAtualEm) {<span class="dd-apoio"> · {{ quando(d.medicaoAtualEm) }}</span>}</dd></div>
        }
      </dl>

      @let f = ficha();
      @if (f.ordens.length) {
        <h2 class="ces-secao"><span>Em manutenção</span><span class="ces-num">{{ f.ordens.length }}</span></h2>
        <ul class="ces-grupo">
          @for (item of f.ordens; track item.ordem.id) {
            @let o = item.ordem;
            @let s = estadoOrdem(o);
            <li class="ces-linha">
              <span [class]="'ces-selo ces-selo--' + s.tom"><ces-icone [nome]="o.veiculoParado ? 'alerta' : 'relogio'" /></span>
              <span class="ces-linha__texto">
                <span class="linha__topo"><span class="ces-linha__titulo">{{ o.tipoManutencao === 'PREVENTIVA' ? 'Preventiva' : 'Corretiva' }} · OS {{ o.numero }}</span>
                  <span [class]="'ces-etiqueta ces-etiqueta--' + etiqueta(s.tom)">{{ s.rotulo }}</span></span>
                @if (o.descricao) { <span class="ces-linha__resumo">{{ o.descricao }}</span> }
                @if (s.apoio) { <span class="ces-linha__apoio">{{ s.apoio }}</span> }
                @if (item.revisoes.length) { <span class="inclui"><ces-icone nome="relogio" [tamanho]="14" />{{ nomes(item.revisoes) }}</span> }
                @if (item.problemas.length) { <span class="inclui"><ces-icone nome="alerta" [tamanho]="14" />{{ nomes(item.problemas) }}</span> }
                @if (o.veiculoParado) { <span class="parado">Veículo parado para esta manutenção</span> }
              </span>
            </li>
          }
        </ul>
      }

      @if (f.problemas.length) {
        <h2 class="ces-secao"><span>Problemas apontados</span><span class="ces-num">{{ f.problemas.length }}</span></h2>
        <ul class="ces-grupo">
          @for (p of f.problemas; track p.id) {
            @let s = estadoPendencia(p);
            <li class="ces-linha">
              <span [class]="'ces-selo ces-selo--' + s.tom"><ces-icone nome="alerta" /></span>
              <span class="ces-linha__texto">
                <span class="ces-linha__titulo">{{ p.item }}</span>
                <span class="ces-linha__apoio">No checklist de {{ quando(p.desde) }}</span>
              </span>
              <span [class]="'ces-etiqueta ces-etiqueta--' + etiqueta(s.tom)">{{ s.rotulo }}</span>
            </li>
          }
        </ul>
      }

      @if (f.revisoes.length) {
        <h2 class="ces-secao"><span>Revisões</span><span class="ces-num">{{ f.revisoes.length }}</span></h2>
        <ul class="ces-grupo">
          @for (p of f.revisoes; track p.plano) {
            @let s = estadoPreventiva(p);
            <li class="ces-linha">
              <span [class]="'ces-selo ces-selo--' + s.tom"><ces-icone [nome]="p.situacao === 'VENCIDA' && !p.numeroOrdem ? 'alerta' : 'relogio'" /></span>
              <span class="ces-linha__texto">
                <span class="ces-linha__titulo">{{ p.plano }}</span>
                <span class="ces-linha__apoio">{{ primeiraMaiuscula(p.falta) }}{{ p.previsao && p.situacao !== 'VENCIDA' ? ' · previsão ' + data(p.previsao) : '' }}</span>
              </span>
              <span [class]="'ces-etiqueta ces-etiqueta--' + etiqueta(s.tom)">{{ s.rotulo }}</span>
            </li>
          }
        </ul>
      }

      <h2 class="ces-secao">Consultar</h2>
      <ul class="ces-grupo">
        @let doc = documentosResumo();
        <li><button type="button" class="ces-linha ces-linha--acao" (click)="verDocumentos()">
          <span [class]="'ces-selo ces-selo--' + doc.tom"><ces-icone nome="documento" /></span>
          <span class="ces-linha__texto"><span class="ces-linha__titulo">Documentos</span>
            <span class="ces-linha__apoio">{{ doc.texto }}</span></span>
          <ces-icone nome="avancar" [tamanho]="18" /></button></li>
        <li><button type="button" class="ces-linha ces-linha--acao" (click)="verChecklists()">
          <span class="ces-selo"><ces-icone nome="lista" /></span>
          <span class="ces-linha__texto"><span class="ces-linha__titulo">Checklists</span>
            <span class="ces-linha__apoio">Como ele foi entregue em cada uso</span></span>
          <ces-icone nome="avancar" [tamanho]="18" /></button></li>
      </ul>

      @if (d.ultimasConcluidas.length || d.ultimasLavagens?.length) {
        <h2 class="ces-secao">Histórico</h2>
        <ul class="ces-grupo">
          @for (o of d.ultimasConcluidas; track o.id) {
            <li class="ces-linha">
              <span class="ces-selo ces-selo--ok"><ces-icone nome="servicos" /></span>
              <span class="ces-linha__texto">
                <span class="ces-linha__titulo">{{ o.tipoManutencao === 'PREVENTIVA' ? 'Preventiva' : 'Corretiva' }} · OS {{ o.numero }}</span>
                @if (o.descricao) { <span class="ces-linha__resumo">{{ o.descricao }}</span> }
                <span class="ces-linha__apoio">Concluída {{ estadoOrdem(o).apoio }}</span>
              </span>
            </li>
          }
          @for (l of d.ultimasLavagens ?? []; track $index) {
            <li class="ces-linha">
              <span class="ces-selo"><ces-icone nome="check" /></span>
              <span class="ces-linha__texto">
                <span class="ces-linha__titulo">Lavagem{{ l.subtipo ? ' ' + l.subtipo.toLowerCase() : '' }}</span>
                <span class="ces-linha__apoio">{{ data(l.data) }}</span>
              </span>
            </li>
          }
        </ul>
      }
    } @else if (carga() === 'sem-sinal') {
      <ces-vazio icone="nuvem" titulo="Precisa de internet" texto="Esta ficha ainda não foi aberta neste aparelho. Os documentos salvos abrem sem sinal.">
        <button type="button" class="ces-btn ces-btn--tonal" (click)="verDocumentos()">Ver documentos</button>
      </ces-vazio>
    } @else if (carga() === 'erro') {
      <ces-vazio icone="alerta" titulo="Não foi possível buscar o veículo" texto="Confira a internet e tente de novo.">
        <button type="button" class="ces-btn ces-btn--tonal" (click)="carregar()">Tentar de novo</button>
      </ces-vazio>
    }
    <div class="ces-respiro"></div>
  `,
  styles: [`
    :host { display: block; }
    .escolha { padding: var(--ces-e2) var(--ces-e3) 0; }
    .linha__topo { display: flex; align-items: center; gap: var(--ces-e2); flex-wrap: wrap; }
    .parado { font: var(--ces-t-apoio); font-weight: 600; color: var(--ces-erro); }
    .inclui { display: flex; align-items: center; gap: 6px; font: var(--ces-t-apoio); color: var(--ces-texto); overflow-wrap: anywhere; }
    .inclui ces-icone { flex: none; color: var(--ces-texto-2); }
    .dd-apoio { font: var(--ces-t-apoio); color: var(--ces-texto-2); }
    .aviso { display: flex; align-items: center; gap: var(--ces-e2); margin: var(--ces-e2) var(--ces-e3) 0; padding: var(--ces-e3) var(--ces-e4);
      border-radius: var(--ces-r-grupo); background: var(--ces-atencao-suave); font: var(--ces-t-apoio); font-size: .875rem; color: var(--ces-texto); }
  `],
})
export class VeiculoSituacaoComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly servico = inject(SituacaoVeiculoService);
  private readonly checklists = inject(ChecklistVeiculoService);
  private readonly rede = inject(ConnectivityService);
  private readonly meuVeiculo = inject(MeuVeiculoService);
  private readonly documentos = inject(DocumentosVeiculoService);

  protected readonly idVeiculo = signal<string | null>(this.rota.snapshot.queryParamMap.get('veiculo'));
  protected readonly carga = signal<Carga>('ocioso');
  protected readonly dados = signal<SituacaoVeiculo | null>(null);
  /** Preenchido quando a ficha na tela é a guardada no aparelho (sem sinal). */
  protected readonly vistaEm = signal<string | null>(null);
  protected readonly resumo = computed(() => { const d = this.dados(); return d ? resumoVeiculo(d) : { rotulo: '', tom: 'neutro' as Tom, apoio: '' }; });
  protected readonly ficha = computed(() => {
    const d = this.dados();
    return d ? organizarFicha(d) : { ordens: [], problemas: [], revisoes: [] };
  });
  protected readonly documentosResumo = computed(() => {
    const d = this.dados();
    // Resposta antiga não traz o conjunto: usa os documentos com vencimento do veículo.
    return resumoDocumentos(d?.documentosDoConjunto ?? (d?.documentos ?? []).map((x, i) => ({ ...x, id: String(i) })));
  });
  protected readonly subtitulo = computed(() => this.dados() ? formatarPlaca(this.dados()!.placa) : 'Manutenção e documentos');

  protected readonly opcoesVeiculo = computed<OpcaoSeletor[]>(() =>
    (this.checklists.catalogo()?.veiculos ?? []).map((v) => ({
      valor: v.idVeiculo,
      rotulo: formatarPlaca(v.placa),
      apoio: [v.descricao, v.baseNome].filter(Boolean).join(' · ') || null
    })));

  protected readonly quando = quando;

  async ngOnInit(): Promise<void> {
    if (!this.idVeiculo()) {
      // Mesmo veículo que já vem marcado no checklist e no abastecimento.
      const catalogo = this.checklists.catalogo() ?? await this.checklists.carregarCatalogoLocal();
      const id = await this.meuVeiculo.sugerido(catalogo?.veiculos ?? []);
      if (id) this.escolher(id);
      return;
    }
    this.carregar();
  }

  protected escolher(id: string | null): void {
    this.idVeiculo.set(id);
    this.dados.set(null);
    this.vistaEm.set(null);
    void this.router.navigate([], { relativeTo: this.rota, queryParams: { veiculo: id }, replaceUrl: true });
    this.carregar();
  }

  protected carregar(): void {
    const id = this.idVeiculo();
    if (!id) return;
    if (!this.rede.isOnline()) {
      void this.mostrarGuardada(id, 'sem-sinal');
      return;
    }
    if (!this.dados()) this.carga.set('carregando');
    this.servico.situacao(id).then(
      (d) => {
        if (this.idVeiculo() !== id) return;
        this.dados.set(d);
        this.vistaEm.set(null);
        this.carga.set('pronto');
        // A lista e os arquivos dos documentos ficam no aparelho para a fiscalização sem sinal.
        void this.documentos.guardar(id, d.documentosDoConjunto ?? []).catch(() => undefined);
      },
      () => { if (this.idVeiculo() === id) void this.mostrarGuardada(id, 'erro'); }
    );
  }

  /** Sem resposta do servidor: mostra a última ficha vista neste aparelho, avisando de quando é. */
  private async mostrarGuardada(id: string, motivo: 'sem-sinal' | 'erro'): Promise<void> {
    const guardada = await this.servico.ultimaVista(id).catch(() => null);
    if (this.idVeiculo() !== id) return;
    if (guardada) {
      this.dados.set(guardada.ficha);
      this.vistaEm.set(guardada.vistaEm);
      this.carga.set('pronto');
      return;
    }
    this.dados.set(null);
    this.carga.set(motivo);
  }

  protected estadoOrdem(o: OrdemVeiculo) { return situacaoOrdem(o); }
  protected estadoPendencia(p: PendenciaVeiculo) { return situacaoPendencia(p); }
  protected estadoPreventiva(p: PreventivaVeiculo) { return situacaoPreventiva(p); }

  protected nomes(itens: (PendenciaVeiculo | PreventivaVeiculo)[]): string {
    return itens.map((i) => ('item' in i ? i.item : i.plano)).join(' · ');
  }

  protected primeiraMaiuscula(texto: string): string {
    return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
  }

  protected etiqueta(tom: Tom): string {
    return tom === 'neutro' ? 'neutra' : tom;
  }

  protected medicao(d: SituacaoVeiculo): string {
    return formatarMedicao(d.medicaoAtual, d.unidadeMedicao);
  }

  protected data(iso: string): string {
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
  }

  protected verDocumentos(): void {
    void this.router.navigate(['/frota/documentos'], { queryParams: { veiculo: this.idVeiculo(), de: 'ficha' } });
  }

  protected verChecklists(): void {
    void this.router.navigate(['/checklist'], { queryParams: { ver: 'veiculo', veiculo: this.idVeiculo() } });
  }

  protected voltar(): void {
    void this.router.navigateByUrl('/frota');
  }
}
