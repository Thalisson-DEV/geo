import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { numeroBr } from '../../../core/almox/balcao.logic';
import { AtendimentoResumo, EquipeNoBalcao, PainelBalcao } from '../../../core/almox/balcao.models';
import { BalcaoService } from '../../../core/almox/balcao.service';
import { ConnectivityService } from '../../../core/sync/connectivity.service';
import { ApiError } from '../../../core/http/error.interceptor';
import {
  AbasSecaoComponent, ChipsComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, OpcaoChip, TituloGrandeComponent, VazioComponent,
} from '../../../ui';
import { abasAlmox } from '../almox-abas';
import { textoCaminhao } from '../equipes/estoque-equipes.logic';

type Filtro = 'pendentes' | 'retirar' | 'devolver' | 'todas' | 'atendidos';

const CHAVE_ALMOX = 'geo_balcao_almoxarifado';
const FILTROS: Filtro[] = ['pendentes', 'retirar', 'devolver', 'todas', 'atendidos'];

function pendente(e: EquipeNoBalcao): boolean {
  return e.itensRetirada > 0 || e.itensNoCaminhao > 0 || e.negativosNoCaminhao > 0;
}

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function filtroInicial(valor: string | null): Filtro {
  return FILTROS.includes(valor as Filtro) ? valor as Filtro : 'pendentes';
}

/**
 * Balcão no tablet do almoxarifado: o quadro do dia, uma linha por equipe com os dois momentos (retirada de manhã,
 * devolução no fim do dia). Tocar em "Retirada" ou "Devolução" abre o atendimento já preenchido pelo sistema.
 * Precisa de internet: o saldo e as reservas são os de agora, no servidor.
 */
@Component({
  selector: 'app-balcao-almox',
  standalone: true,
  imports: [AbasSecaoComponent, ChipsComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, TituloGrandeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-titulo-grande titulo="Almoxarifado" [subtitulo]="subtitulo()">
      <geo-indicador-rede />
      <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="carregar()" aria-label="Atualizar o quadro">
        <geo-icone nome="atualizar" [tamanho]="18" />
      </button>
    </geo-titulo-grande>
    @if (abas().length > 1) { <geo-abas-secao rotulo="Almoxarifado" [abas]="abas()" /> }

    @if (!rede.isOnline()) {
      <geo-vazio icone="sem_rede" titulo="O balcão precisa de internet" texto="Retirada e devolução mexem no saldo de agora, no servidor. Conecte e o quadro aparece aqui." />
    } @else if (erro()) {
      <geo-vazio icone="alerta" titulo="Não foi possível abrir o balcão" [texto]="erro()">
        <button type="button" class="geo-btn geo-btn--principal" (click)="carregar()">Tentar de novo</button>
      </geo-vazio>
    } @else if (!painel()) {
      <div class="geo-esqueletos" aria-busy="true" aria-label="Montando o quadro">
        @for (i of [1, 2, 3]; track i) { <div class="geo-esqueleto" style="height: 72px"></div> }
      </div>
    } @else {
      <section class="panorama" aria-label="Resumo do dia">
        <p><strong class="geo-num">{{ contagem().devolver }}</strong> para devolver · <strong class="geo-num">{{ contagem().retirar }}</strong> para retirar · <strong class="geo-num">{{ contagem().feitos }}</strong> {{ contagem().feitos === 1 ? 'atendimento hoje' : 'atendimentos hoje' }}</p>
        @if (alerta(); as a) { <p class="panorama__alerta"><geo-icone nome="alerta" [tamanho]="16" />{{ a }}</p> }
      </section>

      <div class="barra">
        @if (almoxarifados().length > 1) {
          <button type="button" class="almox" (click)="escolhendoAlmox.set(true)" [attr.aria-label]="'Almoxarifado: ' + painel()!.almoxarifado + '. Trocar'">
            <geo-icone nome="almox" [tamanho]="18" /><span>{{ painel()!.almoxarifado }}</span><geo-icone nome="avancar" [tamanho]="16" />
          </button>
        }
        <div class="busca"><geo-icone nome="busca" [tamanho]="18" />
          <input type="search" placeholder="Equipe ou encarregado" enterkeyhint="search" aria-label="Buscar equipe"
            [value]="busca()" (input)="busca.set($any($event.target).value)"></div>
      </div>
      <geo-chips rotulo="Mostrar" [opcoes]="filtros" [contagem]="contagemChips()" [valor]="filtro()" (valorChange)="filtro.set($any($event))" />

      @if (filtro() === 'atendidos') {
        @if (atendidos().length) {
          <ul class="geo-grupo quadro" aria-label="Atendimentos de hoje">
            @for (a of atendidos(); track a.id) {
              <li><button type="button" class="geo-linha geo-linha--acao" (click)="comprovante.set(a)">
                <span class="geo-selo" [class.geo-selo--destaque]="a.tipo === 'RETIRADA'" [class.geo-selo--ok]="a.tipo === 'DEVOLUCAO'">
                  <geo-icone [nome]="a.tipo === 'RETIRADA' ? 'saida' : 'entrada'" /></span>
                <span class="geo-linha__texto">
                  <span class="geo-linha__titulo"><span class="geo-num">{{ hora(a.realizadoEm) }}</span> · {{ a.tipo === 'RETIRADA' ? 'Retirada' : 'Devolução' }} · <span class="geo-num">{{ a.equipe }}</span></span>
                  <span class="geo-linha__apoio">{{ a.nomeColaborador ?? 'Sem nome' }}{{ a.matricula ? ' · matrícula ' + a.matricula : '' }}</span>
                  <span class="geo-linha__apoio">{{ a.itens.length }} {{ a.itens.length === 1 ? 'item' : 'itens' }}{{ a.assinaturaFisica ? ' · termo em papel' : a.temAssinatura ? ' · assinado' : '' }}{{ a.temFoto ? ' · com foto' : '' }}</span>
                </span>
                <geo-icone nome="avancar" [tamanho]="18" />
              </button></li>
            }
          </ul>
        } @else {
          <geo-vazio icone="relogio" titulo="Nenhum atendimento hoje" texto="As retiradas e devoluções registradas aparecem aqui, com quem retirou e o que levou." />
        }
      } @else if (linhas().length) {
        <ul class="geo-grupo quadro">
          @for (e of linhas(); track e.idEquipe) {
            <li class="geo-linha linha">
              <span class="geo-selo" [class.geo-selo--atencao]="e.retiradaAtrasada" [class.geo-selo--erro]="e.negativosNoCaminhao"><geo-icone nome="caminhao" /></span>
              <span class="geo-linha__texto">
                <span class="geo-linha__titulo geo-num">{{ e.codigo }}
                  @if (e.retiradaAtrasada) { <span class="geo-etiqueta geo-etiqueta--atencao">Atrasada</span> }
                  @if (e.negativosNoCaminhao) { <span class="geo-etiqueta geo-etiqueta--erro">{{ e.negativosNoCaminhao }} negativo{{ e.negativosNoCaminhao > 1 ? 's' : '' }}</span> }
                </span>
                <span class="geo-linha__apoio">{{ e.encarregado ?? 'Sem encarregado' }}</span>
                <span class="geo-linha__apoio">{{ textoEquipe(e) }}</span>
              </span>
              <span class="acoes">
                <button type="button" class="geo-btn geo-btn--compacto" [class.geo-btn--principal]="e.itensRetirada > 0" [class.geo-btn--neutro]="!e.itensRetirada"
                  [disabled]="!e.itensRetirada" (click)="abrir(e, 'retirada')" [attr.aria-label]="'Retirada de ' + e.codigo">
                  <geo-icone nome="saida" [tamanho]="18" />Retirada</button>
                <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" [disabled]="!e.itensNoCaminhao && !e.negativosNoCaminhao"
                  (click)="abrir(e, 'devolucao')" [attr.aria-label]="'Devolução de ' + e.codigo">
                  <geo-icone nome="entrada" [tamanho]="18" />Devolução</button>
              </span>
            </li>
          }
        </ul>
      } @else {
        <geo-vazio icone="check" [titulo]="filtro() === 'todas' ? 'Nenhuma equipe neste almoxarifado' : 'Nada pendente no balcão'"
          [texto]="filtro() === 'todas' ? 'As equipes aparecem quando a programação pede material daqui.' : 'Toque em Todas para ver as equipes já atendidas.'" />
      }
    }

    <geo-folha [aberta]="escolhendoAlmox()" (fechar)="escolhendoAlmox.set(false)" titulo="Almoxarifado">
      <ul class="geo-grupo opcoes-almox" role="radiogroup" aria-label="Almoxarifado">
        @for (a of almoxarifados(); track a.valor) {
          <li><button type="button" class="geo-linha geo-linha--acao" role="radio" [attr.aria-checked]="a.valor === painel()?.idAlmoxarifado" (click)="trocarAlmox(a.valor)">
            <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ a.rotulo }}</span></span>
            @if (a.valor === painel()?.idAlmoxarifado) { <geo-icone nome="check" [tamanho]="18" /> }
          </button></li>
        }
      </ul>
    </geo-folha>

    <geo-folha [aberta]="!!comprovante()" (fechar)="comprovante.set(null)"
      [titulo]="comprovante() ? (comprovante()!.tipo === 'RETIRADA' ? 'Retirada' : 'Devolução') + ' · ' + comprovante()!.equipe : null"
      [descricao]="comprovante() ? 'Hoje às ' + hora(comprovante()!.realizadoEm) + (comprovante()!.operador ? ' · atendido por ' + comprovante()!.operador : '') : null">
      @if (comprovante(); as a) {
        <dl class="quem">
          <div><dt>{{ a.tipo === 'RETIRADA' ? 'Quem retirou' : 'Quem devolveu' }}</dt><dd>{{ a.nomeColaborador ?? 'Sem nome' }}</dd></div>
          <div><dt>Matrícula</dt><dd class="geo-num">{{ a.matricula ?? 'Sem matrícula no cadastro' }}</dd></div>
          <div><dt>Assinatura</dt><dd>{{ a.assinaturaFisica ? 'No termo em papel' : a.temAssinatura ? 'Assinado no aparelho' : 'Sem assinatura' }}{{ a.temFoto ? ' · com foto' : '' }}</dd></div>
        </dl>
        <ul class="itens">
          @for (i of a.itens; track $index) {
            <li><span class="itens__desc">{{ i.descricao }}
              <small class="geo-num">{{ i.codigo }}{{ i.numeroObra ? ' · obra ' + i.numeroObra : '' }}{{ i.condicao === 'SUCATA' ? ' · sucata' : '' }}{{ i.destino === 'DESCARTAR' ? ' · descarte' : '' }}{{ i.numeroSerie ? ' · série ' + i.numeroSerie : '' }}</small></span>
              <span class="geo-num itens__qtd">{{ num(i.quantidade) }} {{ i.unidade ?? '' }}</span></li>
          }
        </ul>
        @if (a.observacao) { <p class="obs">{{ a.observacao }}</p> }
      }
    </geo-folha>
  `,
  styles: [`
    .quem { display: grid; gap: var(--geo-e2); margin: 0 0 var(--geo-e4); }
    .quem div { display: flex; justify-content: space-between; gap: var(--geo-e3); }
    .quem dt { color: var(--geo-texto-2); }
    .quem dd { margin: 0; text-align: end; font-weight: 600; }
    .itens { display: grid; margin: 0; padding: 0; list-style: none; border-radius: var(--geo-r-grupo); background: var(--geo-superficie); }
    .itens li { display: flex; align-items: center; justify-content: space-between; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-e4); }
    .itens li + li { border-top: 1px solid var(--geo-linha); }
    .itens__desc { display: grid; gap: 2px; min-width: 0; }
    .itens__desc small { color: var(--geo-texto-2); font: var(--geo-t-apoio); }
    .itens__qtd { flex: none; font-weight: 600; }
    .obs { margin: var(--geo-e3) 0 0; color: var(--geo-texto-2); }
    /* O corpo da folha não tem recuo: o conteúdo alinha com o título dela. */
    .quem, .itens, .obs { margin-inline: var(--geo-margem); }
    .itens { margin-bottom: var(--geo-e4); }
    :host { display: flex; flex-direction: column; min-height: 100%; }
    /* Mesmo topo do estoque das equipes: uma linha de resumo, almoxarifado + busca, chips com contagem. */
    .panorama { display: grid; gap: var(--geo-e1); margin: var(--geo-e3) var(--geo-margem) 0; }
    .panorama p { margin: 0; color: var(--geo-texto-2); font: var(--geo-t-corpo); }
    .panorama strong { color: var(--geo-texto); font-weight: 600; }
    .panorama .panorama__alerta { display: flex; align-items: center; gap: var(--geo-e2); color: var(--geo-erro); }
    .barra { display: flex; flex-wrap: wrap; align-items: center; gap: var(--geo-e3); margin: var(--geo-e4) var(--geo-margem) 0; }
    .almox { display: inline-flex; flex: 0 1 auto; align-items: center; gap: var(--geo-e2); min-height: 48px; max-width: 100%; padding: 0 var(--geo-e4);
      border: 1px solid var(--geo-borda-campo); border-radius: var(--geo-r-pilula); background: var(--geo-superficie); color: var(--geo-texto);
      font: 600 .9375rem/1.2 var(--geo-fonte); cursor: pointer; touch-action: manipulation; }
    .almox span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .almox geo-icone { flex: none; color: var(--geo-texto-2); }
    .busca { flex: 1 1 14rem; display: flex; align-items: center; gap: var(--geo-e2); padding: 0 var(--geo-e4); min-height: 48px; border-radius: var(--geo-r-pilula);
      background: var(--geo-superficie); color: var(--geo-texto-2); }
    .busca input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--geo-texto); font: var(--geo-t-corpo); font-size: 1rem; }
    .busca input:focus { outline: none; }
    .opcoes-almox { margin: 0 var(--geo-margem) var(--geo-e4); }
    .quadro { margin-top: var(--geo-e3); }
    .linha { align-items: center; }
    .geo-linha__titulo { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .acoes { display: flex; flex: none; gap: var(--geo-e2); }
    @media (max-width: 520px) {
      .linha { flex-wrap: wrap; }
      .acoes { width: 100%; }
      .acoes .geo-btn { flex: 1; }
    }
  `],
})
export class BalcaoAlmoxComponent {
  private readonly service = inject(BalcaoService);
  private readonly router = inject(Router);
  protected readonly rede = inject(ConnectivityService);
  protected readonly abas = abasAlmox();

  protected readonly painel = signal<PainelBalcao | null>(null);
  protected readonly erro = signal<string | null>(null);
  private readonly route = inject(ActivatedRoute);
  // O Hoje abre o quadro já no recorte tocado (?filtro=retirar|devolver|atendidos).
  protected readonly filtro = signal<Filtro>(filtroInicial(this.route.snapshot.queryParamMap.get('filtro')));

  protected readonly almoxarifados = computed(() => (this.painel()?.almoxarifados ?? []).map(a => ({ valor: a.id, rotulo: a.nome })));
  protected readonly subtitulo = computed(() => this.painel()?.almoxarifado ? `Balcão · ${this.painel()!.almoxarifado}` : 'Balcão');
  protected readonly contagem = computed(() => {
    const eq = this.painel()?.equipes ?? [];
    return {
      retirar: eq.filter(e => e.itensRetirada > 0).length,
      devolver: eq.filter(e => e.itensNoCaminhao > 0 || e.negativosNoCaminhao > 0).length,
      feitos: this.painel()?.atendimentosHoje.length ?? 0,
    };
  });
  protected readonly filtros: OpcaoChip[] = [
    { valor: 'pendentes', rotulo: 'Pendentes' },
    { valor: 'retirar', rotulo: 'Retirar' },
    { valor: 'devolver', rotulo: 'Devolver' },
    { valor: 'atendidos', rotulo: 'Atendidos' },
    { valor: 'todas', rotulo: 'Todas' },
  ];
  protected readonly contagemChips = computed(() => ({
    pendentes: (this.painel()?.equipes ?? []).filter(e => pendente(e)).length,
    retirar: this.contagem().retirar,
    devolver: this.contagem().devolver,
    atendidos: this.contagem().feitos,
  }));
  protected readonly busca = signal('');
  protected readonly escolhendoAlmox = signal(false);
  protected readonly alerta = computed(() => {
    const eq = this.painel()?.equipes ?? [];
    const atrasadas = eq.filter(e => e.retiradaAtrasada).length;
    const negativos = eq.filter(e => e.negativosNoCaminhao > 0).length;
    const partes: string[] = [];
    if (atrasadas) partes.push(`${atrasadas} ${atrasadas === 1 ? 'retirada atrasada' : 'retiradas atrasadas'}`);
    if (negativos) partes.push(`${negativos} ${negativos === 1 ? 'equipe com saldo negativo' : 'equipes com saldo negativo'}`);
    return partes.length ? partes.join(' · ') : null;
  });
  protected readonly atendidos = computed(() => {
    const q = normalizar(this.busca().trim());
    return [...(this.painel()?.atendimentosHoje ?? [])]
      .filter(a => !q || normalizar(`${a.equipe ?? ''} ${a.nomeColaborador ?? ''} ${a.matricula ?? ''}`).includes(q))
      .sort((a, b) => b.realizadoEm.localeCompare(a.realizadoEm));
  });
  protected readonly comprovante = signal<AtendimentoResumo | null>(null);
  protected readonly linhas = computed(() => {
    const q = normalizar(this.busca().trim());
    const eq = [...(this.painel()?.equipes ?? [])].filter(e => !q || normalizar(`${e.codigo} ${e.encarregado ?? ''}`).includes(q)).sort((a, b) =>
      Number(b.retiradaAtrasada) - Number(a.retiradaAtrasada) || b.itensRetirada - a.itensRetirada || a.codigo.localeCompare(b.codigo));
    switch (this.filtro()) {
      case 'retirar': return eq.filter(e => e.itensRetirada > 0);
      case 'devolver': return eq.filter(e => e.itensNoCaminhao > 0 || e.negativosNoCaminhao > 0);
      case 'pendentes': return eq.filter(e => pendente(e));
      default: return eq;
    }
  });

  constructor() {
    this.carregar();
  }

  protected carregar(id: string | null = this.painel()?.idAlmoxarifado ?? localStorage.getItem(CHAVE_ALMOX)): void {
    this.erro.set(null);
    this.service.painel(id).subscribe({
      next: p => {
        this.painel.set(p);
        if (p.idAlmoxarifado) localStorage.setItem(CHAVE_ALMOX, p.idAlmoxarifado);
      },
      error: (e: ApiError) => this.erro.set(e?.detail || 'Tente de novo em instantes.'),
    });
  }

  protected trocarAlmox(id: string | null): void {
    this.escolhendoAlmox.set(false);
    if (id && id !== this.painel()?.idAlmoxarifado) {
      this.painel.set(null);
      this.carregar(id);
    }
  }

  protected hora(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  protected num(n: number): string {
    return numeroBr(n);
  }

  protected textoEquipe(e: EquipeNoBalcao): string {
    const partes: string[] = [];
    if (e.itensRetirada) partes.push(`${e.itensRetirada} ${e.itensRetirada === 1 ? 'material' : 'materiais'} a retirar`);
    // Mesmo texto do estoque das equipes: "9 materiais em 1 obra · 2 de sucata".
    if (e.itensNoCaminhao || e.negativosNoCaminhao) partes.push(textoCaminhao(e));
    if (!partes.length) partes.push(e.ultimaRetirada || e.ultimaDevolucao ? 'Atendida' : 'Nada pendente');
    return partes.join(' · ');
  }

  protected abrir(e: EquipeNoBalcao, modo: 'retirada' | 'devolucao'): void {
    void this.router.navigate(['/almox/balcao', e.idEquipe, modo], { queryParams: { almoxarifado: this.painel()?.idAlmoxarifado } });
  }
}
