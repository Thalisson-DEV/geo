import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BarraTopoComponent, FolhaComponent, IconeComponent, VazioComponent } from '../../ui';
import { LayoutService } from '../../core/plataforma/layout.service';
import { TokenService } from '../../core/auth/token.service';
import { TurnoService } from '../../core/turno/turno.service';
import { ToastService } from '../../core/ui/toast.service';
import { db } from '../../core/db/app-db';
import { LocalizacaoService } from '../../core/obras/localizacao.service';
import { MaterialPrevisto, distanciaMetros, linkComoChegar, materialPrevisto } from '../../core/obras/obras-regras';
import { ObrasContexto, diaCurto } from './obras-contexto';

/** Raio para sugerir "Cheguei" pela posição do aparelho. */
const RAIO_CHEGADA_M = 400;

/**
 * Ficha da obra em campo: como chegar, chegada/saída, a programação com as condições, o material previsto contra o saldo
 * do caminhão e o próximo passo. Funciona sem sinal com o pacote do aparelho.
 */
@Component({
  selector: 'app-obra-ficha',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, VazioComponent, FolhaComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (programacao(); as p) {
      <geo-barra-topo [titulo]="'Obra ' + (p.numeroObra ?? '')" [subtitulo]="'Programação #' + p.numero"
        [navegacao]="layout.expandido() ? 'nenhuma' : 'voltar'" (voltar)="voltar()" />

      @if (aviso(); as a) {
        <div class="faixa faixa--atencao" role="status"><geo-icone nome="aviso" /><span>{{ a }}</span></div>
      }

      <section class="cabeca">
        <p class="descricao">{{ p.descricao }}</p>
        <p class="periodo geo-num">{{ dia(p.inicio) }}{{ p.fim !== p.inicio ? ' a ' + dia(p.fim) : '' }}</p>
        @if (ctx.condicoes(p).length) {
          <ul class="condicoes" aria-label="Condições da intervenção">
            @for (c of ctx.condicoes(p); track c) { <li class="geo-etiqueta">{{ c }}</li> }
          </ul>
        }
        @if (p.observacao) { <p class="obs">{{ p.observacao }}</p> }
      </section>

      <h2 class="geo-secao">Local</h2>
      <div class="geo-grupo">
        <div class="geo-linha">
          <span class="geo-selo"><geo-icone nome="local" /></span>
          <span class="geo-linha__texto">
            <span class="geo-linha__titulo">{{ obra()?.endereco || (temCoordenada() ? 'Pela coordenada do projeto' : 'Sem endereço cadastrado') }}</span>
            <span class="geo-linha__apoio">{{ juntar(obra()?.referencia, obra()?.municipio) || obra()?.titulo }}</span>
          </span>
        </div>
        @if (comoChegar(); as link) {
          <a class="geo-linha geo-linha--acao" [href]="link" target="_blank" rel="noopener" data-testid="como-chegar">
            <span class="geo-selo geo-selo--destaque"><geo-icone nome="navegar" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__titulo">Como chegar</span>
              <span class="geo-linha__apoio">Abre o app de mapas do aparelho</span></span>
            <geo-icone nome="avancar" [tamanho]="18" />
          </a>
        } @else {
          <div class="geo-linha"><span class="geo-selo geo-selo--atencao"><geo-icone nome="alerta" /></span>
            <span class="geo-linha__texto"><span class="geo-linha__apoio">A obra não tem endereço nem coordenada: confirme o local com a supervisão.</span></span></div>
        }
        <div class="geo-linha">
          <span class="geo-selo" [class.geo-selo--ok]="chegou()"><geo-icone [nome]="chegou() ? 'check' : 'obra'" /></span>
          <span class="geo-linha__texto">
            <span class="geo-linha__titulo">{{ chegou() ? 'Equipe na obra' : 'Equipe a caminho' }}</span>
            <span class="geo-linha__apoio">{{ perto() && !chegou() ? 'Você está perto da obra' : chegou() ? 'Toque em "Saí" ao deixar a obra' : 'Toque em "Cheguei" ao chegar' }}</span>
          </span>
          <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" (click)="presenca()" [disabled]="registrando()" data-testid="presenca">
            {{ chegou() ? 'Saí' : 'Cheguei' }}
          </button>
        </div>
      </div>

      <h2 class="geo-secao"><span>Execução</span><span class="geo-num">{{ feitos() }} de {{ pontos().length }} pontos</span></h2>
      <ul class="geo-grupo">
        <li><a class="geo-linha geo-linha--acao" [routerLink]="['/obras', p.id, 'apr']">
          <span class="geo-selo" [class.geo-selo--ok]="liberacao() === 'LIBERADA'" [class.geo-selo--erro]="liberacao() === 'IMPEDIDA'"
            [class.geo-selo--atencao]="liberacao() === 'PENDENTE' || liberacao() === 'EM_PREENCHIMENTO'"><geo-icone nome="escudo" /></span>
          <span class="geo-linha__texto"><span class="geo-linha__titulo">APR</span>
            <span class="geo-linha__apoio">{{ textoLiberacao() }}</span></span>
          <geo-icone nome="avancar" [tamanho]="18" /></a></li>
        <li><a class="geo-linha geo-linha--acao" [routerLink]="['/obras', p.id, 'execucao']">
          <span class="geo-selo geo-selo--destaque"><geo-icone nome="ferramenta" /></span>
          <span class="geo-linha__texto"><span class="geo-linha__titulo">Pontos e projeto</span>
            <span class="geo-linha__apoio">{{ pendencias().length ? pendencias().length + (pendencias().length === 1 ? ' foto pendente' : ' fotos pendentes') : 'Marque o que foi feito em cada ponto' }}</span></span>
          <geo-icone nome="avancar" [tamanho]="18" /></a></li>
        <li><a class="geo-linha geo-linha--acao" [routerLink]="['/obras', p.id, 'ocorrencia']">
          <span class="geo-selo"><geo-icone nome="alerta" /></span>
          <span class="geo-linha__texto"><span class="geo-linha__titulo">Ocorrência</span>
            <span class="geo-linha__apoio">Imprevisto, falta de material, acesso, clima</span></span>
          <geo-icone nome="avancar" [tamanho]="18" /></a></li>
      </ul>

      <h2 class="geo-secao"><span>Material previsto</span>@if (faltando()) { <span class="falta">{{ faltando() === 1 ? 'falta 1 item' : 'faltam ' + faltando() + ' itens' }}</span> }</h2>
      @if (material().length) {
        <ul class="geo-grupo" aria-label="Material previsto e saldo do caminhão">
          @for (m of material(); track m.descricao) {
            <li class="geo-linha">
              <span class="geo-selo" [class.geo-selo--erro]="m.falta > 0" [class.geo-selo--ok]="m.falta === 0 && m.saldo !== null"><geo-icone nome="material" /></span>
              <span class="geo-linha__texto">
                <span class="geo-linha__titulo">{{ m.descricao }}</span>
                <span class="geo-linha__apoio geo-num">Previsto {{ num(m.previsto) }} {{ m.unidade ?? '' }}{{ m.saldo !== null ? ' · no caminhão ' + num(m.saldo) : '' }}</span>
              </span>
              @if (m.falta > 0) { <span class="geo-etiqueta geo-etiqueta--erro geo-num">{{ m.falta === 1 ? 'Falta 1' : 'Faltam ' + num(m.falta) }}</span> }
            </li>
          }
        </ul>
        @if (faltando()) {
          <p class="nota">Falta material: registre uma ocorrência de material. O material vem da programação ou de solicitação feita pelo escritório.</p>
        }
      } @else {
        <p class="nota">Nenhum material a instalar nesta programação.</p>
      }
      <div class="geo-respiro"></div>

      <div class="doca" data-acao-fixa>
        <a class="geo-btn geo-btn--principal geo-btn--bloco" [routerLink]="passo().rota" data-testid="passo-obra"><geo-icone [nome]="$any(passo().icone)" />{{ passo().rotulo }}</a>
      </div>
    } @else {
      <geo-barra-topo titulo="Obra" (voltar)="voltar()" />
      <geo-vazio icone="obra" titulo="Programação não está no aparelho" texto="Ela pode ter sido cancelada ou passada para outra equipe. Volte para a agenda." />
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .cabeca { padding: var(--geo-e3) var(--geo-margem) 0; display: grid; gap: var(--geo-e2); }
    .descricao { font: var(--geo-t-corpo-forte); }
    .periodo, .obs { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .condicoes { display: flex; flex-wrap: wrap; gap: var(--geo-e2); list-style: none; padding: 0; margin: 0; }
    .faixa { display: flex; gap: var(--geo-e3); align-items: center; margin: var(--geo-e3) var(--geo-margem) 0; padding: var(--geo-e3); border-radius: var(--geo-r-grupo); font: var(--geo-t-apoio); }
    .faixa--atencao { background: var(--geo-atencao-suave); color: var(--geo-texto); }
    .falta { color: var(--geo-erro); font-weight: 600; }
    .nota { margin: var(--geo-e2) var(--geo-margem) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .doca { position: sticky; bottom: 0; margin-top: auto; padding: var(--geo-e3) var(--geo-margem); background: linear-gradient(to top, var(--geo-fundo) 72%, transparent); }
  `],
})
export class ObraFichaComponent implements OnInit {
  private readonly rota = inject(ActivatedRoute);
  /** Programação da ficha (a rota é por programação: a mesma obra pode ter mais de uma na agenda). */
  readonly id = toSignal(this.rota.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly ctx = inject(ObrasContexto);
  readonly layout = inject(LayoutService);
  private readonly router = inject(Router);
  private readonly tokens = inject(TokenService);
  private readonly turno = inject(TurnoService);
  private readonly toast = inject(ToastService);
  private readonly gps = inject(LocalizacaoService);

  readonly saldo = signal(new Map<string, number>());
  readonly registrando = signal(false);
  readonly perto = signal(false);

  readonly programacao = computed(() => this.ctx.pacote.programacao(this.id()));
  readonly obra = computed(() => this.ctx.pacote.obra(this.programacao()?.idObra));
  readonly pontos = computed(() => (this.programacao() ? this.ctx.pontos(this.programacao()!) : []));
  readonly feitos = computed(() => this.pontos().filter(p => p.situacao === 'FEITO').length);
  readonly pendencias = computed(() => (this.programacao() ? this.ctx.pendencias(this.programacao()!) : []));
  readonly chegou = computed(() => (this.programacao() ? this.ctx.chegou(this.programacao()!) : false));
  readonly liberacao = computed(() => (this.programacao() ? this.ctx.liberacao(this.programacao()!) : 'PENDENTE'));
  readonly temCoordenada = computed(() => this.obra()?.latitude != null && this.obra()?.longitude != null);
  readonly comoChegar = computed(() => (this.obra() ? linkComoChegar(this.obra()!, /iPhone|iPad|Macintosh/.test(navigator.userAgent)) : null));
  readonly material = computed<MaterialPrevisto[]>(() => (this.programacao() ? materialPrevisto([this.programacao()!], this.saldo()) : []));
  readonly faltando = computed(() => this.material().filter(m => m.falta > 0).length);
  readonly aviso = computed(() => {
    const p = this.programacao();
    const novos = this.ctx.pacote.avisosNovos().filter(a => a.idProgramacao === p?.id);
    return novos.at(-1)?.texto ?? null;
  });

  readonly textoLiberacao = computed(() => ({
    LIBERADA: 'Concluída: serviço liberado',
    EM_PREENCHIMENTO: 'Em preenchimento',
    IMPEDIDA: 'Sem condição de executar registrada',
    PENDENTE: 'Faça antes de executar',
  })[this.liberacao()]);

  readonly passo = computed(() => {
    const p = this.programacao()!;
    if (!this.turno.turnoAtivo()) return { rotulo: 'Abrir turno', rota: '/turno/abrir', icone: 'relogio' };
    if (!this.chegou()) return { rotulo: 'Ir para a ficha da obra', rota: `/obras/${p.id}`, icone: 'navegar' };
    if (this.liberacao() !== 'LIBERADA') return { rotulo: this.liberacao() === 'EM_PREENCHIMENTO' ? 'Continuar a APR' : 'Fazer a APR', rota: `/obras/${p.id}/apr`, icone: 'escudo' };
    return { rotulo: 'Executar', rota: `/obras/${p.id}/execucao`, icone: 'ferramenta' };
  });

  async ngOnInit(): Promise<void> {
    const idEstoque = this.tokens.estoqueId();
    if (idEstoque) {
      const saldos = await db.saldos.where('idEstoque').equals(idEstoque).toArray();
      const mapa = new Map<string, number>();
      for (const s of saldos.filter(x => x.ativo && x.condicao === 'NOVO')) mapa.set(s.idMaterial, (mapa.get(s.idMaterial) ?? 0) + s.quantidade);
      this.saldo.set(mapa);
    }
    const obra = this.obra();
    if (obra?.latitude != null && obra.longitude != null) {
      const pos = await this.gps.agora(4000);
      if (pos) this.perto.set(distanciaMetros({ lat: pos.latitude, lon: pos.longitude }, { lat: obra.latitude, lon: obra.longitude! }) <= RAIO_CHEGADA_M);
    }
  }

  async presenca(): Promise<void> {
    const p = this.programacao();
    if (!p) return;
    if (!this.turno.turnoAtivo()) {
      this.toast.warning('Abra o turno antes de registrar a chegada.');
      return;
    }
    this.registrando.set(true);
    try {
      const tipo = this.chegou() ? 'SAIDA' : 'CHEGADA';
      const r = await this.ctx.registros.registrar({ tipo: 'PRESENCA', idObra: p.idObra, idProgramacao: p.id,
        comando: { idObra: p.idObra, idProgramacao: p.id, tipo } });
      this.toast.desfazer(tipo === 'CHEGADA' ? 'Chegada registrada' : 'Saída registrada', () => void this.ctx.registros.desfazer(r.id));
      if (tipo === 'CHEGADA') void this.ctx.pacote.marcarAvisosVistos();
    } finally {
      this.registrando.set(false);
    }
  }

  juntar(...partes: (string | null | undefined)[]): string {
    return partes.filter(p => !!p).join(' · ');
  }

  voltar(): void {
    void this.router.navigate(['/obras']);
  }

  dia(data: string): string {
    return diaCurto(data);
  }

  num(n: number): string {
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }
}
