import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import {
  BarraTopoComponent, FolhaComponent, FotoExibida, FotosComponent, IconeComponent, LeitorCodigoComponent, QuantidadeComponent,
  SegmentadoComponent, VazioComponent,
} from '../../ui';
import { LayoutService } from '../../core/plataforma/layout.service';
import { ToastService } from '../../core/ui/toast.service';
import { TurnoService } from '../../core/turno/turno.service';
import { ArquivosCampoService } from '../../core/obras/arquivos-campo.service';
import { LocalizacaoService, Posicao } from '../../core/obras/localizacao.service';
import { PontoDaExecucao, aprQueLibera, pendenciasDeFoto } from '../../core/obras/obras-regras';
import { linhasDoCarimbo } from '../../core/fotos/carimbo';
import { EvidenciaPreparada } from '../../core/sst/evidencia-foto.util';
import { ObrasContexto } from './obras-contexto';
import { MarcadorPonto, ProjetoPdfComponent } from './projeto-pdf.component';

type Vista = 'pontos' | 'projeto';
type Etapa = 'ANTES' | 'DURANTE' | 'DEPOIS';

/**
 * Execução sobre o projeto. Cada ponto mostra os itens programados; "Tudo feito" aponta o ponto inteiro com um toque e
 * "Parcial" abre as quantidades. As fotos do modelo vêm por item, com carimbo; foto faltando avisa e vira pendência, sem
 * bloquear. No tablet deitado: projeto à esquerda e o ponto à direita; no celular, o ponto abre numa folha.
 */
@Component({
  selector: 'app-execucao',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, FolhaComponent, FotosComponent, QuantidadeComponent, SegmentadoComponent,
    VazioComponent, LeitorCodigoComponent, ProjetoPdfComponent, RouterLink, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.dividido]': 'layout.expandido()' },
  template: `
    @if (programacao(); as p) {
      <geo-barra-topo titulo="Pontos e projeto" [subtitulo]="'Obra ' + (p.numeroObra ?? '') + ' · #' + p.numero + ' · ' + feitos() + ' de ' + pontos().length + ' feitos'" (voltar)="voltar()" />

      @if (liberacao() !== 'LIBERADA') {
        <div class="faixa" role="status">
          <geo-icone [nome]="liberacao() === 'IMPEDIDA' ? 'impedido' : 'escudo'" />
          <span>{{ liberacao() === 'IMPEDIDA' ? 'Registrado "sem condição de executar". Para voltar a executar nesta obra, conclua uma nova APR.' : 'Conclua a APR do dia antes de marcar o que foi feito.' }}</span>
          <a class="geo-btn geo-btn--principal geo-btn--compacto" [routerLink]="['/obras', p.id, 'apr']">{{ liberacao() === 'IMPEDIDA' ? 'Nova APR' : 'Fazer APR' }}</a>
        </div>
      }

      @if (!layout.expandido()) {
        <div class="vista"><geo-segmentado rotulo="Ver" [opcoes]="vistas" [(valor)]="vista" /></div>
      }

      <div class="colunas">
        @if (layout.expandido() || vista() === 'projeto') {
          <section class="projeto" aria-label="Projeto">
            <app-projeto-pdf [arquivo]="pdf()" [marcadores]="marcadores()" [selecionado]="selecionado()" (escolhido)="escolher($event)" />
          </section>
        }
        @if (layout.expandido() || vista() === 'pontos') {
          <section class="lado" aria-label="Pontos">
            @if (layout.expandido() && pontoSelecionado(); as ponto) {
              <ng-container *ngTemplateOutlet="detalhe; context: { $implicit: ponto }" />
            } @else {
              <ul class="geo-grupo pontos">
                @for (ponto of pontos(); track ponto.id) {
                  <li class="geo-linha" [attr.data-testid]="'ponto-' + ponto.numero">
                    <button type="button" class="abrir" (click)="escolher(ponto.id)" [attr.aria-label]="'Abrir ' + ponto.rotulo">
                      <span class="geo-selo" [class.geo-selo--ok]="ponto.situacao === 'FEITO'" [class.geo-selo--atencao]="ponto.situacao === 'PARCIAL'">
                        <geo-icone [nome]="ponto.situacao === 'FEITO' ? 'check' : 'local'" /></span>
                      <span class="geo-linha__texto">
                        <span class="geo-linha__titulo">{{ ponto.rotulo }}</span>
                        <span class="geo-linha__apoio">{{ resumoItens(ponto) }}{{ pendenciasDoPonto(ponto.id) ? ' · ' + fotosPendentes(pendenciasDoPonto(ponto.id)) : '' }}</span>
                      </span>
                    </button>
                    @if (ponto.situacao !== 'FEITO') {
                      <button type="button" class="geo-btn geo-btn--neutro geo-btn--compacto" [disabled]="liberacao() !== 'LIBERADA'"
                        (click)="tudoFeito(ponto)" [attr.data-testid]="'tudo-feito-' + ponto.numero">Tudo feito</button>
                    } @else {
                      <span class="geo-etiqueta geo-etiqueta--ok">Feito</span>
                    }
                    @if (ponto.situacao === 'PARCIAL') { <span class="geo-etiqueta geo-etiqueta--atencao parcial">Parcial</span> }
                  </li>
                }
              </ul>
              @if (!pontos().length) { <geo-vazio icone="local" titulo="Nenhum ponto nesta programação" /> }
              @if (pendencias().length) {
                <p class="nota"><geo-icone nome="camera" [tamanho]="16" /> {{ fotosPendentes(pendencias().length) }} do modelo. Tire quando puder; não bloqueia o envio.</p>
              }
              <div class="geo-respiro"></div>
            }
          </section>
        }
      </div>

      @if (!layout.expandido()) {
        <geo-folha [aberta]="!!pontoSelecionado()" [titulo]="pontoSelecionado()?.rotulo ?? null" (fechar)="selecionado.set(null)">
          @if (pontoSelecionado(); as ponto) { <ng-container *ngTemplateOutlet="detalhe; context: { $implicit: ponto }" /> }
        </geo-folha>
      }

      <ng-template #detalhe let-ponto>
        <div class="detalhe" data-testid="detalhe-ponto">
          @if (layout.expandido()) {
            <div class="detalhe__topo">
              <button type="button" class="geo-btn geo-btn--texto geo-btn--compacto" (click)="selecionado.set(null)"><geo-icone nome="voltar" />Pontos</button>
              <h2>{{ ponto.rotulo }}</h2>
            </div>
          }
          <ul class="itens">
            @for (item of ponto.itens; track item.idItem) {
              <li>
                <span class="item__texto"><strong>{{ item.descricao }}</strong>
                  <span class="geo-num">{{ num(item.feito) }} de {{ num(item.quantidade) }} {{ item.unidade ?? '' }}{{ item.tipo === 'MATERIAL' ? ' · material' : '' }}</span></span>
                @if (parcial()) {
                  <geo-quantidade [minimo]="0" [rotulo]="'Feito agora de ' + item.descricao" [unidade]="item.unidade" [valor]="quantidades()[item.idItem] ?? 0"
                    (valorChange)="definirQuantidade(item.idItem, $event)" />
                } @else if (item.feito >= item.quantidade) {
                  <geo-icone nome="check" />
                }
              </li>
            }
          </ul>
          @if (ponto.situacao !== 'FEITO') {
            <div class="acoes">
              @if (!parcial()) {
                <button type="button" class="geo-btn geo-btn--principal" [disabled]="liberacao() !== 'LIBERADA'" (click)="tudoFeito(ponto)" data-testid="tudo-feito">
                  <geo-icone nome="tudo_feito" />Tudo feito</button>
                <button type="button" class="geo-btn geo-btn--neutro" [disabled]="liberacao() !== 'LIBERADA'" (click)="parcial.set(true)">Parcial</button>
              } @else {
                <button type="button" class="geo-btn geo-btn--principal" (click)="salvarParcial(ponto)" [disabled]="!temQuantidade()">Salvar parcial</button>
                <button type="button" class="geo-btn geo-btn--neutro" (click)="parcial.set(false)">Cancelar</button>
              }
            </div>
          }

          <h3 class="geo-secao">Fotos do ponto</h3>
          <div class="etapa"><geo-segmentado rotulo="Etapa da foto" [opcoes]="etapas" [(valor)]="etapa" /></div>
          @if (liberacao() !== 'LIBERADA' && ponto.situacao !== 'FEITO') { <p class="motivo">Conclua a APR para marcar o que foi feito.</p> }
          @for (item of itensFoto(); track item.id) {
            <div class="foto-item">
              <div class="foto-item__titulo"><span>{{ item.titulo }}{{ item.obrigatoria ? '' : ' (opcional)' }}</span>
                @if (item.obrigatoria && !temFoto(ponto.id, item.id) && ponto.situacao !== 'A_FAZER') { <span class="geo-etiqueta geo-etiqueta--erro">Pendente</span> }</div>
              <geo-fotos [rotulo]="item.titulo + (item.obrigatoria ? '' : ' (opcional)')" [fotos]="fotosDoItem(ponto.id, item.id)"
                [carimbo]="carimbo(ponto, item.titulo)" [removivel]="false" [galeria]="false" (adicionada)="foto(ponto, item.id, $event)" />
            </div>
          }
          <div class="foto-item">
            <div class="foto-item__titulo"><span>Equipamento instalado (placa ou QR)</span></div>
            <geo-fotos rotulo="Equipamento instalado (placa ou QR)" [fotos]="fotosDoItem(ponto.id, 'EQUIPAMENTO')" [carimbo]="carimbo(ponto, 'Equipamento ' + (serie() || ''))"
              [removivel]="false" (adicionada)="foto(ponto, 'EQUIPAMENTO', $event)" />
            <div class="serie">
              <label class="geo-campo"><span>Série do equipamento</span>
                <input class="geo-input geo-num" [value]="serie()" (input)="serie.set($any($event.target).value)" maxlength="80" placeholder="Leia o QR ou digite"></label>
              <button type="button" class="geo-btn geo-btn--neutro" (click)="lendo.set(true)" aria-label="Ler série pelo QR"><geo-icone nome="qr" />Ler</button>
            </div>
          </div>
        </div>
      </ng-template>

      <geo-folha [aberta]="lendo()" titulo="Ler a série" (fechar)="lendo.set(false)">
        @if (lendo()) { <geo-leitor-codigo (lido)="serieLida($event)" /> }
      </geo-folha>
    } @else {
      <geo-barra-topo titulo="Execução" (voltar)="voltar()" />
      <geo-vazio icone="obra" titulo="Programação não está no aparelho" />
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; }
    .faixa { display: flex; gap: var(--geo-e3); align-items: center; margin: var(--geo-e3) var(--geo-margem) 0; padding: var(--geo-e3) var(--geo-e4);
      border-radius: var(--geo-r-grupo); background: var(--geo-atencao-suave); font: var(--geo-t-apoio); }
    .faixa span { flex: 1; }
    .vista { padding: var(--geo-e3) var(--geo-margem) 0; }
    .colunas { flex: 1; display: block; padding-top: var(--geo-e3); }
    :host(.dividido) .colunas { display: grid; grid-template-columns: 1fr 1fr; gap: 0; min-height: 0; }
    :host(.dividido) .projeto, :host(.dividido) .lado { overflow-y: auto; }
    :host(.dividido) .lado { border-left: 1px solid var(--geo-linha); }
    .pontos .geo-linha { gap: var(--geo-e2); }
    .abrir { flex: 1; display: flex; align-items: center; gap: var(--geo-e3); min-width: 0; min-height: var(--geo-alvo); border: 0; background: none;
      color: inherit; text-align: left; font: inherit; cursor: pointer; padding: 0; }
    .nota { display: flex; align-items: center; gap: var(--geo-e2); margin: var(--geo-e3) var(--geo-margem) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .detalhe { padding: 0 0 var(--geo-e6); }
    .detalhe__topo { display: flex; align-items: center; gap: var(--geo-e2); padding: var(--geo-e2) var(--geo-margem); }
    .detalhe__topo h2 { font: var(--geo-t-secao); }
    .itens { list-style: none; margin: 0; padding: 0 var(--geo-margem); display: grid; gap: var(--geo-e3); }
    .itens li { display: flex; align-items: center; gap: var(--geo-e3); justify-content: space-between; min-height: var(--geo-alvo); }
    .item__texto { display: grid; gap: 2px; font: var(--geo-t-corpo); }
    .item__texto span { font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .acoes { display: flex; gap: var(--geo-e3); padding: var(--geo-e4) var(--geo-margem) 0; }
    .acoes .geo-btn { flex: 1; min-height: var(--geo-alvo-principal); }
    .etapa { padding: 0 var(--geo-margem); }
    .foto-item { margin-top: var(--geo-e4); padding: 0 var(--geo-margem); }
    .foto-item__titulo { display: flex; align-items: center; justify-content: space-between; gap: var(--geo-e2); margin-bottom: var(--geo-e2); font: var(--geo-t-corpo-forte); }
    .serie { display: flex; gap: var(--geo-e2); align-items: end; margin-top: var(--geo-e4); }
    .motivo { margin: var(--geo-e3) var(--geo-margem) 0; font: var(--geo-t-apoio); color: var(--geo-texto-2); }
    .parcial { margin-left: var(--geo-e2); }
    .serie .geo-campo { flex: 1; margin: 0; }
  `],
})
export class ExecucaoComponent implements OnDestroy {
  readonly ctx = inject(ObrasContexto);
  readonly layout = inject(LayoutService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly turno = inject(TurnoService);
  private readonly arquivos = inject(ArquivosCampoService);
  private readonly gps = inject(LocalizacaoService);

  readonly vistas = [{ valor: 'pontos' as Vista, rotulo: 'Pontos' }, { valor: 'projeto' as Vista, rotulo: 'Projeto' }];
  readonly etapas = [{ valor: 'ANTES' as Etapa, rotulo: 'Antes' }, { valor: 'DURANTE' as Etapa, rotulo: 'Durante' }, { valor: 'DEPOIS' as Etapa, rotulo: 'Depois' }];
  readonly vista = signal<Vista>('pontos');
  readonly etapa = signal<Etapa>('DEPOIS');
  readonly selecionado = signal<string | null>(null);
  readonly parcial = signal(false);
  readonly quantidades = signal<Record<string, number>>({});
  readonly serie = signal('');
  readonly lendo = signal(false);
  readonly pdf = signal<Blob | null>(null);
  readonly miniaturas = signal<Record<string, string>>({});
  private posicao: Posicao | null = null;

  readonly id = toSignal(this.rota.paramMap.pipe(map(p => p.get('id') ?? '')), { initialValue: '' });
  readonly programacao = computed(() => this.ctx.pacote.programacao(this.id()));
  readonly obra = computed(() => this.ctx.pacote.obra(this.programacao()?.idObra));
  readonly pontos = computed(() => (this.programacao() ? this.ctx.pontos(this.programacao()!) : []));
  readonly feitos = computed(() => this.pontos().filter(p => p.situacao === 'FEITO').length);
  readonly liberacao = computed(() => (this.programacao() ? this.ctx.liberacao(this.programacao()!) : 'PENDENTE'));
  readonly pontoSelecionado = computed(() => this.pontos().find(p => p.id === this.selecionado()) ?? null);
  readonly itensFoto = computed(() => this.ctx.itensModelo(this.obra()));
  readonly pendencias = computed(() => {
    const obra = this.obra();
    if (!obra) return [];
    const feitos = this.pontos().filter(p => p.situacao !== 'A_FAZER').map(p => ({ id: p.id, rotulo: p.rotulo }));
    return pendenciasDeFoto(obra, this.itensFoto(), feitos, this.ctx.registros.registros());
  });
  readonly marcadores = computed<MarcadorPonto[]>(() => this.pontos()
    .filter(p => p.ponto?.x != null && p.ponto?.y != null)
    .map(p => ({ id: p.id, numero: p.ponto!.numero, pagina: p.ponto!.pagina ?? 1, x: Number(p.ponto!.x), y: Number(p.ponto!.y),
      situacao: p.situacao, pendencia: this.pendenciasDoPonto(p.id) > 0 })));
  readonly temQuantidade = computed(() => Object.values(this.quantidades()).some(v => v > 0));

  constructor() {
    effect(() => {
      const obra = this.obra();
      if (obra) untracked(() => void this.ctx.pacote.projeto(obra).then(b => this.pdf.set(b)));
    });
    effect(() => {
      // Miniaturas das fotos tiradas no aparelho e ainda não enviadas.
      const regs = this.ctx.registros.registros().filter(r => r.tipo === 'EVIDENCIA' && r.idProgramacao === this.id() && r.arquivo);
      untracked(() => void this.carregarMiniaturas(regs.map(r => ({ id: r.id, chave: r.arquivo!.chave }))));
    });
    effect(() => {
      this.selecionado();
      untracked(() => {
        this.parcial.set(false);
        this.quantidades.set({});
        this.serie.set('');
      });
    });
    void this.gps.agora(5000).then(p => (this.posicao = p));
  }

  ngOnDestroy(): void {
    Object.values(this.miniaturas()).forEach(u => URL.revokeObjectURL(u));
  }

  escolher(id: string): void {
    this.selecionado.set(id);
  }

  fotosPendentes(n: number): string {
    return n === 1 ? '1 foto pendente' : `${n} fotos pendentes`;
  }

  pendenciasDoPonto(id: string): number {
    return this.pendencias().filter(p => p.idPonto === id).length;
  }

  resumoItens(ponto: PontoDaExecucao): string {
    const servicos = ponto.itens.filter(i => i.tipo === 'SERVICO').length;
    const materiais = ponto.itens.length - servicos;
    return [servicos ? `${servicos} ${servicos === 1 ? 'serviço' : 'serviços'}` : '', materiais ? `${materiais} ${materiais === 1 ? 'material' : 'materiais'}` : '']
      .filter(Boolean).join(' · ');
  }

  async tudoFeito(ponto: PontoDaExecucao): Promise<void> {
    const p = this.programacao();
    if (!p || !this.podeApontar()) return;
    const apr = aprQueLibera(p, this.ctx.hoje(), this.ctx.registros.registros());
    const r = await this.ctx.registros.registrar({
      tipo: 'APONTAMENTO', idObra: p.idObra, idProgramacao: p.id, idPonto: ponto.id, dependeDe: apr?.id ?? null,
      comando: { idProgramacao: p.id, idPonto: ponto.id, pontoInteiro: true, itens: null, idApr: apr?.id ?? null },
    });
    const faltam = this.itensFoto().filter(i => i.obrigatoria).length;
    this.toast.desfazer(`${ponto.rotulo}: tudo feito${faltam ? ' · tire as fotos do modelo' : ''}`, () => void this.ctx.registros.desfazer(r.id));
  }

  definirQuantidade(idItem: string, valor: number): void {
    this.quantidades.update(q => ({ ...q, [idItem]: valor }));
  }

  async salvarParcial(ponto: PontoDaExecucao): Promise<void> {
    const p = this.programacao();
    if (!p || !this.podeApontar()) return;
    const itens = Object.entries(this.quantidades()).filter(([, q]) => q > 0).map(([idItem, quantidade]) => {
      const item = ponto.itens.find(i => i.idItem === idItem);
      const excede = item && item.feito + quantidade > item.quantidade;
      return { idItem, quantidade, justificativa: excede ? 'Executado além do previsto em campo.' : null };
    });
    if (!itens.length) return;
    const apr = aprQueLibera(p, this.ctx.hoje(), this.ctx.registros.registros());
    const r = await this.ctx.registros.registrar({
      tipo: 'APONTAMENTO', idObra: p.idObra, idProgramacao: p.id, idPonto: ponto.id, dependeDe: apr?.id ?? null,
      comando: { idProgramacao: p.id, idPonto: ponto.id, pontoInteiro: false, itens, idApr: apr?.id ?? null },
    });
    this.parcial.set(false);
    this.quantidades.set({});
    this.toast.desfazer('Parcial registrado', () => void this.ctx.registros.desfazer(r.id));
  }

  carimbo(ponto: PontoDaExecucao, titulo: string): string[] {
    const etapa = { ANTES: 'Antes', DURANTE: 'Durante', DEPOIS: 'Depois' }[this.etapa()];
    return linhasDoCarimbo({
      contexto: [`Obra ${this.programacao()?.numeroObra ?? ''} · ${ponto.rotulo}`, `${titulo} · ${etapa}`],
      data: new Date(), latitude: this.posicao?.latitude, longitude: this.posicao?.longitude, precisao: this.posicao?.precisao,
    });
  }

  /** Fotos tiradas no aparelho que ainda têm o arquivo (as enviadas saem do aparelho). */
  fotosDoItem(idPonto: string, idItem: string): FotoExibida[] {
    return this.registrosDaFoto(idPonto, idItem)
      .filter(r => !!this.miniaturas()[r.id])
      .map(r => ({ id: r.id, url: this.miniaturas()[r.id], legenda: (r.comando as { etapa?: string }).etapa?.toLowerCase(),
        estado: r.envio === 'ENVIADO' ? 'synced' : r.envio === 'CONFLITO' ? 'conflict' : r.envio === 'ENVIANDO' ? 'syncing' : 'queued' } as FotoExibida));
  }

  /** Já tem foto (no aparelho ou no servidor): a pendência some. */
  temFoto(idPonto: string, idItem: string): boolean {
    return this.registrosDaFoto(idPonto, idItem).length > 0
      || (this.obra()?.fotos ?? []).some(f => (f.idVao ?? f.idPonto) === idPonto && f.idItem === idItem);
  }

  private registrosDaFoto(idPonto: string, idItem: string) {
    const equipamento = idItem === 'EQUIPAMENTO';
    return this.ctx.registros.registros().filter(r => r.tipo === 'EVIDENCIA' && r.idPonto === idPonto
      && (equipamento ? !!(r.comando as { legenda?: string }).legenda?.startsWith('Equipamento') : (r.comando as { idItem?: string }).idItem === idItem));
  }

  async foto(ponto: PontoDaExecucao, idItem: string, foto: EvidenciaPreparada): Promise<void> {
    const p = this.programacao();
    if (!p) return;
    if (!this.turno.turnoAtivo()) {
      this.toast.warning('Abra o turno antes de registrar fotos.');
      return;
    }
    const equipamento = idItem === 'EQUIPAMENTO';
    const modelo = this.ctx.modeloFoto(this.obra());
    const apontamento = this.ctx.registros.registros().filter(r => r.tipo === 'APONTAMENTO' && r.idPonto === ponto.id).at(-1);
    await this.ctx.registros.registrar({
      tipo: 'EVIDENCIA', idObra: p.idObra, idProgramacao: p.id, idPonto: ponto.id, posicao: this.posicao,
      comando: {
        idObra: p.idObra, idPonto: ponto.ponto ? ponto.id : null, idVao: ponto.vao ? ponto.id : null, idProgramacao: p.id,
        idApontamento: apontamento?.id ?? null, idModelo: equipamento ? null : modelo?.id ?? null, idItem: equipamento ? null : idItem,
        etapa: this.etapa(), legenda: equipamento ? `Equipamento${this.serie() ? ' · série ' + this.serie() : ''}` : null,
      },
      arquivo: { blob: foto.arquivo, nome: foto.nomeArquivo, tipo: foto.contentType },
    });
    this.toast.success('Foto guardada');
  }

  serieLida(codigo: string): void {
    this.serie.set(codigo.trim());
    this.lendo.set(false);
    this.toast.info(`Série ${codigo.trim()} lida. Tire a foto da placa para registrar.`);
  }

  voltar(): void {
    void this.router.navigate(['/obras', this.id()]);
  }

  num(n: number): string {
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }

  private podeApontar(): boolean {
    if (!this.turno.turnoAtivo()) {
      this.toast.warning('Abra o turno antes de apontar.');
      return false;
    }
    if (this.liberacao() !== 'LIBERADA') {
      this.toast.warning('Conclua a APR antes de marcar o que foi feito.');
      return false;
    }
    return true;
  }

  private async carregarMiniaturas(itens: { id: string; chave: string }[]): Promise<void> {
    const atuais = { ...this.miniaturas() };
    let mudou = false;
    for (const { id, chave } of itens) {
      if (atuais[id]) continue;
      const blob = await this.arquivos.ler(chave);
      if (blob) {
        atuais[id] = URL.createObjectURL(blob);
        mudou = true;
      }
    }
    if (mudou) this.miniaturas.set(atuais);
  }
}
