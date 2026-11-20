import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { TurnoService } from '../../core/turno/turno.service';
import { ToastService } from '../../core/ui/toast.service';
import { AppUpdateService } from '../../core/sync/app-update.service';
import { TemaService, Tema, Contraste } from '../../core/plataforma/tema.service';
import { OutboxService } from '../../core/sync/outbox.service';
import { SyncService } from '../../core/sync/sync.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { SessaoService } from '../../core/sessao/sessao.service';
import { DbService } from '../../core/db/db.service';
import { environment } from '../../../environments/environment';
import { AvaliacaoService } from '../../core/avaliacao/avaliacao.service';
import { FolhaComponent, IconeComponent, IndicadorRedeComponent, OpcaoSegmento, SegmentadoComponent, TituloGrandeComponent } from '../../ui';

/**
 * Conta: quem está no aparelho, envios, rede, aparência, atualização e sair.
 * Regras mantidas: sair só com o turno encerrado; redes móveis e modo offline
 * continuam nas mesmas chaves do ConnectivityService.
 */
@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [FolhaComponent, IconeComponent, IndicadorRedeComponent, SegmentadoComponent, TituloGrandeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-titulo-grande titulo="Conta" [subtitulo]="rede.isOnline() ? 'Conectado' : 'Trabalhando sem internet'">
      <geo-indicador-rede />
    </geo-titulo-grande>

    <section class="identidade" aria-label="Quem está no aparelho">
      <span class="avatar" aria-hidden="true">{{ inicial() }}</span>
      <span class="quem">
        <strong>{{ nome() }}</strong>
        <span>{{ descricaoAcesso() }}</span>
      </span>
      <span class="turno" [class.aberto]="!!turno.turnoAtivo()">{{ turno.turnoAtivo() ? 'Turno aberto' : 'Sem turno' }}</span>
    </section>

    <h2 class="geo-secao">Envios</h2>
    <ul class="geo-grupo">
      <li><div class="geo-linha">
        <span class="geo-selo" [class.geo-selo--atencao]="outbox.pendingCount() > 0" [class.geo-selo--ok]="!outbox.pendingCount()"><geo-icone nome="nuvem" /></span>
        <span class="geo-linha__texto">
          <span class="geo-linha__titulo geo-num">{{ resumoFila() }}</span>
          <span class="geo-linha__apoio">{{ ultimaSincronizacao() }}</span>
        </span>
      </div></li>
      <li><button type="button" class="geo-linha geo-linha--acao" (click)="sincronizar()" [disabled]="sync.isSyncing() || !rede.isOnline()">
        <span class="geo-selo geo-selo--destaque"><geo-icone nome="atualizar" [class.girando]="sync.isSyncing()" /></span>
        <span class="geo-linha__texto">
          <span class="geo-linha__titulo">{{ sync.isSyncing() ? 'Sincronizando…' : 'Sincronizar agora' }}</span>
          <span class="geo-linha__apoio">{{ rede.isOnline() ? 'Envia o que falta e atualiza os dados' : 'Precisa de internet' }}</span>
        </span>
      </button></li>
    </ul>

    <h2 class="geo-secao">Rede</h2>
    <ul class="geo-grupo">
      <li><button type="button" role="switch" class="geo-linha geo-linha--acao interruptor" [attr.aria-checked]="rede.usarRedesMoveis()" (click)="alternarRedesMoveis()">
        <span class="geo-linha__texto">
          <span class="geo-linha__titulo">Usar dados móveis</span>
          <span class="geo-linha__apoio quebra">{{ rede.usarRedesMoveis() ? 'Envia também pelo 4G/5G' : 'Envia só no Wi-Fi' }}</span>
        </span>
        <span class="trilho" aria-hidden="true"><span></span></span>
      </button></li>
      <li><button type="button" role="switch" class="geo-linha geo-linha--acao interruptor" [attr.aria-checked]="rede.forcarOffline()" (click)="alternarOffline()">
        <span class="geo-linha__texto">
          <span class="geo-linha__titulo">Trabalhar sem internet</span>
          <span class="geo-linha__apoio quebra">{{ rede.forcarOffline() ? 'Nada é enviado até você desligar' : 'O app decide pela conexão' }}</span>
        </span>
        <span class="trilho" aria-hidden="true"><span></span></span>
      </button></li>
    </ul>
    @if (rede.isBloqueadoPorDadosMoveis()) {
      <p class="aviso"><geo-icone nome="alerta" [tamanho]="18" />Você está no 4G com dados móveis desligados. Tudo fica guardado no aparelho até conectar no Wi-Fi.</p>
    }

    <h2 class="geo-secao" id="titulo-aparencia">Aparência</h2>
    <div class="geo-grupo aparencia" role="group" aria-labelledby="titulo-aparencia">
      <geo-segmentado rotulo="Tema" [opcoes]="opcoesTema" [valor]="tema.tema()" (valorChange)="tema.definirTema($event)" />
      <geo-segmentado rotulo="Contraste" [opcoes]="opcoesContraste" [valor]="tema.contraste()" (valorChange)="tema.definirContraste($event)" />
      <p class="ajuda">Alto contraste deixa o texto mais forte para usar no sol.</p>
    </div>

    <h2 class="geo-secao">Aplicativo</h2>
    <ul class="geo-grupo">
      @if (avaliacao.haPesquisa()) {
        <li><button type="button" class="geo-linha geo-linha--acao" (click)="avaliacao.abrir()">
          <span class="geo-selo geo-selo--destaque"><geo-icone nome="estrela" /></span>
          <span class="geo-linha__texto">
            <span class="geo-linha__titulo">Avaliar o app</span>
            <span class="geo-linha__apoio quebra">{{ avaliacao.convite()?.jaRespondeu ? 'Você já avaliou. Obrigado!' : 'Conte o que você está achando' }}</span>
          </span>
          <geo-icone nome="avancar" [tamanho]="18" />
        </button></li>
      }
      <li><button type="button" class="geo-linha geo-linha--acao" (click)="buscarAtualizacao()" [disabled]="checkingUpdate()">
        <span class="geo-selo"><geo-icone nome="baixar" /></span>
        <span class="geo-linha__texto">
          <span class="geo-linha__titulo">{{ checkingUpdate() ? 'Procurando…' : 'Buscar atualização' }}</span>
          <span class="geo-linha__apoio geo-num">Versão {{ versao }}</span>
        </span>
        <geo-icone nome="avancar" [tamanho]="18" />
      </button></li>
      <li><button type="button" class="geo-linha geo-linha--acao sair" (click)="tentarLogout()" [attr.aria-disabled]="!!turno.turnoAtivo()">
        <span class="geo-selo geo-selo--erro"><geo-icone nome="sair" /></span>
        <span class="geo-linha__texto">
          <span class="geo-linha__titulo">Sair da conta</span>
          <span class="geo-linha__apoio quebra">{{ turno.turnoAtivo() ? 'Encerre o turno na tela Hoje antes de sair' : 'Encerra a sessão neste aparelho' }}</span>
        </span>
      </button></li>
    </ul>

    <geo-folha [aberta]="confirmarSaida()" (fechar)="fecharSaida()" titulo="Sair da conta?"
      descricao="Para entrar de novo você vai precisar de internet.">
      @if (outbox.pendingCount() > 0) {
        <p class="aviso folha-aviso"><geo-icone nome="alerta" [tamanho]="18" />
          {{ outbox.pendingCount() }} {{ outbox.pendingCount() === 1 ? 'envio ainda não saiu' : 'envios ainda não saíram' }}. Ficam guardados neste aparelho.</p>
      }
      <div rodape class="folha-rodape">
        <button type="button" class="geo-btn geo-btn--neutro" (click)="fecharSaida()">Ficar</button>
        <button type="button" class="geo-btn geo-btn--perigo" (click)="fazerLogout()">Sair</button>
      </div>
    </geo-folha>
  `,
  styles: [`
    :host { display: block; padding-bottom: var(--geo-e6, 32px); }
    .identidade { display: flex; align-items: center; gap: var(--geo-e3); margin: 0 var(--geo-e3); padding: var(--geo-e4);
      background: var(--geo-superficie); border-radius: var(--geo-r-grupo); }
    .avatar { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; flex: none;
      background: var(--geo-destaque-suave); color: var(--geo-destaque); font: 600 1.375rem/1 var(--geo-fonte); }
    .quem { flex: 1; min-width: 0; display: grid; gap: 2px; }
    .quem strong { font: var(--geo-t-corpo-forte); overflow-wrap: anywhere; }
    .quem span { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .turno { flex: none; padding: 4px 10px; border-radius: var(--geo-r-pilula); font: 600 .75rem/1.4 var(--geo-fonte);
      background: var(--geo-superficie-2); color: var(--geo-texto-2); }
    .turno.aberto { background: var(--geo-ok-suave); color: var(--geo-ok); }
    button.geo-linha { width: 100%; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; }
    button.geo-linha:disabled { opacity: .55; cursor: default; }
    .quebra { white-space: normal; }
    .girando { display: inline-flex; animation: girar 1s linear infinite; }
    @keyframes girar { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .girando { animation: none; } }
    .trilho { width: 48px; height: 28px; border-radius: 14px; background: var(--geo-linha-forte); position: relative; flex: none; transition: background-color var(--geo-m-entrar); }
    .trilho span { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; transition: transform var(--geo-m-entrar) var(--geo-curva); }
    [aria-checked='true'] .trilho { background: var(--geo-destaque); }
    [aria-checked='true'] .trilho span { transform: translateX(20px); }
    .aviso { display: flex; gap: var(--geo-e2); align-items: flex-start; margin: var(--geo-e2) var(--geo-e3) 0; padding: var(--geo-e3) var(--geo-e4);
      border-radius: var(--geo-r-grupo); background: var(--geo-atencao-suave); font: var(--geo-t-apoio); font-size: .875rem; }
    .folha-aviso { margin: 0 var(--geo-e4); }
    .aparencia { display: grid; gap: var(--geo-e3); padding: var(--geo-e4); }
    .ajuda { margin: 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .sair[aria-disabled='true'] { opacity: .6; }
    .sair .geo-linha__titulo { color: var(--geo-erro); }
    .folha-rodape { display: flex; gap: var(--geo-e3); padding: var(--geo-e3) var(--geo-e4) 0; }
    .folha-rodape .geo-btn { flex: 1; min-height: var(--geo-alvo-principal); }
  `],
})
export class PerfilComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly turno = inject(TurnoService);
  readonly outbox = inject(OutboxService);
  readonly sync = inject(SyncService);
  readonly rede = inject(ConnectivityService);
  readonly tema = inject(TemaService);
  readonly avaliacao = inject(AvaliacaoService);
  private readonly toast = inject(ToastService);
  private readonly appUpdate = inject(AppUpdateService);
  private readonly sessao = inject(SessaoService);
  private readonly db = inject(DbService);
  private readonly equipe = signal('');

  readonly versao = environment.versaoApp;
  readonly opcoesTema: OpcaoSegmento<Tema>[] = [
    { valor: 'claro', rotulo: 'Claro', icone: 'sol' },
    { valor: 'escuro', rotulo: 'Escuro', icone: 'lua' },
    { valor: 'sistema', rotulo: 'Sistema', icone: 'aparelho' },
  ];
  readonly opcoesContraste: OpcaoSegmento<Contraste>[] = [
    { valor: 'normal', rotulo: 'Normal' },
    { valor: 'alto', rotulo: 'Alto contraste' },
  ];
  readonly checkingUpdate = signal(false);
  // A folha de confirmação volta aberta se o app for fechado com ela na tela.
  readonly confirmarSaida = signal(!!this.sessao.estadoTela<{ folha?: string }>().folha);

  readonly nome = computed(() => this.auth.currentUser()?.nome || 'Usuário');
  readonly descricaoAcesso = computed(() => {
    const tipo = this.auth.isCampo() ? 'Equipe de campo' : 'Administrativo';
    return this.equipe() ? `${tipo} · ${this.equipe()}` : tipo;
  });
  readonly inicial = computed(() => this.nome().trim().charAt(0).toUpperCase() || '?');
  readonly resumoFila = computed(() => {
    const n = this.outbox.pendingCount();
    const erros = this.outbox.errorCount();
    if (erros) return `${erros} ${erros === 1 ? 'envio precisa' : 'envios precisam'} de atenção`;
    if (!n) return 'Tudo enviado';
    return `${n} ${n === 1 ? 'envio aguardando' : 'envios aguardando'}`;
  });
  readonly ultimaSincronizacao = computed(() => {
    const em = this.sync.lastSyncAt();
    if (!em) return 'Ainda não sincronizou neste aparelho';
    const d = new Date(em);
    const hoje = new Date();
    const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const mesmoDia = d.toDateString() === hoje.toDateString();
    return `Última sincronização ${mesmoDia ? 'hoje' : `em ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`} às ${hora}`;
  });

  ngOnInit(): void {
    // Ao reabrir o app direto aqui ninguém carregou o turno: sem isso "sair" ficava liberado com turno aberto.
    void this.turno.loadTurnoAtivo();
    if (this.auth.isCampo()) void this.db.getEquipe().then(e => this.equipe.set(e?.codigo ?? ''));
  }

  alternarRedesMoveis(): void {
    this.rede.setUsarRedesMoveis(!this.rede.usarRedesMoveis());
  }

  alternarOffline(): void {
    this.rede.setForcarOffline(!this.rede.forcarOffline());
  }

  async sincronizar(): Promise<void> {
    if (this.sync.isSyncing() || !this.rede.isOnline()) return;
    try {
      await this.sync.forceFullSync();
      this.toast.success(this.outbox.errorCount() ? 'Sincronizado. Há envios que precisam de atenção.' : 'Tudo sincronizado.');
    } catch {
      this.toast.error('Não foi possível sincronizar agora. Tente de novo em instantes.');
    }
  }

  async buscarAtualizacao(): Promise<void> {
    if (this.checkingUpdate()) return;
    this.checkingUpdate.set(true);
    const resultado = await this.appUpdate.checkForUpdateManual();
    switch (resultado) {
      case 'updated':
        this.toast.success('Atualização encontrada. Reabrindo no mesmo ponto…');
        // Grava sessão e rascunhos antes: o app reabre no mesmo ponto, já na versão nova.
        setTimeout(() => void this.appUpdate.aplicar(), 800);
        break;
      case 'current':
        this.toast.success('O app já está na versão mais recente.');
        this.checkingUpdate.set(false);
        break;
      // SW indisponível ou erro: limpa cache e recarrega como saída garantida.
      case 'disabled':
      case 'error':
        this.toast.info('Limpando cache e recarregando…');
        await this.appUpdate.hardReset();
        break;
    }
  }

  tentarLogout(): void {
    if (this.turno.turnoAtivo()) {
      this.toast.warning('Encerre seu turno antes de sair.');
      return;
    }
    this.confirmarSaida.set(true);
    this.sessao.definirEstadoTela({ folha: 'sair' });
  }

  fecharSaida(): void {
    this.confirmarSaida.set(false);
    this.sessao.definirEstadoTela({ folha: null });
  }

  fazerLogout(): void {
    this.sessao.definirEstadoTela({ folha: null });
    this.auth.logout();
  }
}
