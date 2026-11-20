import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { liveQuery } from 'dexie';
import {
  ChecklistDetalheServidor,
  ChecklistVeiculoLocal,
  FotoChecklistLocal,
  TomChecklist,
  decisaoPendencia,
  formatarMedicao,
  formatarPlaca,
  gruposDePerguntas,
  quandoChecklist,
  respostaComProblema,
  resumoProblemas,
  textoRespostaLocal
} from '../../core/frota/checklist-veiculo.models';
import { ChecklistVeiculoService } from '../../core/frota/checklist-veiculo.service';
import { ConnectivityService } from '../../core/sync/connectivity.service';
import { BarraTopoComponent, FolhaComponent, IconeComponent, SegmentadoComponent, VazioComponent } from '../../ui';

interface FotoTela {
  id: string;
  rotulo: string;
  url: string | null;
  situacao: 'pronta' | 'carregando' | 'no-celular' | 'sem-sinal';
}

interface ItemTela {
  id: string;
  pergunta: string;
  /** Etiqueta curta (OK, Não OK, a opção); o texto livre vai em `texto`. */
  etiqueta: string | null;
  motivo: string | null;
  texto: string | null;
  problema: boolean;
  comentario: string | null;
  fotos: FotoTela[];
  decisao: { texto: string; tom: TomChecklist } | null;
}

interface DetalheTela {
  placa: string;
  quando: string;
  modelo: string | null;
  condutor: string | null;
  preenchidoPor: string | null;
  medicao: string;
  base: string | null;
  passagem: boolean;
  liberacaoCnh: string | null;
  assinado: boolean;
  comentario: string | null;
  problemas: number;
  decididos: number;
  grupos: { titulo: string; itens: ItemTela[] }[];
  recebimento: FotoTela[];
  doServidor: boolean;
}

type Filtro = 'todos' | 'problemas';

/**
 * Detalhe do checklist do veículo: o que foi respondido em cada item, as fotos, o recebimento na
 * troca de condutor e o que o gestor decidiu em cada Não OK. Abre o que está no aparelho (mesmo
 * sem sinal) e, com internet, completa com o servidor (fotos já enviadas e decisões).
 */
@Component({
  selector: 'app-checklist-veiculo-detalhe',
  standalone: true,
  imports: [BarraTopoComponent, FolhaComponent, IconeComponent, SegmentadoComponent, VazioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo titulo="Checklist" [subtitulo]="subtitulo()" (voltar)="voltar()" />

    @if (!carregado()) {
      <div class="geo-esqueletos" role="status" aria-busy="true" aria-label="Carregando">
        <div class="geo-esqueleto" style="height: 64px"></div><div class="geo-esqueleto" style="height: 180px"></div><div class="geo-esqueleto" style="height: 220px"></div>
      </div>
    } @else if (tela(); as t) {
      @let f = faixa();
      <section class="geo-faixa-estado" [class.geo-faixa-estado--atencao]="f.tom === 'atencao'" [class.geo-faixa-estado--erro]="f.tom === 'erro'" aria-live="polite">
        <span [class]="'geo-etiqueta geo-etiqueta--' + f.tom">{{ f.rotulo }}</span>
        <p>{{ f.apoio }}</p>
      </section>
      @if (local()?.aviso) {
        <p class="aviso"><geo-icone nome="info" [tamanho]="16" />{{ local()!.aviso }}</p>
      }
      @if (falhaServidor() && local()?.registrado) {
        <p class="nota"><geo-icone nome="alerta" [tamanho]="16" /><span>Não deu para buscar no servidor: aparecem só os dados deste aparelho.
          <button type="button" class="nota__acao" (click)="carregarServidor()">Tentar de novo</button></span></p>
      }
      @if (semSinalParaCompletar()) {
        <p class="nota"><geo-icone nome="nuvem" [tamanho]="16" />Sem sinal: as fotos enviadas e as decisões do gestor aparecem quando a internet voltar.</p>
      }

      <dl class="geo-dados">
        <div><dt>Veículo</dt><dd class="geo-num">{{ t.placa }}{{ t.base ? ' · ' + t.base : '' }}</dd></div>
        <div><dt>Condutor</dt><dd>{{ t.condutor ?? '—' }}@if (t.passagem) { <span class="geo-etiqueta geo-etiqueta--destaque dado-etiqueta">Recebeu o veículo</span> }</dd></div>
        @if (t.preenchidoPor && t.preenchidoPor !== t.condutor) { <div><dt>Preenchido por</dt><dd>{{ t.preenchidoPor }}</dd></div> }
        <div><dt>Medição</dt><dd class="geo-num">{{ t.medicao }}</dd></div>
        @if (t.modelo) { <div><dt>Checklist</dt><dd>{{ t.modelo }}</dd></div> }
        @if (t.liberacaoCnh) { <div><dt>CNH liberada pelo gestor</dt><dd>{{ t.liberacaoCnh }}</dd></div> }
        @if (t.comentario) { <div><dt>Comentário geral</dt><dd class="dado-texto">{{ t.comentario }}</dd></div> }
      </dl>

      @if (t.problemas && totalItens() > t.problemas) {
        <div class="filtro">
          <geo-segmentado rotulo="Itens mostrados" [opcoes]="opcoesFiltro()" [(valor)]="filtro" />
        </div>
      }

      @for (g of gruposVisiveis(); track g.titulo) {
        <h2 class="geo-secao"><span>{{ g.titulo }}</span><span class="geo-num">{{ g.itens.length }}</span></h2>
        <ul class="geo-grupo" [attr.aria-label]="g.titulo">
          @for (i of g.itens; track i.id) {
            <li class="resp" [class.resp--problema]="i.problema">
              <div class="resp__topo">
                <span class="resp__pergunta">{{ i.pergunta }}</span>
                @if (i.etiqueta) {
                  <span class="geo-etiqueta" [class.geo-etiqueta--ok]="!i.problema && i.etiqueta === 'OK'" [class.geo-etiqueta--erro]="i.problema">
                    @if (i.problema) { <geo-icone nome="alerta" [tamanho]="12" /> } @else if (i.etiqueta === 'OK') { <geo-icone nome="check" [tamanho]="12" /> }
                    {{ i.etiqueta }}
                  </span>
                }
              </div>
              @if (i.motivo) { <span class="resp__motivo">{{ i.motivo }}</span> }
              @if (i.texto) { <span class="resp__texto">{{ i.texto }}</span> }
              @if (i.comentario) { <span class="resp__comentario">“{{ i.comentario }}”</span> }
              @if (i.fotos.length) {
                <ul class="fotos fotos--mini" [attr.aria-label]="'Fotos de ' + i.pergunta">
                  @for (foto of i.fotos; track foto.id) { <li>
                    @if (foto.url) {
                      <button type="button" class="foto foto--pronta" (click)="ampliar.set(foto)" [attr.aria-label]="'Ampliar a foto de ' + foto.rotulo">
                        <img [src]="foto.url" [alt]="foto.rotulo"><span class="foto__lupa" aria-hidden="true"><geo-icone nome="busca" [tamanho]="12" /></span>
                      </button>
                    } @else {
                      <span class="foto" [class.foto--alerta]="foto.situacao === 'sem-sinal'">
                        @switch (foto.situacao) {
                          @case ('carregando') { <span class="geo-esqueleto foto__esqueleto"></span> }
                          @case ('no-celular') { <geo-icone nome="nuvem" [tamanho]="18" /><span>Ainda no celular</span> }
                          @default { <geo-icone nome="nuvem" [tamanho]="18" /><span>Abra com sinal</span> }
                        }
                      </span>
                    }
                  </li> }
                </ul>
              }
              @if (i.decisao; as d) {
                <span class="resp__decisao" [attr.data-tom]="d.tom"><i aria-hidden="true"></i>{{ d.texto }}</span>
              }
            </li>
          }
        </ul>
      }

      @if (t.recebimento.length && filtro() === 'todos') {
        <h2 class="geo-secao"><span>Fotos do recebimento</span><span class="geo-num">{{ t.recebimento.length }}</span></h2>
        <ul class="fotos" aria-label="Fotos do recebimento">
          @for (foto of t.recebimento; track foto.id) {
            <li>
              @if (foto.url) {
                <button type="button" class="foto foto--pronta" (click)="ampliar.set(foto)" [attr.aria-label]="'Ampliar a foto: ' + foto.rotulo">
                  <img [src]="foto.url" [alt]="foto.rotulo"><span class="foto__lupa" aria-hidden="true"><geo-icone nome="busca" [tamanho]="14" /></span>
                </button>
              } @else {
                <span class="foto" [class.foto--alerta]="foto.situacao === 'sem-sinal'">
                  @switch (foto.situacao) {
                    @case ('carregando') { <span class="geo-esqueleto foto__esqueleto"></span> }
                    @case ('no-celular') { <geo-icone nome="nuvem" [tamanho]="22" /><span>Ainda no celular</span> }
                    @default { <geo-icone nome="nuvem" [tamanho]="22" /><span>Abra com sinal</span> }
                  }
                </span>
              }
              <span class="foto__rotulo">{{ foto.rotulo }}</span>
            </li>
          }
        </ul>
      }
      <div class="geo-respiro"></div>
    } @else if (erro()) {
      <geo-vazio icone="alerta" titulo="Não foi possível abrir o checklist" [texto]="erro()">
        <button type="button" class="geo-btn geo-btn--tonal" (click)="carregarServidor()">Tentar de novo</button>
      </geo-vazio>
    } @else {
      <geo-vazio icone="nuvem" titulo="Checklist precisa de internet" texto="Ele não está neste aparelho. Conecte e abra de novo.">
        <button type="button" class="geo-btn geo-btn--tonal" (click)="voltar()">Ver checklists</button>
      </geo-vazio>
    }

    <geo-folha [aberta]="!!ampliar()" (fechar)="ampliar.set(null)" [titulo]="ampliar()?.rotulo ?? null">
      @if (ampliar()?.url; as url) { <img class="ampliada" [src]="url" [alt]="ampliar()!.rotulo"> }
    </geo-folha>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; min-height: 100%; background: var(--geo-fundo); }
    :host > * { flex-shrink: 0; }
    .aviso, .nota { display: flex; align-items: flex-start; gap: 6px; margin: var(--geo-e2) var(--geo-e5) 0; font: var(--geo-t-apoio); }
    .aviso { color: var(--geo-atencao); }
    .nota { color: var(--geo-texto-2); }
    .nota__acao { margin-left: 4px; padding: 0; border: 0; background: none; color: var(--geo-destaque); font: inherit; font-weight: 600; cursor: pointer; }
    .aviso geo-icone, .nota geo-icone { flex: none; margin-top: 2px; }
    .dado-etiqueta { margin-left: var(--geo-e2); vertical-align: 1px; }
    .dado-texto { font: var(--geo-t-corpo); white-space: pre-line; }
    .filtro { padding: var(--geo-e4) var(--geo-e3) 0; }

    .resp { position: relative; display: grid; gap: 6px; padding: var(--geo-e3) var(--geo-e4); }
    .resp + .resp::before { content: ''; position: absolute; top: 0; left: var(--geo-e4); right: 0; height: 1px; background: var(--geo-linha); }
    .resp--problema { box-shadow: inset 3px 0 0 var(--geo-erro); }
    .resp__topo { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--geo-e3); }
    .resp__pergunta { font: var(--geo-t-corpo-forte); overflow-wrap: anywhere; }
    .resp__motivo { font: var(--geo-t-apoio); font-weight: 600; color: var(--geo-erro); }
    .resp__texto { font: var(--geo-t-corpo); color: var(--geo-texto); white-space: pre-line; overflow-wrap: anywhere; }
    .resp__comentario { font: var(--geo-t-apoio); color: var(--geo-texto-2); font-style: italic; overflow-wrap: anywhere; }
    .resp__decisao { display: inline-flex; align-items: center; gap: 6px; font: var(--geo-t-apoio); font-weight: 600; color: var(--geo-texto-2); }
    .resp__decisao i { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex: none; }
    .resp__decisao[data-tom='atencao'] { color: var(--geo-atencao); }
    .resp__decisao[data-tom='destaque'] { color: var(--geo-destaque); }
    .resp__decisao[data-tom='ok'] { color: var(--geo-ok); }

    .fotos { list-style: none; margin: 0; padding: 0 var(--geo-e3); display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--geo-e3); }
    .fotos--mini { padding: 2px 0 0; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: var(--geo-e2); }
    .fotos li { display: grid; gap: 6px; min-width: 0; }
    .foto { position: relative; display: grid; place-content: center; justify-items: center; gap: 4px; aspect-ratio: 4 / 3; overflow: hidden; padding: 0;
      border-radius: var(--geo-r-grupo); border: 1.5px dashed var(--geo-linha-forte); background: var(--geo-superficie); color: var(--geo-texto-2);
      font: var(--geo-t-apoio); font-size: .75rem; text-align: center; }
    .fotos--mini .foto { border-radius: 10px; background: var(--geo-superficie-2); }
    .foto--pronta { border: 0; cursor: pointer; }
    .foto--pronta:active { transform: scale(.98); }
    .foto--alerta { color: var(--geo-atencao); }
    .foto img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .foto__lupa { position: absolute; right: 4px; bottom: 4px; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
      background: rgba(0, 0, 0, .55); color: #fff; }
    .foto__esqueleto { position: absolute; inset: 0; border-radius: 0; }
    .foto__rotulo { font: var(--geo-t-apoio); color: var(--geo-texto); font-weight: 500; padding: 0 2px; }
    .ampliada { display: block; width: calc(100% - 2 * var(--geo-e4)); margin: 0 var(--geo-e4); max-height: 70vh; object-fit: contain; border-radius: var(--geo-r-grupo); }
  `]
})
export class ChecklistVeiculoDetalheComponent implements OnInit, OnDestroy {
  private readonly servico = inject(ChecklistVeiculoService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly rede = inject(ConnectivityService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly local = signal<ChecklistVeiculoLocal | null>(null);
  protected readonly servidor = signal<ChecklistDetalheServidor | null>(null);
  protected readonly carregado = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly falhaServidor = signal(false);
  protected readonly filtro = signal<Filtro>('todos');
  protected readonly ampliar = signal<FotoTela | null>(null);
  /** Fotos baixadas do servidor nesta visita (id → endereço local). */
  private readonly baixadas = signal<Record<string, string | 'carregando' | 'falhou'>>({});
  private readonly locais = new Map<string, string>();
  private buscandoServidor = false;

  /** Com o servidor, a tela usa o que ele tem (fotos enviadas e decisões); sem ele, o que está no aparelho. */
  protected readonly tela = computed<DetalheTela | null>(() => {
    const s = this.servidor();
    if (s) return this.doServidor(s);
    const l = this.local();
    return l ? this.doAparelho(l) : null;
  });

  protected readonly subtitulo = computed(() => {
    const t = this.tela();
    return t ? `${t.placa} · ${t.quando}` : '';
  });

  protected readonly faixa = computed<{ rotulo: string; apoio: string; tom: TomChecklist }>(() => {
    const l = this.local();
    const t = this.tela()!;
    if (l && !this.servidor()) {
      switch (l.statusSync) {
        case 'FILA': return { rotulo: 'Na fila', apoio: 'Salvo no aparelho. Vai para o servidor quando houver sinal.', tom: 'atencao' };
        case 'ENVIANDO': return { rotulo: 'Enviando', apoio: 'Mandando o checklist e as fotos para o servidor.', tom: 'destaque' };
        case 'ERRO': return { rotulo: 'Recusado', apoio: l.erro ?? 'O servidor recusou o checklist. Corrija pela lista.', tom: 'erro' };
        default: break;
      }
    }
    if (!t.problemas) return { rotulo: 'Tudo OK', apoio: 'Nenhum item com problema.', tom: 'ok' };
    const apoio = !t.doServidor
      ? 'O gestor recebe cada Não OK para decidir.'
      : t.decididos === t.problemas
        ? 'O gestor já decidiu todos.'
        : t.decididos ? `O gestor decidiu ${t.decididos} de ${t.problemas}.` : 'Aguardando a decisão do gestor.';
    return { rotulo: resumoProblemas(t.problemas), apoio, tom: 'atencao' };
  });

  protected readonly totalItens = computed(() => this.tela()?.grupos.reduce((n, g) => n + g.itens.length, 0) ?? 0);
  protected readonly opcoesFiltro = computed(() => [
    { valor: 'todos' as Filtro, rotulo: `Todos (${this.totalItens()})` },
    { valor: 'problemas' as Filtro, rotulo: `Com problema (${this.tela()?.problemas ?? 0})` }
  ]);
  protected readonly gruposVisiveis = computed(() => {
    const grupos = this.tela()?.grupos ?? [];
    if (this.filtro() === 'todos') return grupos;
    return grupos.map((g) => ({ ...g, itens: g.itens.filter((i) => i.problema) })).filter((g) => g.itens.length);
  });
  protected readonly semSinalParaCompletar = computed(() => {
    const l = this.local();
    return !!l?.registrado && !this.servidor() && !this.rede.isOnline();
  });

  ngOnInit(): void {
    // Acompanha a fila (na fila → enviando → enviado) sem precisar reabrir.
    const assinatura = liveQuery(() => this.servico.buscar(this.id)).subscribe({
      next: (l) => {
        this.local.set(l ?? null);
        if (!l) {
          if (!this.servidor()) this.carregarServidor();
          return;
        }
        this.carregado.set(true);
        if (l.idServidor && !this.servidor()) this.carregarServidor(l.idServidor);
      }
    });
    this.destroyRef.onDestroy(() => assinatura.unsubscribe());
  }

  ngOnDestroy(): void {
    this.locais.forEach((url) => URL.revokeObjectURL(url));
    Object.values(this.baixadas()).forEach((url) => url.startsWith('blob:') && URL.revokeObjectURL(url));
  }

  /** Volta para a lista como estava (Meus ou Do veículo, com a placa); aberto por link, vai para a lista. */
  protected voltar(): void {
    if (this.router.lastSuccessfulNavigation()?.previousNavigation) this.location.back();
    else void this.router.navigate(['/checklist']);
  }

  /** Busca o detalhe no servidor. Sem sinal, fica o que está no aparelho (ou o aviso de internet). */
  protected carregarServidor(idServidor = this.local()?.idServidor ?? this.id): void {
    if (this.buscandoServidor) return;
    if (!this.rede.isOnline()) {
      this.carregado.set(true);
      return;
    }
    this.buscandoServidor = true;
    this.erro.set(null);
    this.falhaServidor.set(false);
    this.servico.detalhar(idServidor).then(
      (d) => {
        this.servidor.set(d);
        this.baixarFotos(d);
      },
      (e) => {
        // Com o registro no aparelho, a tela segue com ele (e avisa); só sem nada mostra o erro.
        if (this.local()) this.falhaServidor.set(true);
        else this.erro.set(mensagem(e));
      }
    ).finally(() => {
      this.buscandoServidor = false;
      this.carregado.set(true);
    });
  }

  private doServidor(d: ChecklistDetalheServidor): DetalheTela {
    const r = d.resumo;
    const id = r.id;
    const grupos: DetalheTela['grupos'] = [];
    let decididos = 0;
    for (const resp of d.respostas) {
      const titulo = resp.grupo ?? 'Itens';
      const grupo = grupos.find((g) => g.titulo === titulo) ?? grupos[grupos.push({ titulo, itens: [] }) - 1];
      const [principal, ...resto] = (resp.resposta ?? '').split(' — ');
      const decisao = resp.problema ? decisaoPendencia(resp.situacaoPendencia, resp.numeroOrdemServico) : null;
      if (decisao && resp.situacaoPendencia !== 'ABERTA') decididos++;
      grupo.itens.push({
        id: resp.id,
        pergunta: resp.pergunta,
        etiqueta: resp.tipoResposta === 'TEXTO' ? null : principal || 'Sem resposta',
        motivo: resto.join(' — ') || null,
        texto: resp.tipoResposta === 'TEXTO' ? resp.resposta : null,
        problema: resp.problema,
        comentario: resp.comentario,
        fotos: resp.fotos.map((f) => this.fotoServidor(id, f.id, f.descricao ?? resp.pergunta, f.recebida)),
        decisao
      });
    }
    return {
      placa: formatarPlaca(r.placa),
      quando: quandoChecklist(r.preenchidoEm),
      modelo: r.modeloNome,
      condutor: r.condutorNome,
      preenchidoPor: r.preenchidoPor,
      medicao: formatarMedicao(r.medicao, r.unidadeMedicao),
      base: r.baseNome,
      passagem: r.passagemVeiculo,
      liberacaoCnh: r.liberacaoCnh ? (d.justificativaLiberacaoCnh ?? 'Sim') : null,
      assinado: d.assinado,
      comentario: d.comentario,
      problemas: r.problemas,
      decididos,
      grupos,
      recebimento: d.fotosRecebimento.map((f) => this.fotoServidor(id, f.id, f.descricao ?? 'Recebimento', f.recebida)),
      doServidor: true
    };
  }

  /** O que está no aparelho, com os textos das perguntas do catálogo baixado. */
  private doAparelho(l: ChecklistVeiculoLocal): DetalheTela {
    const catalogo = this.servico.catalogo();
    const veiculo = catalogo?.veiculos.find((v) => v.idVeiculo === l.idVeiculo);
    const porId = new Map((catalogo?.modelos ?? []).map((m) => [m.id, m]));
    const principal = l.idModelo ? porId.get(l.idModelo) : undefined;
    const adicionais = l.idsModelosAdicionais.map((id) => porId.get(id)).filter((m) => !!m);
    const respostas = new Map(l.respostas.map((r) => [r.idPergunta, r]));
    const grupos: DetalheTela['grupos'] = [];
    let problemas = 0;
    if (principal) {
      for (const g of gruposDePerguntas(principal, adicionais)) {
        const itens: ItemTela[] = g.perguntas.map((p) => {
          const r = respostas.get(p.id);
          const problema = respostaComProblema(p, r);
          if (problema) problemas++;
          const texto = textoRespostaLocal(p, r);
          const [etiqueta, ...motivo] = texto.split(' — ');
          return {
            id: p.id,
            pergunta: p.texto,
            etiqueta: p.tipoResposta === 'TEXTO' ? null : etiqueta,
            motivo: motivo.join(' — ') || null,
            texto: p.tipoResposta === 'TEXTO' ? texto : null,
            problema,
            comentario: r?.comentario?.trim() || null,
            fotos: (r?.fotos ?? []).map((f) => this.fotoLocal(f, p.texto, l)),
            decisao: null
          };
        });
        grupos.push({ titulo: g.titulo, itens });
      }
    }
    const recebimento = l.fotosRecebimento.map((f) => {
      const descricao = principal?.fotosRecebimento.find((x) => x.id === f.idFotoRecebimento)?.descricao ?? 'Recebimento';
      return this.fotoLocal(f.foto, descricao, l);
    });
    const modelo = [principal?.nome, ...adicionais.map((m) => m!.nome)].filter(Boolean).join(' + ') || null;
    return {
      placa: formatarPlaca(l.placa),
      quando: quandoChecklist(l.preenchidoEm ?? l.criadoEm),
      modelo,
      condutor: l.condutorNome,
      preenchidoPor: null,
      medicao: formatarMedicao(l.medicao, veiculo?.unidadeMedicao),
      base: veiculo?.baseNome ?? null,
      passagem: false,
      liberacaoCnh: null,
      assinado: l.assinado,
      comentario: l.comentario.trim() || null,
      problemas: l.problemas ?? problemas,
      decididos: 0,
      grupos,
      recebimento,
      doServidor: false
    };
  }

  private fotoLocal(f: FotoChecklistLocal, rotulo: string, l: ChecklistVeiculoLocal): FotoTela {
    if (f.arquivo.size) {
      let url = this.locais.get(f.idFoto);
      if (!url) {
        url = URL.createObjectURL(f.arquivo);
        this.locais.set(f.idFoto, url);
      }
      return { id: f.idFoto, rotulo, url, situacao: 'pronta' };
    }
    // O arquivo saiu do aparelho depois do envio: só o servidor tem.
    return { id: f.idFoto, rotulo, url: null, situacao: l.statusSync === 'ENVIADO' ? 'sem-sinal' : 'no-celular' };
  }

  private fotoServidor(idChecklist: string, idFoto: string, rotulo: string, recebida: boolean): FotoTela {
    // A foto pode estar no aparelho ainda (fila de envio): mostra a local.
    const local = this.locais.get(idFoto) ?? this.arquivoLocal(idFoto);
    if (local) return { id: idFoto, rotulo, url: local, situacao: 'pronta' };
    if (!recebida) return { id: idFoto, rotulo, url: null, situacao: 'no-celular' };
    const baixada = this.baixadas()[idFoto];
    if (baixada && baixada !== 'carregando' && baixada !== 'falhou') return { id: idFoto, rotulo, url: baixada, situacao: 'pronta' };
    return { id: idFoto, rotulo, url: null, situacao: baixada === 'falhou' ? 'sem-sinal' : 'carregando' };
  }

  private arquivoLocal(idFoto: string): string | null {
    const l = this.local();
    if (!l) return null;
    const foto = [...l.respostas.flatMap((r) => r.fotos), ...l.fotosRecebimento.map((f) => f.foto)].find((f) => f.idFoto === idFoto);
    if (!foto?.arquivo.size) return null;
    const url = URL.createObjectURL(foto.arquivo);
    this.locais.set(idFoto, url);
    return url;
  }

  /** Baixa uma vez as fotos já recebidas pelo servidor que não estão no aparelho. */
  private baixarFotos(d: ChecklistDetalheServidor): void {
    const todas = [...d.respostas.flatMap((r) => r.fotos), ...d.fotosRecebimento];
    for (const f of todas) {
      if (!f.recebida || this.baixadas()[f.id] || this.arquivoLocal(f.id)) continue;
      this.baixadas.update((b) => ({ ...b, [f.id]: 'carregando' }));
      this.servico.baixarFoto(d.resumo.id, f.id).then(
        (blob) => this.baixadas.update((b) => ({ ...b, [f.id]: URL.createObjectURL(blob) })),
        () => this.baixadas.update((b) => ({ ...b, [f.id]: 'falhou' }))
      );
    }
  }
}

function mensagem(e: unknown): string {
  const erro = e as { status?: number; error?: { detail?: string } } | null;
  if (erro?.status === 404) return 'Este checklist não existe mais no servidor.';
  return erro?.error?.detail ?? 'Sem resposta do servidor. Confira a internet e tente de novo.';
}
