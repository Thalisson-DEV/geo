import { SyncService } from '../../core/sync/sync.service';
import { ToastService } from '../../core/ui/toast.service';
import { PuxarAtualizarDirective } from '../../ui/puxar-atualizar.directive';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { PacoteObrasService } from '../../core/obras/pacote-obras.service';
import { RegistrosObrasService } from '../../core/obras/registros-obras.service';
import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { NavigationEnd, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { OutboxService } from '../../core/sync/outbox.service';
import { SessaoService } from '../../core/sessao/sessao.service';
import { LayoutService } from '../../core/plataforma/layout.service';
import { Aba, BarraAbasComponent, ModoNavegacao } from '../../ui';
import { AvisoSessaoComponent } from '../../ui/aviso-sessao.component';

/** Telas de topo: mostram a barra de abas. Lançamentos e detalhes ocupam a tela toda. */
const TELAS_DE_TOPO = /^\/(hoje|obras|supervisao|material|material\/saldo|frota|transferencias|perfil|inspecoes|desvios|almox\/solicitacoes|almox\/tecnicas|almox\/movimentacoes|almox\/fechamento|fechamento)(\?|$)/;

/** Checklist e abastecimento valem para todos os perfis do app (campo e administrativo). */
const ABA_FROTA: Aba = { rota: '/frota', rotulo: 'Frota', icone: 'caminhao', ativaEm: ['/checklist', '/abastecimento'] };

/**
 * Casca do app: conteúdo rolável + barra de abas inferior.
 *
 * A rolagem de cada rota é guardada no estado de tela da sessão (durante a
 * rolagem e ao sair) e devolvida ao voltar — inclusive depois de o sistema
 * matar o app — esperando a lista ter altura suficiente.
 */
import { AvaliacaoFolhaComponent } from '../avaliacao/avaliacao-folha.component';
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, BarraAbasComponent, AvisoSessaoComponent, AvaliacaoFolhaComponent, PuxarAtualizarDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="casca" [class.lateral]="modoNavegacao() === 'lateral'">
      @if (mostrarAbas() && modoNavegacao() === 'lateral') {
        <geo-barra-abas [abas]="abas()" modo="lateral" />
      }
      <main #rolagem class="conteudo geo-coluna-app" (scroll)="aoRolar()"
        [geoPuxarAtualizar]="mostrarAbas()" [atualizando]="atualizando()" (atualizar)="atualizarPeloGesto()">
        <geo-aviso-sessao />
        <router-outlet />
        <app-avaliacao-folha />
      </main>
      @if (mostrarAbas() && modoNavegacao() === 'inferior') {
        <geo-barra-abas [abas]="abas()" />
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .casca { display: flex; flex-direction: column; height: 100dvh; background: var(--geo-fundo); }
    .casca.lateral { flex-direction: row; }
    .conteudo { flex: 1; min-height: 0; min-width: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;
      display: flex; flex-direction: column; }
    /* Só a tela cresce até o fim; o aviso de sessão fica do tamanho dele (vazio, crescia e empurrava a tela curta para baixo no tablet). */
    .conteudo > :not(router-outlet):not(geo-aviso-sessao) { flex: 1 0 auto; }
    .conteudo > geo-aviso-sessao { flex: none; }
  `],
})
export class AppShellComponent implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly outbox = inject(OutboxService);
  private readonly sessao = inject(SessaoService);
  readonly layout = inject(LayoutService);
  private readonly pacoteObras = inject(PacoteObrasService);
  private readonly registrosObras = inject(RegistrosObrasService);
  private readonly rede = inject(ConnectivityService);
  private readonly sync = inject(SyncService);
  private readonly toast = inject(ToastService);
  readonly atualizando = signal(false);

  /** Puxar para atualizar: envia a fila e baixa o que mudou (agenda de Obras incluída). */
  async atualizarPeloGesto(): Promise<void> {
    if (!this.rede.isOnline()) {
      this.toast.info('Sem conexão: o app segue com o que está no aparelho.');
      return;
    }
    this.atualizando.set(true);
    try {
      await this.sync.syncParcial();
      if (this.auth.ehEquipeObras() || this.auth.ehSupervisorObras()) await this.pacoteObras.sincronizar();
    } catch {
      this.toast.warning('Não foi possível atualizar agora. Tente de novo em instantes.');
    } finally {
      this.atualizando.set(false);
    }
  }
  private readonly destroyRef = inject(DestroyRef);
  private readonly rolagem = viewChild.required<ElementRef<HTMLElement>>('rolagem');

  private readonly url = signal(this.router.url);
  private timerRolagem: ReturnType<typeof setTimeout> | null = null;

  /** Destinos por perfil. Regras de acesso: SST não opera logística; campo não acessa inspeções. */
  readonly abas = computed<Aba[]>(() => {
    const pendentes = this.outbox.pendingCount();
    // Supervisor de Obras vê a aba Obras também quando tem almoxarifado ou encerramento (o administrador tem tudo).
    const obras: Aba[] = this.auth.isAdministrativo() && this.auth.ehSupervisorObras()
      ? [{ rota: '/supervisao', rotulo: 'Obras', icone: 'obra', ativaEm: ['/supervisao'] }] : [];
    if (this.auth.isAdministrativo() && this.auth.podeAcessarAlmoxarifado()) {
      // Com almoxarifado são 5 áreas: Inspeções e Desvios viram uma aba (Segurança) com abas no topo. Com Obras, a Frota
      // sai da barra (checklist e abastecimento seguem no Hoje) para caber em 5 no celular.
      return [
        { rota: '/hoje', rotulo: 'Hoje', icone: 'hoje', marcador: pendentes || undefined },
        ...obras,
        { rota: '/almox', rotulo: 'Almoxarifado', icone: 'almox', ativaEm: ['/almox'] },
        { rota: '/inspecoes', rotulo: 'Segurança', icone: 'escudo', ativaEm: ['/desvios'] },
        ...(obras.length ? [] : [ABA_FROTA]),
        { rota: '/perfil', rotulo: 'Conta', icone: 'conta' },
      ];
    }
    const fechamento: Aba[] = this.auth.podeCriarFechamento() ? [{ rota: '/fechamento', rotulo: 'Encerramento', icone: 'fechamento' }] : [];
    if (this.auth.isAdministrativo() && fechamento.length) {
      return [
        { rota: '/hoje', rotulo: 'Hoje', icone: 'hoje', marcador: pendentes || undefined },
        ...obras,
        ...fechamento,
        { rota: '/inspecoes', rotulo: 'Segurança', icone: 'escudo', ativaEm: ['/desvios'] },
        { rota: '/perfil', rotulo: 'Conta', icone: 'conta' },
      ];
    }
    if (this.auth.isAdministrativo() && this.auth.ehSupervisorObras()) {
      return [
        { rota: '/hoje', rotulo: 'Hoje', icone: 'hoje', marcador: pendentes || undefined },
        { rota: '/supervisao', rotulo: 'Obras', icone: 'obra', ativaEm: ['/supervisao'] },
        { rota: '/inspecoes', rotulo: 'Segurança', icone: 'escudo', ativaEm: ['/desvios'] },
        ABA_FROTA,
        { rota: '/perfil', rotulo: 'Conta', icone: 'conta' },
      ];
    }
    if (this.auth.isAdministrativo()) {
      return [
        { rota: '/hoje', rotulo: 'Hoje', icone: 'hoje', marcador: pendentes || undefined },
        { rota: '/inspecoes', rotulo: 'Inspeções', icone: 'inspecao' },
        { rota: '/desvios', rotulo: 'Desvios', icone: 'desvio' },
        ABA_FROTA,
        { rota: '/perfil', rotulo: 'Conta', icone: 'conta' },
      ];
    }
    if (this.auth.ehEquipeObras()) {
      return [
        { rota: '/hoje', rotulo: 'Hoje', icone: 'hoje', marcador: pendentes || undefined },
        { rota: '/obras', rotulo: 'Obras', icone: 'obra', ativaEm: ['/obras'] },
        { rota: '/material', rotulo: 'Material', icone: 'material', ativaEm: ['/transferencias'] },
        ABA_FROTA,
        { rota: '/perfil', rotulo: 'Conta', icone: 'conta' },
      ];
    }
    return [
      { rota: '/hoje', rotulo: 'Hoje', icone: 'hoje', marcador: pendentes || undefined },
      { rota: '/material', rotulo: 'Material', icone: 'material', ativaEm: ['/transferencias'] },
      ABA_FROTA,
      { rota: '/perfil', rotulo: 'Conta', icone: 'conta' },
    ];
  });
  readonly rotas = computed(() => this.abas().map(a => a.rota));
  /** Tablet deitado (≥ 900 × 600 px): navegação em barra lateral; abaixo disso, abas embaixo. */
  readonly modoNavegacao = computed<ModoNavegacao>(() => (this.layout.expandido() ? 'lateral' : 'inferior'));
  readonly mostrarAbas = computed(() => TELAS_DE_TOPO.test(this.url()));

  constructor() {
    // Os elementos fixos (rodapés, avisos, botão flutuante) leem o modo pelo atributo na raiz.
    effect(() => {
      const nav = !this.mostrarAbas() ? 'nenhuma' : this.modoNavegacao();
      document.documentElement.setAttribute('data-nav', nav);
    });
    this.destroyRef.onDestroy(() => document.documentElement.removeAttribute('data-nav'));
    // Obras: abre com o que está no aparelho e, com rede, baixa o pacote sozinho (ao abrir e ao voltar a rede).
    if (this.auth.ehEquipeObras() || this.auth.ehSupervisorObras()) {
      void this.pacoteObras.carregarLocal();
      void this.registrosObras.carregar().then(() => this.registrosObras.limparEnviados());
      effect(() => {
        if (this.rede.isOnline()) untracked(() => void this.pacoteObras.sincronizar());
      });
    }
    // Entrou pela sessão salva sem a carga inicial (aparelho limpo): baixa os catálogos assim que houver rede.
    effect(() => {
      if (this.rede.isOnline()) untracked(() => void this.sync.completarCargaInicial().catch(() => undefined));
    });
    // Ouve desde já: a casca nasce DURANTE a primeira navegação, e o NavigationEnd
    // dela chega antes do ngAfterViewInit. Sem isto a rolagem iria para a rota errada.
    const sub = this.router.events
      .pipe(filter(e => e instanceof NavigationStart || e instanceof NavigationEnd))
      .subscribe(e => {
        if (e instanceof NavigationStart) {
          // Um temporizador de rolagem pendente da tela que está saindo não pode
          // disparar depois e gravar por cima da posição da próxima tela.
          if (this.timerRolagem) clearTimeout(this.timerRolagem);
          this.timerRolagem = null;
          if (this.vistaPronta) this.guardarRolagem();
        } else {
          const url = (e as NavigationEnd).urlAfterRedirects;
          this.url.set(url);
          if (this.vistaPronta) this.restaurarRolagem(url);
        }
      });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  private vistaPronta = false;
  /** Até quando os eventos de rolagem vêm da própria restauração (e não do dedo). */
  private restaurandoAte = 0;

  ngAfterViewInit(): void {
    this.vistaPronta = true;
    this.url.set(this.router.url);
    this.restaurarRolagem(this.router.url);
  }

  aoRolar(): void {
    if (performance.now() < this.restaurandoAte) return;
    // Grava durante a rolagem (com folga): o app pode morrer sem evento de saída.
    if (this.timerRolagem) clearTimeout(this.timerRolagem);
    this.timerRolagem = setTimeout(() => this.guardarRolagem(), 250);
  }

  /**
   * Guarda a posição como "qual item estava no topo + quanto dele já tinha passado"
   * (como as listas nativas), além do pixel bruto como reserva. Pixel sozinho escorrega
   * quando linhas fora da tela ainda não têm a altura real (content-visibility).
   */
  private guardarRolagem(): void {
    const el = this.rolagem().nativeElement;
    const topo = el.getBoundingClientRect().top;
    let ancora: string | null = null;
    let deslocamento = 0;
    for (const item of Array.from(el.querySelectorAll<HTMLElement>('[data-ancora]'))) {
      const r = item.getBoundingClientRect();
      if (r.bottom > topo + 1) {
        ancora = item.dataset['ancora'] ?? null;
        deslocamento = Math.round(topo - r.top);
        break;
      }
    }
    this.sessao.definirEstadoTela({ rolagem: Math.round(el.scrollTop), ancora, deslocamento }, this.url());
  }

  /** Espera o conteúdo assíncrono aparecer e volta para o mesmo item (até 5 s, ou até o usuário mexer). */
  private restaurarRolagem(url: string): void {
    const salvo = this.sessao.estadoTela<{ rolagem?: number; ancora?: string | null; deslocamento?: number }>(url);
    const alvo = Number(salvo.rolagem ?? 0);
    const el = this.rolagem().nativeElement;
    const terminou = () => { this.restaurandoAte = performance.now() + 150; };
    if (!alvo) {
      el.scrollTop = 0;
      terminou();
      return;
    }
    const inicio = performance.now();
    const LIMITE_MS = 5000;
    // Tela ainda carregando (esqueleto com aria-busy): continua esperando, até este teto.
    const LIMITE_CARREGANDO_MS = 15000;
    this.restaurandoAte = inicio + LIMITE_CARREGANDO_MS + 200;
    // O dedo manda: se o usuário tocar ou rolar, a restauração para.
    let desistiu = false;
    const desistir = () => { desistiu = true; terminou(); };
    el.addEventListener('pointerdown', desistir, { once: true, passive: true });
    el.addEventListener('wheel', desistir, { once: true, passive: true });
    el.addEventListener('touchmove', desistir, { once: true, passive: true });
    const limpar = () => {
      el.removeEventListener('pointerdown', desistir);
      el.removeEventListener('wheel', desistir);
      el.removeEventListener('touchmove', desistir);
    };
    const posicionarNaAncora = (): boolean => {
      if (!salvo.ancora) return false;
      const item = el.querySelector<HTMLElement>(`[data-ancora="${CSS.escape(salvo.ancora)}"]`);
      if (!item) return false;
      el.scrollTop += item.getBoundingClientRect().top - el.getBoundingClientRect().top + Number(salvo.deslocamento ?? 0);
      return true;
    };
    const tentar = () => {
      if (this.url() !== url || desistiu) { limpar(); return; }
      if (posicionarNaAncora()) {
        limpar();
        // Um quadro depois as linhas vizinhas ganham altura real: corrige o resíduo.
        requestAnimationFrame(() => { if (this.url() === url) posicionarNaAncora(); terminou(); });
        return;
      }
      const cabe = el.scrollHeight - el.clientHeight >= alvo;
      const decorrido = performance.now() - inicio;
      const carregando = !!el.querySelector('[aria-busy="true"]');
      const esgotou = carregando ? decorrido > LIMITE_CARREGANDO_MS : decorrido > LIMITE_MS;
      if ((!salvo.ancora && cabe && !carregando) || esgotou) {
        limpar();
        el.scrollTop = alvo;
        terminou();
        return;
      }
      requestAnimationFrame(tentar);
    };
    requestAnimationFrame(tentar);
  }
}

