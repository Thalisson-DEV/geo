import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AprovacaoAbastecimentoService, ItemParaAprovar, PedidoParaDecidir } from '../../core/frota/aprovacao-abastecimento.service';
import { ROTULO_CATEGORIA, formatarQuantidade } from '../../core/frota/abastecimento.models';
import { formatarMedicao, formatarPlaca, quandoChecklist } from '../../core/frota/checklist-veiculo.models';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { ToastService } from '../../core/ui/toast.service';
import { BarraTopoComponent, FolhaComponent, IconeComponent, VazioComponent, numeroBr } from '../../ui';

interface Passo { titulo: string; detalhe: string | null; estado: 'feito' | 'atual' | 'futuro' | 'erro' }

/**
 * O gestor decide o pedido no celular: confere o destino, o painel, os alertas e o que o
 * Bússola apontou, define a quantidade de cada item e aprova, ou reprova com motivo.
 */
@Component({
  selector: 'app-aprovacao-detalhe',
  standalone: true,
  imports: [BarraTopoComponent, FolhaComponent, IconeComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo [titulo]="pedido() && !pedido()!.abastecimento.podeAprovar ? 'Abastecimento' : 'Aprovar abastecimento'" [subtitulo]="subtitulo()" (voltar)="voltar()" />

    @if (carregando()) {
      <div class="geo-esqueletos" role="status" aria-busy="true" aria-label="Carregando">
        <div class="geo-esqueleto" style="height: 64px"></div><div class="geo-esqueleto" style="height: 160px"></div><div class="geo-esqueleto" style="height: 140px"></div>
      </div>
    } @else if (pedido(); as p) {
      @let a = p.abastecimento;
      @if (!a.podeAprovar) {
        <h2 class="geo-secao">Andamento</h2>
        <ol class="passos" aria-label="Andamento do pedido">
          @for (ps of passos(); track ps.titulo) {
            <li class="passo" [attr.data-estado]="ps.estado">
              <span class="passo__marca" aria-hidden="true">@if (ps.estado === 'feito') { <geo-icone nome="check" [tamanho]="14" /> }</span>
              <span class="passo__texto"><span class="passo__titulo">{{ ps.titulo }}</span>
                @if (ps.detalhe) { <span class="passo__detalhe">{{ ps.detalhe }}</span> }</span>
            </li>
          }
        </ol>
        <h2 class="geo-secao">Quantidades</h2>
        <ul class="geo-grupo">
          @for (i of a.itens; track i.id) {
            <li class="geo-linha item">
              <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ i.produtoPedido }}</span>
                <span class="geo-linha__apoio geo-num">{{ resumoQuantidades(i) }}</span></span>
              <span class="geo-qtd">{{ numero(quantidadeAtual(i)) }}<small>{{ i.unidade.toUpperCase() === 'L' ? 'l' : 'un' }}</small></span>
            </li>
          }
        </ul>
      }

      @if (p.analise; as an) {
        <section class="copiloto" [attr.data-tom]="an.parecer" aria-label="O que a Bússola apontou">
          <img src="icons/Bússola 1.png" alt="" aria-hidden="true">
          <div>
            <strong>A Bússola · {{ an.parecerRotulo }}</strong>
            <p>{{ an.resumo }}</p>
            @for (pt of atencao(); track pt.titulo) { <p class="copiloto__ponto"><b>{{ pt.titulo }}:</b> {{ pt.detalhe }}</p> }
            <span class="copiloto__nota">Ele só aponta; quem decide é você.</span>
          </div>
        </section>
      }

      @if (a.alertas.length) {
        <section class="geo-faixa-estado geo-faixa-estado--atencao" aria-label="Alertas">
          <geo-icone nome="alerta" [tamanho]="18" />
          <div>@for (al of a.alertas; track al.mensagem) { <p><b>{{ al.tipoRotulo }}:</b> {{ al.mensagem }}</p> }</div>
        </section>
      }

      <dl class="geo-dados">
        <div><dt>Destino</dt><dd><b>{{ a.destino ?? 'Não informado' }}</b></dd></div>
        <div><dt>Condutor</dt><dd>{{ a.condutor ?? '—' }}</dd></div>
        <div><dt>Posto</dt><dd>{{ a.posto }}</dd></div>
        <div><dt>{{ a.unidadeMedicao === 'HORAS' ? 'Horímetro' : 'KM' }} no pedido</dt><dd class="geo-num">{{ formatarMedicao(a.medicaoSolicitacao, a.unidadeMedicao) }}</dd></div>
        <div><dt>Tanque</dt><dd class="geo-num">{{ a.capacidadeTanque ? formatarQuantidade(a.capacidadeTanque, 'L') : 'Não informado na ficha' }}</dd></div>
        <div><dt>Pedido</dt><dd>{{ quando(a.solicitadoEm) }}{{ a.solicitante ? ' · ' + a.solicitante : '' }}</dd></div>
        @if (a.observacao) { <div><dt>Observação</dt><dd>{{ a.observacao }}</dd></div> }
      </dl>

      @if (fotos().length) {
        <h2 class="geo-secao">Painel</h2>
        <ul class="fotos">
          @for (f of fotos(); track f.id) {
            <li>
              <button type="button" class="foto" [class.foto--pronta]="!!urls()[f.id]" (click)="ampliar.set(urls()[f.id] ? { url: urls()[f.id], rotulo: f.tipoRotulo } : null)">
                @if (urls()[f.id]; as url) { <img [src]="url" [alt]="f.tipoRotulo"> } @else { <span>{{ f.recebida ? 'Carregando…' : 'Ainda no celular da equipe' }}</span> }
              </button>
              <span class="foto__rotulo">{{ f.tipoRotulo }}</span>
            </li>
          }
        </ul>
      }

      @if (a.podeAprovar) {
        <h2 class="geo-secao">Quanto abastecer</h2>
        <p class="dica">A equipe pediu só o produto. Defina a quantidade pelo destino; zero tira o item.</p>
        <ul class="geo-grupo">
          @for (i of a.itens; track i.id) {
            <li class="geo-linha item">
              <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ i.produtoPedido }}</span>
                <span class="geo-linha__apoio">{{ rotuloCategoria[i.categoria] }}</span></span>
              <label class="qtd" [class.qtd--erro]="tentou() && quantidades()[i.id] == null">
                <span class="geo-sr-only">Quantidade de {{ i.produtoPedido }}</span>
                <input class="geo-num" type="text" inputmode="decimal" autocomplete="off" placeholder="0" [value]="digitado(i)"
                  (input)="definir(i, $any($event.target).value)">
                <span>{{ i.unidade.toUpperCase() === 'L' ? 'l' : 'un' }}</span>
              </label>
            </li>
          }
        </ul>
        @if (acimaDoTanque(); as aviso) {
          <p class="geo-faixa-estado geo-faixa-estado--atencao" role="alert"><geo-icone nome="alerta" [tamanho]="18" /><span>{{ aviso }}</span></p>
        }
        @if (tentou() && erroQuantidades(); as erro) {
          <p class="geo-faixa-estado geo-faixa-estado--erro" role="alert"><geo-icone nome="alerta" [tamanho]="18" /><span>{{ erro }}</span></p>
        }
        <div class="geo-respiro"></div>
        <footer class="geo-rodape-acoes">
          <button type="button" class="geo-btn geo-btn--neutro" [disabled]="salvando()" (click)="reprovando.set(true)">Reprovar</button>
          <button type="button" class="geo-btn geo-btn--principal" [disabled]="salvando() || !rede.isOnline()" (click)="aprovar()">
            <geo-icone nome="check" [tamanho]="18" />{{ salvando() ? 'Aprovando…' : rede.isOnline() ? 'Aprovar' : 'Sem internet' }}</button>
        </footer>
      }
    } @else {
      <geo-vazio icone="combustivel" [titulo]="rede.isOnline() ? 'Pedido não encontrado' : 'Sem internet'"
        [texto]="erro() ?? 'Conecte para ver o pedido.'">
        <button type="button" class="geo-btn geo-btn--tonal" (click)="carregar()">Tentar de novo</button>
      </geo-vazio>
    }

    <geo-folha [aberta]="reprovando()" (fechar)="reprovando.set(false)" titulo="Reprovar o pedido?"
      descricao="A equipe vê o motivo no app e pode pedir de novo.">
      <div class="motivo">
        <label class="geo-campo">
          <span class="geo-campo__rotulo">Motivo</span>
          <textarea class="geo-input" rows="3" maxlength="400" placeholder="Ex.: abasteceu ontem e o painel mostra mais da metade do tanque"
            [value]="motivo()" (input)="motivo.set($any($event.target).value)"></textarea>
        </label>
      </div>
      <div rodape class="geo-folha-rodape">
        <button type="button" class="geo-btn geo-btn--neutro" (click)="reprovando.set(false)">Voltar</button>
        <button type="button" class="geo-btn geo-btn--perigo" [disabled]="salvando() || motivo().trim().length < 5" (click)="reprovar()">
          {{ salvando() ? 'Reprovando…' : 'Reprovar' }}</button>
      </div>
    </geo-folha>

    <geo-folha [aberta]="!!ampliar()" (fechar)="ampliar.set(null)" [titulo]="ampliar()?.rotulo ?? null">
      @if (ampliar()?.url; as url) { <img class="ampliada" [src]="url" [alt]="ampliar()!.rotulo"> }
    </geo-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    :host > * { flex-shrink: 0; }
    .copiloto { display: flex; gap: var(--geo-e3); margin: var(--geo-e3) var(--geo-e3) 0; padding: var(--geo-e3) var(--geo-e4);
      border-radius: var(--geo-r-grupo); background: var(--geo-destaque-suave); border-left: 4px solid var(--geo-destaque); }
    .copiloto[data-tom='ATENCAO'] { border-left-color: var(--geo-atencao); }
    .copiloto[data-tom='CRITICO'] { border-left-color: var(--geo-erro); }
    .copiloto img { width: 40px; height: 40px; border-radius: 50%; background: var(--geo-superficie); flex: none; }
    .copiloto div { display: grid; gap: 4px; min-width: 0; }
    .copiloto p { margin: 0; font: var(--geo-t-apoio); color: var(--geo-texto); }
    .copiloto__nota { font: var(--geo-t-apoio); color: var(--geo-texto-2); font-size: .8125rem; }
    .dica { margin: 0 var(--geo-e5) var(--geo-e2); font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .item { align-items: center; }
    .qtd { display: flex; align-items: center; gap: 6px; min-height: 56px; padding: 0 var(--geo-e3); border-radius: var(--geo-r-campo, 12px);
      border: 1.5px solid var(--geo-linha-forte); background: var(--geo-fundo); }
    .qtd--erro { border-color: var(--geo-erro); }
    .qtd input { width: 84px; border: 0; background: transparent; font: var(--geo-t-numero); font-size: 1.25rem; text-align: right; color: var(--geo-texto); outline: none; }
    .fotos { list-style: none; margin: 0; padding: 0 var(--geo-e3); display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--geo-e3); }
    .fotos li { display: grid; gap: 6px; }
    .foto { position: relative; display: grid; place-content: center; aspect-ratio: 4 / 3; overflow: hidden; padding: 0; border-radius: var(--geo-r-grupo);
      border: 1.5px dashed var(--geo-linha-forte); background: var(--geo-superficie); color: var(--geo-texto-2); font: var(--geo-t-apoio); }
    .foto--pronta { border: 0; cursor: pointer; }
    .foto img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .foto__rotulo { font: var(--geo-t-apoio); color: var(--geo-texto); }
    .motivo { padding: 0 var(--geo-e4); }
    .passos { list-style: none; margin: 0 var(--geo-e3); padding: var(--geo-e3) var(--geo-e4); border-radius: var(--geo-r-grupo); background: var(--geo-superficie); }
    .passo { position: relative; display: flex; gap: var(--geo-e3); padding-bottom: var(--geo-e4); }
    .passo:last-child { padding-bottom: 0; }
    .passo:not(:last-child)::before { content: ''; position: absolute; left: 11px; top: 26px; bottom: 2px; width: 2px; background: var(--geo-linha); }
    .passo__marca { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%;
      border: 2px solid var(--geo-linha-forte); background: var(--geo-fundo); color: var(--geo-fundo); }
    .passo[data-estado='feito'] .passo__marca { border-color: var(--geo-ok); background: var(--geo-ok); }
    .passo[data-estado='atual'] .passo__marca { border-color: var(--geo-destaque); box-shadow: inset 0 0 0 4px var(--geo-destaque-suave); }
    .passo[data-estado='erro'] .passo__marca { border-color: var(--geo-erro); background: var(--geo-erro-suave); }
    .passo__texto { display: grid; gap: 2px; min-width: 0; padding-top: 2px; }
    .passo__titulo { font: 600 1rem/1.3 var(--geo-fonte); color: var(--geo-texto); }
    .passo[data-estado='futuro'] .passo__titulo { color: var(--geo-texto-2); font-weight: 500; }
    .passo[data-estado='erro'] .passo__titulo { color: var(--geo-erro); }
    .passo__detalhe { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .ampliada { display: block; width: 100%; height: auto; border-radius: var(--geo-r-grupo); }
  `]
})
export class AprovacaoDetalheComponent implements OnInit, OnDestroy {
  private readonly servico = inject(AprovacaoAbastecimentoService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly rede = inject(ConnectivityService);

  private readonly id = this.rota.snapshot.paramMap.get('id')!;
  protected readonly pedido = signal<PedidoParaDecidir | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal<string | null>(null);
  protected readonly quantidades = signal<Record<string, number | null>>({});
  private readonly textos = new Map<string, string>();
  protected readonly urls = signal<Record<string, string>>({});
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly reprovando = signal(false);
  protected readonly motivo = signal('');
  protected readonly ampliar = signal<{ url: string; rotulo: string } | null>(null);
  protected readonly rotuloCategoria = ROTULO_CATEGORIA;
  protected readonly formatarMedicao = formatarMedicao;
  protected readonly formatarQuantidade = formatarQuantidade;

  protected readonly subtitulo = computed(() => {
    const a = this.pedido()?.abastecimento;
    return a ? `${formatarPlaca(a.placa)}${a.veiculoDescricao ? ' · ' + a.veiculoDescricao : ''}` : '';
  });
  protected readonly fotos = computed(() => this.pedido()?.abastecimento.fotos.filter((f) => f.tipo === 'PAINEL_ANTES') ?? []);
  protected readonly atencao = computed(() => (this.pedido()?.analise?.pontos ?? []).filter((p) => p.gravidade !== 'INFO').slice(0, 3));
  protected readonly erroQuantidades = computed(() => {
    const itens = this.pedido()?.abastecimento.itens ?? [];
    const q = this.quantidades();
    if (itens.some((i) => q[i.id] == null || q[i.id]! < 0)) return 'Informe a quantidade de cada item (zero tira o item).';
    if (itens.every((i) => !q[i.id])) return 'Aprove ao menos um item com quantidade. Se nada deve ser abastecido, reprove.';
    return null;
  });
  protected readonly acimaDoTanque = computed(() => {
    const a = this.pedido()?.abastecimento;
    const combustivel = a?.itens.find((i) => i.categoria === 'COMBUSTIVEL');
    const litros = combustivel ? this.quantidades()[combustivel.id] : null;
    return a?.capacidadeTanque && litros && litros > a.capacidadeTanque
      ? `${formatarQuantidade(litros, 'L')} passa a capacidade do tanque (${formatarQuantidade(a.capacidadeTanque, 'L')}).`
      : null;
  });

  /** O caminho do pedido: aprovação do gestor, liberação ao posto e abastecimento da equipe. */
  protected readonly passos = computed<Passo[]>(() => {
    const a = this.pedido()?.abastecimento;
    if (!a) return [];
    const quem = (nome: string | null, em: string | null) => [nome, em ? quandoChecklist(em) : null].filter(Boolean).join(' · ');
    const passos: Passo[] = [{ titulo: 'Pedido pela equipe', detalhe: quem(a.solicitante, a.solicitadoEm), estado: 'feito' }];
    if (a.situacao === 'REPROVADA') {
      passos.push({ titulo: 'Reprovado', detalhe: [quem(a.aprovador, a.aprovadoEm), a.motivoReprovacao].filter(Boolean).join(' · '), estado: 'erro' });
      return passos;
    }
    const aguardando = a.situacao === 'AGUARDANDO_APROVACAO';
    passos.push(a.aprovadoEm
      ? { titulo: 'Aprovado', detalhe: quem(a.aprovador, a.aprovadoEm), estado: 'feito' }
      : { titulo: 'Aprovação', detalhe: aguardando ? 'Esperando o gestor da placa' : null, estado: aguardando ? 'atual' : 'futuro' });
    const aprovada = a.situacao === 'APROVADA';
    passos.push(a.liberadoEm
      ? { titulo: 'Liberado ao posto', detalhe: quem(a.liberador, a.liberadoEm), estado: 'feito' }
      : { titulo: 'Liberação', detalhe: aprovada ? 'Esperando a liberação do administrativo' : null, estado: aprovada ? 'atual' : 'futuro' });
    if (a.situacao === 'CANCELADA') {
      passos.push({ titulo: 'Cancelado', detalhe: [quem(a.cancelador, a.canceladoEm), a.motivoCancelamento].filter(Boolean).join(' · '), estado: 'erro' });
    } else if (a.situacao === 'VENCIDA') {
      passos.push({ titulo: 'Venceu sem abastecer', detalhe: a.venceEm ? 'O pedido valia até ' + quandoChecklist(a.venceEm) : null, estado: 'erro' });
    } else if (a.realizadoEm) {
      passos.push({ titulo: 'Abastecido', detalhe: quem(null, a.realizadoEm), estado: 'feito' });
    } else {
      const liberada = a.situacao === 'LIBERADA';
      passos.push({ titulo: 'Abastecimento', detalhe: liberada ? 'A equipe pode abastecer até o fim do dia' : null, estado: liberada ? 'atual' : 'futuro' });
    }
    return passos;
  });

  ngOnInit(): void {
    void this.carregar();
  }

  ngOnDestroy(): void {
    Object.values(this.urls()).forEach((u) => URL.revokeObjectURL(u));
  }

  protected async carregar(): Promise<void> {
    if (!this.rede.isOnline()) {
      this.carregando.set(false);
      return;
    }
    this.carregando.set(true);
    this.erro.set(null);
    try {
      const p = await this.servico.detalhar(this.id);
      this.pedido.set(p);
      this.quantidades.set(Object.fromEntries(p.abastecimento.itens.map((i) => [i.id, i.quantidadePedida])));
      for (const f of p.abastecimento.fotos.filter((x) => x.recebida && x.tipo === 'PAINEL_ANTES')) {
        void this.servico.foto(this.id, f.id).then((blob) => this.urls.update((u) => ({ ...u, [f.id]: URL.createObjectURL(blob) }))).catch(() => undefined);
      }
    } catch (e) {
      this.erro.set((e as { detail?: string }).detail ?? null);
    } finally {
      this.carregando.set(false);
    }
  }

  protected digitado(i: ItemParaAprovar): string {
    const valor = this.quantidades()[i.id];
    return this.textos.get(i.id) ?? (valor == null ? '' : String(valor).replace('.', ','));
  }

  protected definir(i: ItemParaAprovar, texto: string): void {
    this.textos.set(i.id, texto);
    const limpo = texto.replace(/[^\d,]/g, '');
    const n = limpo ? Number(limpo.replace(',', '.')) : null;
    this.quantidades.update((q) => ({ ...q, [i.id]: n !== null && Number.isFinite(n) ? n : null }));
  }

  protected async aprovar(): Promise<void> {
    this.tentou.set(true);
    if (this.erroQuantidades()) return;
    this.salvando.set(true);
    try {
      const q = this.quantidades();
      await this.servico.aprovar(this.id, Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v ?? 0])));
      this.toast.success(`Abastecimento de ${this.subtitulo()} aprovado. Vai para a liberação.`);
      await this.router.navigate(['/abastecimento/aprovacoes']);
    } catch {
      // O interceptor já mostra a mensagem do servidor.
    } finally {
      this.salvando.set(false);
    }
  }

  protected async reprovar(): Promise<void> {
    this.salvando.set(true);
    try {
      await this.servico.reprovar(this.id, this.motivo().trim());
      this.reprovando.set(false);
      this.toast.success('Pedido reprovado. A equipe vê o motivo no app.');
      await this.router.navigate(['/abastecimento/aprovacoes']);
    } catch {
      // O interceptor já mostra a mensagem do servidor.
    } finally {
      this.salvando.set(false);
    }
  }

  /** A quantidade que vale agora: entregue, senão liberada, senão aprovada. */
  protected quantidadeAtual(i: ItemParaAprovar): number | null {
    return i.quantidade ?? i.quantidadeLiberada ?? i.quantidadeAprovada ?? i.quantidadePedida;
  }

  protected resumoQuantidades(i: ItemParaAprovar): string {
    if (this.quantidadeAtual(i) === 0) return 'Tirado do pedido';
    const un = i.unidade.toUpperCase() === 'L' ? ' l' : ' un';
    const partes = [
      i.quantidadeAprovada != null ? 'Aprovado ' + numeroBr(i.quantidadeAprovada) + un : null,
      i.quantidadeLiberada != null ? 'Liberado ' + numeroBr(i.quantidadeLiberada) + un : null,
      i.quantidade != null ? 'Abastecido ' + numeroBr(i.quantidade) + un : null,
    ].filter(Boolean);
    return partes.join(' · ') || 'Sem quantidade definida';
  }

  protected numero(n: number | null): string {
    return n == null ? '—' : numeroBr(n);
  }

  protected quando(iso: string): string {
    return quandoChecklist(iso);
  }

  protected voltar(): void {
    void this.router.navigate(['/abastecimento/aprovacoes']);
  }
}
