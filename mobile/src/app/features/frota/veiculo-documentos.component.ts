import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { formatarPlaca } from '../../core/frota/checklist-veiculo.models';
import { ChecklistVeiculoService } from '../../core/frota/checklist-veiculo.service';
import { DocumentosVeiculoService } from '../../core/frota/documentos-veiculo.service';
import { MeuVeiculoService } from '../../core/frota/meu-veiculo';
import { DocumentoConjunto, Tom, nomeDocumento, situacaoVencimento, temArquivo } from '../../core/frota/situacao-veiculo.models';
import { SituacaoVeiculoService } from '../../core/frota/situacao-veiculo.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { BarraTopoComponent, IconeComponent, IndicadorRedeComponent, OpcaoSeletor, SeletorComponent, VazioComponent } from '../../ui';

type Carga = 'ocioso' | 'carregando' | 'pronto' | 'sem-sinal' | 'erro';

interface GrupoDocumentos {
  chave: string;
  titulo: string;
  documentos: DocumentoConjunto[];
}

/**
 * Documentos do veículo e dos implementos engatados (CRLV, tacógrafo, laudo) para mostrar na
 * fiscalização. Abrem dentro do app e, depois de vistos uma vez com sinal (ou na sincronização),
 * abrem também sem internet.
 */
@Component({
  selector: 'app-veiculo-documentos',
  standalone: true,
  imports: [BarraTopoComponent, IconeComponent, IndicadorRedeComponent, SeletorComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ces-barra-topo titulo="Documentos" [subtitulo]="subtitulo()" (voltar)="voltar()">
      <button type="button" class="ces-btn-icone" [disabled]="carga() === 'carregando' || !idVeiculo() || !online()" (click)="carregar()" aria-label="Atualizar">
        <ces-icone nome="atualizar" />
      </button>
      <ces-indicador-rede />
    </ces-barra-topo>

    <div class="escolha">
      <ces-seletor rotulo="Veículo" placeholder="Escolher a placa" [opcoes]="opcoesVeiculo()" [valor]="idVeiculo()" (valorChange)="escolher($event)" />
    </div>

    @if (!idVeiculo()) {
      <ces-vazio icone="documento" titulo="Escolha um veículo" texto="CRLV, tacógrafo e laudos do veículo e do implemento engatado." />
    } @else if (carga() === 'carregando') {
      <div class="ces-esqueletos" aria-busy="true" aria-label="Carregando">
        <div class="ces-esqueleto" style="height: 64px"></div><div class="ces-esqueleto" style="height: 64px"></div><div class="ces-esqueleto" style="height: 64px"></div>
      </div>
    } @else if (grupos().length) {
      @if (!online()) {
        <p class="aviso"><ces-icone nome="sem_rede" [tamanho]="16" />Sem internet: abrem os documentos já salvos no aparelho.</p>
      }
      @for (g of grupos(); track g.chave) {
        <h2 class="ces-secao"><span>{{ g.titulo }}</span><span class="ces-num">{{ g.documentos.length }}</span></h2>
        <ul class="ces-grupo">
          @for (doc of g.documentos; track doc.id) {
            @let v = vencimento(doc);
            @let abre = podeAbrir(doc);
            @if (abre) {
              <li><button type="button" class="ces-linha ces-linha--acao" (click)="abrir(doc)">
                <span [class]="'ces-selo ces-selo--' + v.tom"><ces-icone nome="documento" /></span>
                <span class="ces-linha__texto">
                  <span class="ces-linha__titulo">{{ nome(doc) }}</span>
                  <span class="ces-linha__apoio">{{ apoio(doc) }}</span>
                </span>
                <span [class]="'ces-etiqueta ces-etiqueta--' + etiqueta(v.tom)">{{ v.rotulo }}</span>
                <ces-icone nome="avancar" [tamanho]="18" />
              </button></li>
            } @else {
              <li class="ces-linha">
                <span [class]="'ces-selo ces-selo--' + v.tom"><ces-icone nome="documento" /></span>
                <span class="ces-linha__texto">
                  <span class="ces-linha__titulo">{{ nome(doc) }}</span>
                  <span class="ces-linha__apoio">{{ apoio(doc) }}</span>
                </span>
                <span [class]="'ces-etiqueta ces-etiqueta--' + etiqueta(v.tom)">{{ v.rotulo }}</span>
              </li>
            }
          }
        </ul>
      }
      @if (semArquivo()) {
        <p class="nota"><ces-icone nome="info" [tamanho]="16" />Documento sem arquivo: peça ao gestor da frota para anexar.</p>
      }
    } @else if (carga() === 'sem-sinal') {
      <ces-vazio icone="nuvem" titulo="Precisa de internet" texto="Os documentos deste veículo ainda não foram salvos neste aparelho. Conecte uma vez e eles passam a abrir sem sinal." />
    } @else if (carga() === 'erro') {
      <ces-vazio icone="alerta" titulo="Não foi possível buscar os documentos" texto="Confira a internet e tente de novo.">
        <button type="button" class="ces-btn ces-btn--tonal" (click)="carregar()">Tentar de novo</button>
      </ces-vazio>
    } @else if (carga() === 'pronto') {
      <ces-vazio icone="documento" titulo="Nenhum documento cadastrado" texto="O gestor da frota cadastra o CRLV e os demais documentos na web." />
    }
    <div class="ces-respiro"></div>
  `,
  styles: [`
    :host { display: block; }
    .escolha { padding: var(--ces-e2) var(--ces-e3) 0; }
    .ces-linha .ces-etiqueta { flex: none; }
    .aviso, .nota { display: flex; align-items: center; gap: var(--ces-e2); margin: var(--ces-e2) var(--ces-e3) 0; padding: var(--ces-e3) var(--ces-e4);
      border-radius: var(--ces-r-grupo); font: var(--ces-t-apoio); font-size: .875rem; }
    .aviso { background: var(--ces-atencao-suave); color: var(--ces-texto); }
    .nota { background: var(--ces-superficie); color: var(--ces-texto-2); margin-top: var(--ces-e3); }
    .aviso ces-icone, .nota ces-icone { flex: none; }
  `],
})
export class VeiculoDocumentosComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly checklists = inject(ChecklistVeiculoService);
  private readonly meuVeiculo = inject(MeuVeiculoService);
  private readonly situacao = inject(SituacaoVeiculoService);
  private readonly documentosVeiculo = inject(DocumentosVeiculoService);
  private readonly rede = inject(ConnectivityService);

  protected readonly online = computed(() => this.rede.isOnline());
  protected readonly idVeiculo = signal<string | null>(this.rota.snapshot.queryParamMap.get('veiculo'));
  protected readonly carga = signal<Carga>('ocioso');
  protected readonly documentos = signal<DocumentoConjunto[]>([]);
  protected readonly noAparelho = signal<Set<string>>(new Set());

  protected readonly opcoesVeiculo = computed<OpcaoSeletor[]>(() =>
    (this.checklists.catalogo()?.veiculos ?? []).map((v) => ({
      valor: v.idVeiculo,
      rotulo: formatarPlaca(v.placa),
      apoio: [v.descricao, v.baseNome].filter(Boolean).join(' · ') || null
    })));

  private readonly placa = computed(() => {
    const v = this.checklists.catalogo()?.veiculos.find((x) => x.idVeiculo === this.idVeiculo());
    return v ? formatarPlaca(v.placa) : null;
  });
  protected readonly subtitulo = computed(() => this.placa() ?? 'Para a fiscalização');

  /** O veículo primeiro; cada implemento engatado em seguida, com a identificação dele. */
  protected readonly grupos = computed<GrupoDocumentos[]>(() => {
    const docs = this.documentos();
    const doVeiculo = docs.filter((d) => !d.doImplemento);
    const grupos: GrupoDocumentos[] = doVeiculo.length ? [{ chave: 'veiculo', titulo: `Veículo${this.placa() ? ' · ' + this.placa() : ''}`, documentos: doVeiculo }] : [];
    const implementos = new Map<string, DocumentoConjunto[]>();
    for (const d of docs.filter((x) => x.doImplemento)) {
      const chave = d.titular ?? 'Implemento';
      implementos.set(chave, [...(implementos.get(chave) ?? []), d]);
    }
    for (const [titular, lista] of implementos) grupos.push({ chave: 'imp:' + titular, titulo: `Implemento · ${titular}`, documentos: lista });
    return grupos;
  });
  protected readonly semArquivo = computed(() => this.documentos().some((d) => !temArquivo(d)));

  async ngOnInit(): Promise<void> {
    if (!this.idVeiculo()) {
      const catalogo = this.checklists.catalogo() ?? await this.checklists.carregarCatalogoLocal();
      const id = await this.meuVeiculo.sugerido(catalogo?.veiculos ?? []);
      if (id) this.escolher(id);
      return;
    }
    void this.carregar();
  }

  protected escolher(id: string | null): void {
    this.idVeiculo.set(id);
    this.documentos.set([]);
    this.noAparelho.set(new Set());
    void this.router.navigate([], { relativeTo: this.rota, queryParams: { veiculo: id }, queryParamsHandling: 'merge', replaceUrl: true });
    void this.carregar();
  }

  /** Mostra logo o que está no aparelho; com sinal, atualiza do servidor e baixa os arquivos novos. */
  protected async carregar(): Promise<void> {
    const id = this.idVeiculo();
    if (!id) return;
    const local = await this.documentosVeiculo.listaLocal(id).catch(() => null);
    if (this.idVeiculo() !== id) return;
    if (local) {
      this.documentos.set(local.documentos);
      this.carga.set('pronto');
      void this.conferirAparelho(id);
    }
    if (!this.rede.isOnline()) {
      if (!local) this.carga.set('sem-sinal');
      return;
    }
    if (!local) this.carga.set('carregando');
    try {
      const ficha = await this.situacao.situacao(id);
      if (this.idVeiculo() !== id) return;
      const docs = ficha.documentosDoConjunto ?? [];
      this.documentos.set(docs);
      this.carga.set('pronto');
      await this.documentosVeiculo.guardar(id, docs);
      await this.conferirAparelho(id);
    } catch {
      if (this.idVeiculo() === id && !local) this.carga.set('erro');
    }
  }

  private async conferirAparelho(id: string): Promise<void> {
    const guardados = new Set<string>();
    for (const d of this.documentos()) {
      if (temArquivo(d) && await this.documentosVeiculo.noAparelho(d)) guardados.add(d.id);
    }
    if (this.idVeiculo() === id) this.noAparelho.set(guardados);
  }

  protected podeAbrir(d: DocumentoConjunto): boolean {
    return temArquivo(d) && (this.online() || this.noAparelho().has(d.id));
  }

  protected abrir(d: DocumentoConjunto): void {
    void this.router.navigate(['/frota/documentos', d.id], { queryParams: { veiculo: this.idVeiculo(), de: this.rota.snapshot.queryParamMap.get('de') } });
  }

  protected nome(d: DocumentoConjunto): string {
    return nomeDocumento(d);
  }

  protected vencimento(d: DocumentoConjunto): { rotulo: string; tom: Tom } {
    return situacaoVencimento(d);
  }

  protected apoio(d: DocumentoConjunto): string {
    const validade = d.vencimento ? `Validade ${new Date(d.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}` : null;
    if (!temArquivo(d)) return 'Sem arquivo anexado';
    if (!this.online() && !this.noAparelho().has(d.id)) return ['Ainda não salvo no aparelho', validade].filter(Boolean).join(' · ');
    return validade ?? 'Toque para ver';
  }

  protected etiqueta(tom: Tom): string {
    return tom === 'neutro' ? 'neutra' : tom;
  }

  protected voltar(): void {
    if (this.rota.snapshot.queryParamMap.get('de') === 'ficha') {
      void this.router.navigate(['/frota/veiculo'], { queryParams: { veiculo: this.idVeiculo() } });
      return;
    }
    void this.router.navigateByUrl('/frota');
  }
}
