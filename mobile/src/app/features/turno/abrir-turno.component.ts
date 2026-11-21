import { ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { liveQuery } from 'dexie';
import { Router } from '@angular/router';
import { TurnoService } from '../../core/turno/turno.service';
import { AuthService } from '../../core/auth/auth.service';
import { ChecklistVeiculoLocal, diaLocal } from '../../core/frota/checklist-veiculo.models';
import { ChecklistVeiculoService } from '../../core/frota/checklist-veiculo.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { ToastService } from '../../core/ui/toast.service';
import { RascunhoService, VinculoRascunho } from '../../core/sessao/rascunho.service';
import {
  ComposicaoEquipeLocal,
  MembroComposicaoLocal,
  OpcaoColaboradorLocal,
  VeiculoComposicaoLocal,
} from '../../core/db/models';
import { BarraTopoComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, VazioComponent } from '../../ui';

type Folha = 'veiculo' | 'pessoa' | null;

/** Conferência do turno gravada no aparelho: sair no meio não desfaz a troca de placa ou de pessoas. */
interface RascunhoTurno {
  idEquipe: string;
  veiculo: VeiculoComposicaoLocal | null;
  membros: MembroComposicaoLocal[];
  folha: Folha;
}

/**
 * Abertura do turno: o líder confere veículo e pessoas e abre. Só o responsável da
 * equipe altera a composição; responsável de outra equipe não pode ser puxado.
 * Abrir exige rede (o servidor valida a equipe); a conferência fica salva enquanto isso.
 */
@Component({
  selector: 'app-abrir-turno',
  standalone: true,
  imports: [BarraTopoComponent, FolhaComponent, IconeComponent, IndicadorRedeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo titulo="Abrir turno" [subtitulo]="composicao()?.codigo ? 'Equipe ' + composicao()!.codigo : null" (voltar)="voltar()">
      <geo-indicador-rede />
    </geo-barra-topo>

    <div class="tela">
      @if (carregando() && !composicao()) {
        <div class="esqueletos" role="status" aria-busy="true" aria-label="Carregando equipe">
          <div class="geo-esqueleto" style="height: 64px"></div><div class="geo-esqueleto" style="height: 180px"></div>
        </div>
      } @else if (!composicao()) {
        <geo-vazio icone="pessoas" titulo="Não deu para carregar sua equipe" texto="Conecte-se à internet e tente de novo.">
          <button type="button" class="geo-btn geo-btn--tonal" (click)="carregar()">Tentar de novo</button>
        </geo-vazio>
      } @else {
        <p class="intro">Confira quem está no caminhão hoje.</p>
        @if (!podeEditar()) {
          <p class="aviso"><geo-icone nome="info" [tamanho]="18" />Só o líder da equipe pode trocar o veículo ou as pessoas.</p>
        }

        <h2 class="geo-secao">Veículo</h2>
        <div class="geo-grupo">
          <button type="button" class="geo-linha" [class.geo-linha--acao]="podeEditar()" [disabled]="!podeEditar()" (click)="abrirFolha('veiculo')">
            <span class="geo-selo"><geo-icone nome="caminhao" /></span>
            <span class="geo-linha__texto">
              <span class="geo-linha__titulo geo-num">{{ veiculo()?.placa ?? 'Nenhum veículo' }}</span>
              <span class="geo-linha__apoio">{{ veiculo()?.modelo ?? (podeEditar() ? 'Toque para escolher' : '') }}{{ veiculoAlterado() ? ' · trocado hoje' : '' }}</span>
            </span>
            @if (podeEditar()) { <span class="trocar">Trocar</span> }
          </button>
        </div>

        @if (checklist(); as c) {
          <h2 class="geo-secao">Checklist do veículo</h2>
          <div class="geo-grupo">
            @switch (c.estado) {
              @case ('feito') {
                <div class="geo-linha">
                  <span class="geo-selo geo-selo--ok"><geo-icone nome="check" /></span>
                  <span class="geo-linha__texto"><span class="geo-linha__titulo">Feito hoje</span>
                    <span class="geo-linha__apoio">{{ c.texto }}</span></span>
                </div>
              }
              @case ('sem-modelo') {
                <div class="geo-linha" data-testid="checklist-sem-modelo">
                  <span class="geo-selo geo-selo--atencao"><geo-icone nome="alerta" /></span>
                  <span class="geo-linha__texto"><span class="geo-linha__titulo">Sem checklist cadastrado</span>
                    <span class="geo-linha__apoio">{{ c.texto }}</span></span>
                </div>
              }
              @case ('sem-catalogo') {
                <div class="geo-linha">
                  <span class="geo-selo geo-selo--atencao"><geo-icone nome="sem_rede" /></span>
                  <span class="geo-linha__texto"><span class="geo-linha__titulo">Checklist não baixado</span>
                    <span class="geo-linha__apoio">{{ c.texto }}</span></span>
                </div>
              }
              @case ('procurando') {
                <div class="geo-linha" aria-busy="true">
                  <span class="geo-selo"><geo-icone nome="relogio" /></span>
                  <span class="geo-linha__texto"><span class="geo-linha__titulo">Procurando o checklist de hoje…</span>
                    <span class="geo-linha__apoio">Alguém da equipe pode já ter feito em outro celular</span></span>
                </div>
              }
              @default {
                <button type="button" class="geo-linha geo-linha--acao" (click)="fazerChecklist()">
                  <span class="geo-selo geo-selo--atencao"><geo-icone [nome]="c.rascunho ? 'retomar' : 'caminhao'" /></span>
                  <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ c.rascunho ? 'Continuar checklist' : 'Fazer checklist' }}</span>
                    <span class="geo-linha__apoio">{{ c.texto }}</span></span>
                  <geo-icone nome="avancar" [tamanho]="18" />
                </button>
              }
            }
          </div>
        }

        <h2 class="geo-secao"><span>Pessoas</span><span class="geo-num">{{ membros().length }}</span></h2>
        <ul class="geo-grupo">
          @for (m of membros(); track m.idColaborador) {
            <li>
              <div class="geo-linha">
                <span class="iniciais" aria-hidden="true">{{ iniciais(m.nome) }}</span>
                <span class="geo-linha__texto">
                  <span class="geo-linha__titulo">{{ m.nome }}</span>
                  <span class="geo-linha__apoio">{{ m.responsavel ? 'Líder' : (m.funcao || 'Colaborador') }}{{ ehNovo(m.idColaborador) ? ' · incluído hoje' : '' }}</span>
                </span>
                @if (podeEditar() && !m.responsavel) {
                  <button type="button" class="geo-btn-icone" (click)="removerPessoa(m.idColaborador)" [attr.aria-label]="'Tirar ' + m.nome + ' do turno'">
                    <geo-icone nome="fechar" [tamanho]="20" />
                  </button>
                }
              </div>
            </li>
          }
          @if (podeEditar()) {
            <li>
              <button type="button" class="geo-linha geo-linha--acao incluir" (click)="abrirFolha('pessoa')">
                <span class="geo-selo geo-selo--destaque"><geo-icone nome="mais" /></span>
                <span class="geo-linha__texto"><span class="geo-linha__titulo">Incluir pessoa</span></span>
              </button>
            </li>
          }
        </ul>
        @if (removidos().length) {
          <p class="nota">Fora do turno hoje: {{ nomesRemovidos() }}.</p>
        }
        @if (erro()) {
          <p class="erro" role="alert"><geo-icone nome="alerta" [tamanho]="18" />{{ erro() }}</p>
        }
      }
    </div>

    @if (composicao()) {
      <footer class="rodape" data-acao-fixa>
        @if (!rede.isOnline() && !obras()) {
          <p class="sem-rede"><geo-icone nome="sem_rede" [tamanho]="16" />Abrir o turno precisa de internet. A conferência fica salva.</p>
        } @else if (!rede.isOnline()) {
          <p class="sem-rede"><geo-icone nome="sem_rede" [tamanho]="16" />Sem sinal: o turno abre no aparelho e vai ao servidor com a hora de agora.</p>
        }
        @if (faltaChecklist()) {
          <p class="sem-rede"><geo-icone nome="alerta" [tamanho]="16" />Faça o checklist do {{ veiculo()?.placa }} para abrir o turno.</p>
        }
        <button type="button" class="geo-btn geo-btn--principal geo-btn--bloco" (click)="abrirTurno()" [disabled]="enviando() || (!rede.isOnline() && !obras()) || faltaChecklist()">
          {{ enviando() ? 'Abrindo…' : (houveAlteracao() ? 'Abrir turno com as mudanças' : 'Abrir turno') }}
        </button>
      </footer>
    }

    <geo-folha [aberta]="folha() !== null" (fechar)="fecharFolha()" [titulo]="folha() === 'veiculo' ? 'Escolher veículo' : 'Incluir pessoa'">
      <div class="busca">
        <geo-icone nome="busca" [tamanho]="18" />
        <input type="search" [placeholder]="folha() === 'veiculo' ? 'Placa ou modelo' : 'Nome'" enterkeyhint="search"
          [attr.aria-label]="folha() === 'veiculo' ? 'Buscar veículo' : 'Buscar pessoa'" [value]="busca()" (input)="busca.set($any($event.target).value)">
      </div>
      @if (folha() === 'veiculo') {
        <ul class="geo-grupo opcoes">
          @for (v of veiculosFiltrados(); track v.id) {
            <li><button type="button" class="geo-linha geo-linha--acao" (click)="escolherVeiculo(v)" [attr.aria-pressed]="v.id === veiculo()?.id">
              <span class="geo-linha__texto"><span class="geo-linha__titulo geo-num">{{ v.placa }}</span><span class="geo-linha__apoio">{{ v.modelo }}</span></span>
              @if (v.id === veiculo()?.id) { <geo-icone nome="check" /> }
            </button></li>
          } @empty { <li><div class="geo-linha"><span class="geo-linha__apoio">Nenhum veículo encontrado</span></div></li> }
        </ul>
      } @else if (folha() === 'pessoa') {
        <ul class="geo-grupo opcoes">
          @for (c of pessoasDisponiveis(); track c.id) {
            <li><button type="button" class="geo-linha geo-linha--acao" (click)="adicionarPessoa(c)" [disabled]="c.responsavelEmOutraEquipe">
              <span class="geo-linha__texto">
                <span class="geo-linha__titulo">{{ c.nome }}</span>
                <span class="geo-linha__apoio">{{ c.responsavelEmOutraEquipe ? 'Líder de outra equipe' : (c.funcao || 'Colaborador') }}{{ c.equipeAtual ? ' · ' + c.equipeAtual : '' }}</span>
              </span>
            </button></li>
          } @empty { <li><div class="geo-linha"><span class="geo-linha__apoio">Ninguém encontrado com esse nome</span></div></li> }
        </ul>
      }
    </geo-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    /* Nada encolhe: com conteúdo maior que a tela, a página rola (grupos com overflow:hidden eram cortados). */
    :host > * { flex-shrink: 0; }
    .tela { flex: 1; padding-bottom: var(--geo-e4); }
    .esqueletos { display: grid; gap: var(--geo-e3); padding: var(--geo-e4); }
    .intro { margin: var(--geo-e1) var(--geo-e5) 0; color: var(--geo-texto-2); }
    .aviso, .nota, .erro, .sem-rede { display: flex; gap: var(--geo-e2); align-items: flex-start; font: var(--geo-t-apoio); font-size: .875rem; }
    .aviso { margin: var(--geo-e3) var(--geo-margem) 0; padding: var(--geo-e3) var(--geo-e4); border-radius: var(--geo-r-grupo); background: var(--geo-destaque-suave); color: var(--geo-texto); }
    .nota { margin: var(--geo-e3) var(--geo-e5) 0; color: var(--geo-texto-2); }
    .erro { margin: var(--geo-e3) var(--geo-e5) 0; color: var(--geo-erro); }
    .geo-linha:disabled { color: inherit; cursor: default; }
    .trocar { color: var(--geo-destaque); font-weight: 600; font-size: .875rem; }
    .iniciais { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; flex: none; background: var(--geo-superficie-2);
      color: var(--geo-texto-2); font: 600 .875rem/1 var(--geo-fonte); }
    .incluir .geo-linha__titulo { color: var(--geo-destaque); }
    .rodape { position: sticky; bottom: 0; display: grid; gap: var(--geo-e2); padding: var(--geo-e3) var(--geo-e4) calc(var(--geo-e3) + var(--geo-safe-base));
      background: var(--geo-fundo); border-top: 1px solid var(--geo-linha); }
    .sem-rede { margin: 0; color: var(--geo-atencao); }
    .busca { margin: 0 var(--geo-margem) var(--geo-e3); display: flex; align-items: center; gap: var(--geo-e2); padding: 0 var(--geo-e4); min-height: 48px;
      border-radius: var(--geo-r-pilula); background: var(--geo-superficie-2); color: var(--geo-texto-2); }
    .busca input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--geo-texto); font: var(--geo-t-corpo); font-size: 1rem; }
    .busca input:focus { outline: none; }
    .opcoes { background: var(--geo-fundo); }
    .opcoes .geo-linha:disabled { opacity: .55; }
  `],
})
export class AbrirTurnoComponent implements OnInit {
  private readonly turnoService = inject(TurnoService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly rascunhos = inject(RascunhoService);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly checklists = inject(ChecklistVeiculoService);
  private readonly destroyRef = inject(DestroyRef);
  readonly rede = inject(ConnectivityService);

  private readonly checklistsLocais = signal<ChecklistVeiculoLocal[]>([]);
  /** Checklist de hoje do veículo achado no servidor (feito em outro aparelho), por veículo consultado. */
  private readonly noServidor = signal<{ idVeiculo: string; estado: 'procurando' | 'achou' | 'nao-achou'; texto?: string } | null>(null);

  readonly carregando = signal(true);
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly composicao = signal<ComposicaoEquipeLocal | null>(null);
  readonly veiculo = signal<VeiculoComposicaoLocal | null>(null);
  readonly membros = signal<MembroComposicaoLocal[]>([]);
  readonly folha = signal<Folha>(null);
  readonly busca = signal('');
  private rascunho: VinculoRascunho | null = null;

  readonly podeEditar = computed(() => !!this.composicao()?.usuarioResponsavel);
  readonly veiculoAlterado = computed(() => (this.veiculo()?.id ?? null) !== (this.composicao()?.veiculo?.id ?? null));
  private readonly idsOriginais = computed(() => new Set((this.composicao()?.membros ?? []).map(m => m.idColaborador)));
  private readonly idsSelecionados = computed(() => new Set(this.membros().map(m => m.idColaborador)));
  readonly removidos = computed(() => (this.composicao()?.membros ?? []).filter(m => !this.idsSelecionados().has(m.idColaborador)));
  readonly nomesRemovidos = computed(() => this.removidos().map(m => m.nome).join(', '));
  readonly membrosAlterados = computed(() => {
    const originais = this.idsOriginais();
    const atuais = this.idsSelecionados();
    return originais.size !== atuais.size || [...atuais].some(id => !originais.has(id));
  });
  readonly houveAlteracao = computed(() => this.veiculoAlterado() || this.membrosAlterados());

  /**
   * O veículo escolhido precisa de checklist hoje antes de abrir o turno, se a frota configurou
   * checklist para ele. Vale o deste aparelho (mesmo ainda na fila) ou o que o servidor já tem.
   */
  readonly checklist = computed<{ estado: 'feito' | 'procurando' | 'falta' | 'sem-modelo' | 'sem-catalogo'; texto: string; rascunho: boolean } | null>(() => {
    const id = this.veiculo()?.id;
    if (!id) return null;
    const catalogo = this.checklists.catalogo();
    // O checklist é obrigatório: quando não dá para cumprir (frota sem cadastro), a equipe vê o motivo e avisa a supervisão.
    if (!catalogo) {
      return { estado: 'sem-catalogo', texto: 'Os checklists da frota ainda não chegaram neste aparelho. Abra o app com sinal para baixar.', rascunho: false };
    }
    const doCatalogo = catalogo.veiculos.find(v => v.idVeiculo === id);
    if (!doCatalogo?.idsModelosPrincipais.length) {
      return { estado: 'sem-modelo', texto: 'Este veículo não tem checklist cadastrado na frota. Avise a supervisão; o turno pode abrir.', rascunho: false };
    }
    const hoje = diaLocal();
    const locais = this.checklistsLocais().filter(c => c.idVeiculo === id);
    const feito = locais
      .filter(c => c.statusSync !== 'RASCUNHO' && c.statusSync !== 'ERRO' && c.preenchidoEm && diaLocal(new Date(c.preenchidoEm)) === hoje)
      .sort((a, b) => (b.preenchidoEm ?? '').localeCompare(a.preenchidoEm ?? ''))[0];
    if (feito) {
      const hora = new Date(feito.preenchidoEm!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const fila = feito.statusSync === 'ENVIADO' ? '' : ' · enviando quando houver sinal';
      return { estado: 'feito', texto: `Às ${hora} neste celular${feito.condutorNome ? ' · ' + feito.condutorNome : ''}${fila}`, rascunho: false };
    }
    const servidor = this.noServidor();
    if (servidor?.idVeiculo === id && servidor.estado === 'achou') return { estado: 'feito', texto: servidor.texto ?? '', rascunho: false };
    if (servidor?.idVeiculo === id && servidor.estado === 'procurando') return { estado: 'procurando', texto: '', rascunho: false };
    const rascunho = locais.some(c => c.statusSync === 'RASCUNHO');
    return { estado: 'falta', texto: 'Obrigatório antes de abrir o turno', rascunho };
  });
  readonly faltaChecklist = computed(() => this.checklist()?.estado === 'falta' || this.checklist()?.estado === 'procurando');

  readonly veiculosFiltrados = computed(() => {
    const q = normalizar(this.busca());
    const lista = this.composicao()?.opcoes.veiculos ?? [];
    return (q ? lista.filter(v => normalizar(v.placa).includes(q) || normalizar(v.modelo ?? '').includes(q)) : lista).slice(0, 60);
  });

  readonly pessoasDisponiveis = computed(() => {
    const q = normalizar(this.busca());
    const selecionados = this.idsSelecionados();
    return (this.composicao()?.opcoes.colaboradores ?? [])
      .filter(c => !selecionados.has(c.id))
      .filter(c => !q || normalizar(c.nome).includes(q))
      .slice(0, 60);
  });

  constructor() {
    // Trocou o veículo (ou abriu a tela com sinal): procura no servidor o checklist de hoje feito em outro aparelho.
    effect(() => {
      const id = this.veiculo()?.id;
      const online = this.rede.isOnline();
      if (id && online) untracked(() => void this.procurarNoServidor(id));
    });
  }

  async ngOnInit(): Promise<void> {
    const assinatura = liveQuery(() => this.checklists.listar()).subscribe({ next: lista => this.checklistsLocais.set(lista) });
    this.destroyRef.onDestroy(() => assinatura.unsubscribe());
    if (!this.checklists.catalogo()) await this.checklists.carregarCatalogoLocal();
    // Com sinal, atualiza o catálogo da frota: a exigência do checklist vale o que está cadastrado hoje.
    if (this.rede.isOnline()) void this.checklists.sincronizarCatalogo().catch(() => undefined);
    await this.carregar();
  }

  fazerChecklist(): void {
    const id = this.veiculo()?.id;
    if (!id) return;
    void this.router.navigate(['/checklist/novo'], { queryParams: { veiculo: id, volta: '/turno/abrir' } });
  }

  private async procurarNoServidor(idVeiculo: string): Promise<void> {
    if (this.noServidor()?.idVeiculo === idVeiculo && this.noServidor()?.estado === 'achou') return;
    this.noServidor.set({ idVeiculo, estado: 'procurando' });
    try {
      const hoje = diaLocal();
      const achado = (await this.checklists.doVeiculo(idVeiculo))
        .map(i => i.checklist)
        .find(c => diaLocal(new Date(c.preenchidoEm)) === hoje);
      if (this.veiculo()?.id !== idVeiculo) return;
      const hora = achado ? new Date(achado.preenchidoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      this.noServidor.set(achado
        ? { idVeiculo, estado: 'achou', texto: `Às ${hora}${achado.preenchidoPor ? ' por ' + achado.preenchidoPor : ''}` }
        : { idVeiculo, estado: 'nao-achou' });
    } catch {
      // Sem resposta do servidor vale o que está no aparelho.
      if (this.veiculo()?.id === idVeiculo) this.noServidor.set({ idVeiculo, estado: 'nao-achou' });
    }
  }

  async carregar(): Promise<void> {
    this.carregando.set(true);
    try {
      const local = await this.turnoService.loadComposicaoLocal();
      if (local) this.aplicarComposicao(local);
      if (this.rede.isOnline()) {
        try {
          this.aplicarComposicao(await this.turnoService.sincronizarComposicao());
        } catch (error) {
          console.warn('Não foi possível atualizar a composição da equipe:', error);
        }
      }
      if (this.composicao() && !this.rascunho) await this.vincularRascunho();
    } finally {
      this.carregando.set(false);
    }
  }

  private async vincularRascunho(): Promise<void> {
    const idEquipe = this.composicao()!.idEquipe;
    this.rascunho = this.rascunhos.vincular<RascunhoTurno>({
      chave: 'turno:abrir',
      injector: this.injector,
      ler: () => ({ idEquipe, veiculo: this.veiculo(), membros: this.membros(), folha: this.folha() }),
      aplicar: r => {
        // Rascunho de outra equipe (troca de usuário) não vale aqui.
        if (r.idEquipe !== idEquipe || !this.podeEditar()) return;
        this.veiculo.set(r.veiculo);
        this.membros.set(r.membros?.length ? r.membros : this.membros());
        this.folha.set(r.folha ?? null);
      },
      titulo: () => (this.houveAlteracao() ? 'Abertura de turno com mudanças na equipe' : 'Abertura de turno'),
      rota: () => '/turno/abrir',
      vazio: () => !this.houveAlteracao() && this.folha() === null,
    });
    await this.rascunho.restaurado;
  }

  ehNovo(idColaborador: string): boolean {
    return !this.idsOriginais().has(idColaborador);
  }

  iniciais(nome: string): string {
    const partes = (nome || '?').trim().split(/\s+/);
    return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
  }

  abrirFolha(folha: Exclude<Folha, null>): void {
    if (!this.podeEditar()) return;
    this.busca.set('');
    this.folha.set(folha);
  }

  fecharFolha(): void {
    this.folha.set(null);
  }

  escolherVeiculo(v: VeiculoComposicaoLocal): void {
    this.veiculo.set(v);
    this.fecharFolha();
  }

  adicionarPessoa(c: OpcaoColaboradorLocal): void {
    if (c.responsavelEmOutraEquipe) return;
    this.membros.update(lista => [...lista, { idColaborador: c.id, nome: c.nome, funcao: c.funcao, responsavel: false }]);
    this.fecharFolha();
  }

  removerPessoa(idColaborador: string): void {
    this.membros.update(lista => lista.filter(m => m.responsavel || m.idColaborador !== idColaborador));
  }

  /** Equipe de Obras abre o turno também sem sinal. */
  readonly obras = computed(() => this.auth.ehEquipeObras());

  async abrirTurno(): Promise<void> {
    if (this.enviando() || this.faltaChecklist()) return;
    this.enviando.set(true);
    this.erro.set(null);
    try {
      const escolha = this.podeEditar() && this.houveAlteracao()
        ? {
            idVeiculo: this.veiculoAlterado() ? this.veiculo()?.id ?? null : null,
            idsColaboradores: this.membros().filter(m => !m.responsavel).map(m => m.idColaborador),
          }
        : undefined;
      if (this.obras()) {
        const titulares = new Set((this.composicao()?.membros ?? []).map(m => m.idColaborador));
        const lider = this.membros().find(m => m.responsavel);
        await this.turnoService.abrirTurnoObras(
          { idVeiculo: this.veiculo()?.id ?? null, idsColaboradores: this.membros().filter(m => !m.responsavel).map(m => m.idColaborador) },
          { idLider: lider?.idColaborador ?? null, idsSubstitutos: this.membros().filter(m => !titulares.has(m.idColaborador)).map(m => m.idColaborador) });
      } else {
        await this.turnoService.abrirTurno(escolha);
      }
      await this.rascunho?.concluir();
      this.toast.success(escolha ? 'Turno aberto e equipe atualizada' : 'Turno aberto. Bom trabalho!');
      await this.router.navigate(['/hoje'], { replaceUrl: true });
    } catch (error: any) {
      this.erro.set(error?.detail || error?.error?.detail || error?.message || 'Tente novamente em instantes.');
    } finally {
      this.enviando.set(false);
    }
  }

  voltar(): void {
    void this.router.navigate(['/hoje']);
  }

  private aplicarComposicao(composicao: ComposicaoEquipeLocal): void {
    const editado = this.houveAlteracao() && this.composicao()?.idEquipe === composicao.idEquipe;
    this.composicao.set(composicao);
    // Atualização do servidor não apaga o que o líder já mexeu.
    if (!editado) {
      this.veiculo.set(composicao.veiculo);
      this.membros.set([...composicao.membros]);
    }
  }
}

function normalizar(valor: string): string {
  return (valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').toLowerCase().trim();
}
