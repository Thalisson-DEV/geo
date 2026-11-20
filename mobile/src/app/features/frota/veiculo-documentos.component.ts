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
    <geo-barra-topo titulo="Documentos" [subtitulo]="subtitulo()" (voltar)="voltar()">
      <button type="button" class="geo-btn-icone" [disabled]="carga() === 'carregando' || !idVeiculo() || !online()" (click)="carregar()" aria-label="Atualizar">
        <geo-icone nome="atualizar" />
      </button>
      <geo-indicador-rede />
    </geo-barra-topo>

    <div class="escolha">
      <geo-seletor rotulo="Veículo" placeholder="Escolher a placa" [opcoes]="opcoesVeiculo()" [valor]="idVeiculo()" (valorChange)="escolher($event)" />
    </div>

    @if (!idVeiculo()) {
      <geo-vazio icone="documento" titulo="Escolha um veículo" texto="CRLV, tacógrafo e laudos do veículo e do implemento engatado." />
    } @else if (carga() === 'carregando') {
      <div class="geo-esqueletos" role="status" aria-busy="true" aria-label="Carregando">
        <div class="geo-esqueleto" style="height: 64px"></div><div class="geo-esqueleto" style="height: 64px"></div><div class="geo-esqueleto" style="height: 64px"></div>
      </div>
    } @else if (grupos().length) {
      @if (!online()) {
        <p class="aviso"><geo-icone nome="sem_rede" [tamanho]="16" />Sem internet: abrem os documentos já salvos no aparelho.</p>
      }
      @for (g of grupos(); track g.chave) {
        <h2 class="geo-secao"><span>{{ g.titulo }}</span><span class="geo-num">{{ g.documentos.length }}</span></h2>
        <ul class="geo-grupo">
          @for (doc of g.documentos; track doc.id) {
            @let v = vencimento(doc);
            @let abre = podeAbrir(doc);
            @if (abre) {
              <li><button type="button" class="geo-linha geo-linha--acao" (click)="abrir(doc)">
                <span [class]="'geo-selo geo-selo--' + v.tom"><geo-icone nome="documento" /></span>
                <span class="geo-linha__texto">
                  <span class="geo-linha__titulo">{{ nome(doc) }}</span>
                  <span class="geo-linha__apoio">{{ apoio(doc) }}</span>
                </span>
                <span [class]="'geo-etiqueta geo-etiqueta--' + etiqueta(v.tom)">{{ v.rotulo }}</span>
                <geo-icone nome="avancar" [tamanho]="18" />
              </button></li>
            } @else {
              <li class="geo-linha">
                <span [class]="'geo-selo geo-selo--' + v.tom"><geo-icone nome="documento" /></span>
                <span class="geo-linha__texto">
                  <span class="geo-linha__titulo">{{ nome(doc) }}</span>
                  <span class="geo-linha__apoio">{{ apoio(doc) }}</span>
                </span>
                <span [class]="'geo-etiqueta geo-etiqueta--' + etiqueta(v.tom)">{{ v.rotulo }}</span>
              </li>
            }
          }
        </ul>
      }
      @if (semArquivo()) {
        <p class="nota"><geo-icone nome="info" [tamanho]="16" />Documento sem arquivo: peça ao gestor da frota para anexar.</p>
      }
    } @else if (carga() === 'sem-sinal') {
      <geo-vazio icone="nuvem" titulo="Precisa de internet" texto="Os documentos deste veículo ainda não foram salvos neste aparelho. Conecte uma vez e eles passam a abrir sem sinal." />
    } @else if (carga() === 'erro') {
      <geo-vazio icone="alerta" titulo="Não foi possível buscar os documentos" texto="Confira a internet e tente de novo.">
        <button type="button" class="geo-btn geo-btn--tonal" (click)="carregar()">Tentar de novo</button>
      </geo-vazio>
    } @else if (carga() === 'pronto') {
      <geo-vazio icone="documento" titulo="Nenhum documento cadastrado" texto="O gestor da frota cadastra o CRLV e os demais documentos na web." />
    }
    <div class="geo-respiro"></div>
  `,
  styles: [`
    :host { display: block; }
    .escolha { padding: var(--geo-e2) var(--geo-e3) 0; }
    .geo-linha .geo-etiqueta { flex: none; }
    .aviso, .nota { display: flex; align-items: center; gap: var(--geo-e2); margin: var(--geo-e2) var(--geo-e3) 0; padding: var(--geo-e3) var(--geo-e4);
      border-radius: var(--geo-r-grupo); font: var(--geo-t-apoio); font-size: .875rem; }
    .aviso { background: var(--geo-atencao-suave); color: var(--geo-texto); }
    .nota { background: var(--geo-superficie); color: var(--geo-texto-2); margin-top: var(--geo-e3); }
    .aviso geo-icone, .nota geo-icone { flex: none; }
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
