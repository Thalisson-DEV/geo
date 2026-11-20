import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlmoxService } from '../../core/almox/almox.service';
import { Colaborador } from '../../core/almox/almox.models';
import { FechamentoDetalhe } from '../../core/fechamento/fechamento.models';
import { erroPorItem, mensagemFalha, rotuloObra } from '../../core/fechamento/fechamento-ui';
import { FechamentoService, SupervisorFechamento } from '../../core/fechamento/fechamento.service';
import { ApiError } from '../../core/http/error.interceptor';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { ToastService } from '../../core/ui/toast.service';
import { BarraTopoComponent, IconeComponent, IndicadorRedeComponent, OpcaoSeletor, SeletorComponent, VazioComponent } from '../../ui';
import { BaseFechamento } from './fechamento.routes';
import { LinhaFechamento, LinhasFechamentoComponent } from './linhas-fechamento.component';

const SEM_RESPONSAVEL = '';

/**
 * Edição da solicitação: materiais, quantidades, responsáveis e observação. A quantidade não
 * fica abaixo do que já foi movimentado; a recusa do backend aparece junto do material.
 */
@Component({
  selector: 'app-fechamento-editar',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, IndicadorRedeComponent, LinhasFechamentoComponent, SeletorComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tela">
      <geo-barra-topo titulo="Editar solicitação" [subtitulo]="det() ? det()!.tipo + ' · ' + obra() : 'Carregando…'" navegacao="fechar" rotuloFechar="Fechar sem salvar" (voltar)="fechar()">
        <geo-indicador-rede />
      </geo-barra-topo>

      @if (carregando()) {
        <div class="geo-esqueletos" aria-busy="true"><div class="geo-esqueleto" style="height: 240px"></div><div class="geo-esqueleto" style="height: 128px"></div></div>
      } @else if (erro()) {
        <geo-vazio icone="alerta" titulo="Não foi possível abrir a edição" [texto]="erro()">
          <button type="button" class="geo-btn geo-btn--tonal" (click)="carregar()">Tentar de novo</button>
        </geo-vazio>
      } @else if (det()) {
        <h2 class="geo-secao"><span>Materiais</span><span class="geo-num">{{ linhas().length }}</span></h2>
        <app-linhas-fechamento [linhas]="linhas()" (linhasChange)="linhas.set($event)" />
        @if (tentou() && !linhas().length) { <p class="geo-campo__erro erro" role="alert"><geo-icone nome="alerta" [tamanho]="16" />Inclua ao menos um material. Para desistir, cancele a solicitação.</p> }

        <h2 class="geo-secao"><span>Responsáveis</span></h2>
        <div class="campos">
          <geo-seletor rotulo="Encarregado" placeholder="Não informar" [opcoes]="opcoesEncarregado()" [valor]="idEncarregado() ?? semResponsavel" (valorChange)="idEncarregado.set($event || null)" />
          <geo-seletor rotulo="Supervisor" placeholder="Não informar" [opcoes]="opcoesSupervisor()" [valor]="idSupervisor() ?? semResponsavel" (valorChange)="idSupervisor.set($event || null)" />
        </div>

        <h2 class="geo-secao"><span>Observação</span></h2>
        <div class="campos">
          <label class="geo-campo">
            <span class="geo-sr-only">Observação para o almoxarifado</span>
            <textarea class="geo-input texto" rows="3" maxlength="1000" [value]="observacao()" (input)="observacao.set($any($event.target).value)" placeholder="Informação para o almoxarifado"></textarea>
          </label>
        </div>
      }
    </div>

    @if (det()) {
      <footer class="rodape" data-acao-fixa>
        <button type="button" class="geo-btn geo-btn--principal principal" (click)="salvar()" [disabled]="enviando() || !rede.isOnline()">
          {{ enviando() ? 'Salvando…' : !rede.isOnline() ? 'Sem internet' : 'Salvar alterações' }}</button>
      </footer>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    :host > * { flex-shrink: 0; }
    .tela { flex: 1; padding-bottom: var(--geo-e5); }
    .campos { display: grid; gap: var(--geo-e2); padding: var(--geo-e2) var(--geo-e3); }
    .erro { margin: var(--geo-e2) var(--geo-e5) 0; }
    .texto { min-height: 88px; padding: var(--geo-e3) var(--geo-e4); resize: vertical; }
    .rodape { position: sticky; bottom: 0; z-index: 5; display: flex; padding: var(--geo-e3) var(--geo-e4) calc(var(--geo-e3) + var(--geo-safe-base));
      background: var(--geo-fundo); border-top: 1px solid var(--geo-linha); }
    .rodape .principal { flex: 1; min-height: var(--geo-alvo-principal); font-size: 1rem; }
  `],
})
export class FechamentoEditarComponent {
  private readonly fechamento = inject(FechamentoService);
  private readonly almox = inject(AlmoxService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly rotaAtual = inject(ActivatedRoute).snapshot;
  readonly rede = inject(ConnectivityService);

  private readonly base = this.rotaAtual.data['base'] as BaseFechamento;
  readonly id = this.rotaAtual.paramMap.get('id') ?? '';
  readonly semResponsavel = SEM_RESPONSAVEL;

  readonly det = signal<FechamentoDetalhe | null>(null);
  readonly linhas = signal<LinhaFechamento[]>([]);
  readonly idEncarregado = signal<string | null>(null);
  readonly idSupervisor = signal<string | null>(null);
  readonly observacao = signal('');
  readonly colaboradores = signal<Colaborador[]>([]);
  readonly supervisores = signal<SupervisorFechamento[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly enviando = signal(false);
  readonly tentou = signal(false);

  readonly obra = computed(() => (this.det() ? rotuloObra(this.det()!.obra) : ''));
  /** A pessoa já escolhida continua na lista mesmo fora da página de colaboradores carregada. */
  readonly opcoesEncarregado = computed<OpcaoSeletor[]>(() => {
    const atual = this.det()?.encarregado;
    const opcoes = this.colaboradores().map(c => ({ valor: c.id, rotulo: c.nomeCompleto }));
    const falta = atual?.nome && !opcoes.some(o => o.valor === atual.id);
    return [{ valor: SEM_RESPONSAVEL, rotulo: 'Não informar' }, ...(falta ? [{ valor: atual.id, rotulo: atual.nome! }] : []), ...opcoes];
  });
  readonly opcoesSupervisor = computed<OpcaoSeletor[]>(() => {
    const atual = this.det()?.supervisor;
    const opcoes = this.supervisores().map(s => ({ valor: s.id, rotulo: s.nomeColaborador, apoio: s.nomeCoordenador ? `Coordenador: ${s.nomeCoordenador}` : null }));
    const falta = atual?.nome && !opcoes.some(o => o.valor === atual.id);
    return [{ valor: SEM_RESPONSAVEL, rotulo: 'Não informar' }, ...(falta ? [{ valor: atual.id, rotulo: atual.nome! }] : []), ...opcoes];
  });

  constructor() {
    this.almox.colaboradores().subscribe({ next: c => this.colaboradores.set(c), error: () => undefined });
    this.fechamento.supervisores().subscribe(s => this.supervisores.set(s));
    queueMicrotask(() => this.carregar());
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.fechamento.detalhe(this.id).subscribe({
      next: d => {
        if (!d.acoes.editar) {
          this.toast.info('Esta solicitação não pode mais ser editada.');
          void this.router.navigate([this.base, d.id], { replaceUrl: true });
          return;
        }
        this.det.set(d);
        this.linhas.set(d.itens.map(i => ({
          idItem: i.id, idMaterial: i.idMaterial, codigo: i.codigoMaterial, descricao: i.descricaoMaterial, unidade: i.unidade || 'UN', quantidade: i.quantidade,
          minimo: i.quantidadeMovimentada, removivel: i.removivel,
        })));
        this.idEncarregado.set(d.encarregado?.id ?? null);
        this.idSupervisor.set(d.supervisor?.id ?? null);
        this.observacao.set(d.observacao ?? '');
        this.carregando.set(false);
      },
      error: (e: ApiError) => { this.carregando.set(false); this.erro.set(e.status === 0 ? 'Sem conexão com o servidor.' : e.detail || 'Tente de novo.'); },
    });
  }

  salvar(): void {
    const d = this.det();
    this.tentou.set(true);
    if (!d || this.enviando() || !this.linhas().length) return;
    this.enviando.set(true);
    this.fechamento.editar(d.id, {
      versaoEsperada: d.versao, idEncarregado: this.idEncarregado(), idSupervisor: this.idSupervisor(), observacao: this.observacao().trim() || null,
      itens: this.linhas().map(l => ({ idItem: l.idItem ?? null, idMaterial: l.idMaterial, quantidade: l.quantidade })),
    }).subscribe({
      next: atualizada => {
        this.enviando.set(false);
        this.toast.success('Solicitação atualizada.');
        void this.router.navigate([this.base, atualizada.id], { replaceUrl: true });
      },
      error: (e: ApiError) => {
        this.enviando.set(false);
        const porItem = erroPorItem(e, this.linhas().map(l => l.quantidade));
        if (porItem.size) this.linhas.update(l => l.map((x, i) => ({ ...x, erro: porItem.get(i) ?? null })));
        else this.toast.error(mensagemFalha(e, 'Não foi possível salvar.'));
        if (e.status === 409) this.carregar();
      },
    });
  }

  fechar(): void {
    void this.router.navigate([this.base, this.id], { replaceUrl: true });
  }
}
