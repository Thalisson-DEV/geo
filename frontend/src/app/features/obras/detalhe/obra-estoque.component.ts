import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  GeoAsyncStateComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoDialogShellComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextareaComponent,
  NotificationService,
} from '@geo/ui';
import { Observable, forkJoin } from 'rxjs';
import { LinhaMaterialObra, LocalMaterialObra, MaterialDaObra, RastroEntreObras } from '../../../core/models/estoque-obra.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AlmoxarifadoService } from '../../../core/services/almoxarifado.service';
import { EstoqueObraService } from '../../../core/services/estoque-obra.service';
import { ObrasService } from '../../../core/services/obras.service';

type Carga = { estado: 'loading' } | { estado: 'error'; mensagem: string } | { estado: 'ready'; dados: MaterialDaObra };

/** Um local (caminhão ou canteiro) com o material desta obra que está nele. */
interface LocalComMaterial {
  idEstoque: string;
  nome: string;
  tipo: string;
  idEquipe: string | null;
  itens: { linha: LinhaMaterialObra; local: LocalMaterialObra }[];
}

interface ItemAcao {
  idMaterial: string;
  codigo: string;
  descricao: string;
  unidade?: string | null;
  condicao: 'NOVO' | 'SUCATA';
  disponivel: number;
  quantidade: number | null;
}

/**
 * Material da obra em qualquer lugar: o previsto no planejamento, o que foi entregue às equipes, o que foi aplicado, o
 * que ainda está com equipes e canteiros (e onde), o que voltou ao almoxarifado e o que passou de/para outras obras.
 * O administrativo devolve a sobra de um caminhão ou canteiro ao almoxarifado ou passa o material para outra obra.
 */
@Component({
  selector: 'app-obra-estoque',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    GeoAsyncStateComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDialogShellComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextareaComponent,
  ],
  templateUrl: './obra-estoque.component.html',
  styleUrl: './obra-estoque.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObraEstoqueComponent {
  private readonly service = inject(EstoqueObraService);
  private readonly almoxarifado = inject(AlmoxarifadoService);
  private readonly obras = inject(ObrasService);
  private readonly notificacoes = inject(NotificationService);

  readonly idObra = input.required<string>();
  readonly podeMovimentar = input(false);
  /** Avisa a ficha para recarregar as movimentações depois de uma ação. */
  readonly movimentado = output<void>();

  protected readonly carga = signal<Carga>({ estado: 'loading' });
  protected readonly dados = computed(() => {
    const c = this.carga();
    return c.estado === 'ready' ? c.dados : null;
  });
  protected readonly materiais = computed(() => this.dados()?.materiais ?? []);
  protected readonly rastros = computed(() => this.dados()?.rastros ?? []);
  protected readonly todosRastros = signal(false);
  /** O rastro vem por lançamento; aqui junta por equipe e tipo de caso, somando por material. */
  protected readonly gruposRastro = computed(() => {
    const grupos = new Map<string, { chave: string; sentido: string; primeiro: RastroEntreObras; ultima: string; qtdLancamentos: number;
      porMaterial: Map<string, { codigo: string; unidade?: string | null; quantidade: number }> }>();
    for (const r of this.rastros()) {
      const chave = [r.sentido, r.tipo, r.local ?? '', r.idOutraObra ?? ''].join('|');
      const g = grupos.get(chave) ?? { chave, sentido: r.sentido, primeiro: r, ultima: r.dataHora, qtdLancamentos: 0, porMaterial: new Map() };
      g.qtdLancamentos++;
      if (r.dataHora > g.ultima) g.ultima = r.dataHora;
      const m = g.porMaterial.get(r.codigo) ?? { codigo: r.codigo, unidade: r.unidade, quantidade: 0 };
      m.quantidade += Number(r.quantidade) || 0;
      g.porMaterial.set(r.codigo, m);
      grupos.set(chave, g);
    }
    return [...grupos.values()].map((g) => ({
      ...g,
      itens: [...g.porMaterial.values()].map((m) => m.codigo + ' × ' + this.numero(m.quantidade) + (m.unidade ? ' ' + m.unidade : '')).join(', '),
    }));
  });
  protected readonly rastrosExibidos = computed(() => (this.todosRastros() ? this.gruposRastro() : this.gruposRastro().slice(0, 3)));
  protected readonly mensagemErro = computed(() => {
    const c = this.carga();
    return c.estado === 'error' ? c.mensagem : '';
  });

  /** Caminhões e canteiros com material desta obra agora. */
  protected readonly locais = computed<LocalComMaterial[]>(() => {
    const porLocal = new Map<string, LocalComMaterial>();
    for (const linha of this.materiais()) {
      for (const local of linha.onde) {
        const atual = porLocal.get(local.idEstoque) ?? { idEstoque: local.idEstoque, nome: local.nome, tipo: local.tipo, idEquipe: local.idEquipe ?? null, itens: [] };
        atual.itens.push({ linha, local });
        porLocal.set(local.idEstoque, atual);
      }
    }
    return [...porLocal.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  });

  /** Um aviso só, com o tom do caso mais grave e a lista do que conferir. */
  protected readonly avisos = computed(() => {
    const r = this.resumo();
    const qtd = (n: number, um: string, varios: string) => n + ' ' + (n === 1 ? um : varios);
    const lista: string[] = [];
    if (r.semSaldo) lista.push(qtd(r.semSaldo, 'material foi aplicado', 'materiais foram aplicados') + ' sem constar no caminhão da equipe. Talvez a retirada não tenha sido registrada; o rastro mostra quem aplicou.');
    if (r.deOutras) lista.push(qtd(r.deOutras, 'material aplicado veio', 'materiais aplicados vieram') + ' de outra obra.');
    if (r.livre) lista.push(qtd(r.livre, 'material aplicado veio', 'materiais aplicados vieram') + ' do estoque da equipe que não era desta obra.');
    if (r.paraOutras) lista.push(qtd(r.paraOutras, 'material desta obra foi usado', 'materiais desta obra foram usados') + ' em outra obra.');
    return lista;
  });
  protected readonly tomAviso = computed(() => (this.resumo().semSaldo || this.resumo().deOutras || this.resumo().livre ? 'warning' : 'info'));

  protected readonly resumo = computed(() => {
    const m = this.materiais();
    return {
      entregues: m.filter((l) => l.entregue > 0).length,
      comEquipes: m.filter((l) => l.comEquipes > 0).length,
      deOutras: m.filter((l) => l.recebido > 0).length,
      paraOutras: m.filter((l) => l.cedido > 0).length,
      semSaldo: m.filter((l) => l.aplicadoSemSaldo > 0).length,
      livre: m.filter((l) => l.semMaterialDaObra - l.aplicadoSemSaldo > 0).length,
    };
  });

  // ── Ação num local ─────────────────────────────────────────────────────────
  protected readonly acaoLocal = signal<LocalComMaterial | null>(null);
  protected readonly modo = signal<'DEVOLVER' | 'REMANEJAR'>('DEVOLVER');
  protected readonly itensAcao = signal<ItemAcao[]>([]);
  protected readonly almoxOpcoes = signal<GeoSelectOption<string>[]>([]);
  protected readonly obraOpcoes = signal<GeoSelectOption<string>[]>([]);
  protected readonly idAlmox = signal<string | null>(null);
  protected readonly idObraDestino = signal<string | null>(null);
  protected readonly motivo = signal('');
  protected readonly enviando = signal(false);
  protected readonly preparando = signal(false);
  protected readonly erroAcao = signal('');

  constructor() {
    effect(() => {
      const id = this.idObra();
      untracked(() => this.carregar(id));
    });
  }

  carregar(id = this.idObra()): void {
    this.carga.set({ estado: 'loading' });
    this.service.materialDaObra(id).subscribe({
      next: (dados) => this.carga.set({ estado: 'ready', dados }),
      error: (e) => this.carga.set({ estado: 'error', mensagem: getErrorMessage(e) }),
    });
  }

  private numero(n: number): string {
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  }

  protected iconeRastro(r: RastroEntreObras): string {
    if (r.sentido === 'SEM_SALDO') return 'pi pi-exclamation-triangle';
    if (r.sentido === 'LIVRE') return 'pi pi-box';
    return r.sentido === 'RECEBIDO' ? 'pi pi-arrow-down-left' : 'pi pi-arrow-up-right';
  }

  protected iconeLocal(tipo: string): string {
    return tipo === 'CANTEIRO' ? 'pi pi-warehouse' : 'pi pi-truck';
  }

  protected rotuloLocal(tipo: string): string {
    return tipo === 'CANTEIRO' ? 'Canteiro' : 'Caminhão';
  }

  protected textoRastro(r: RastroEntreObras): string {
    const equipe = r.local ?? 'A equipe';
    if (r.sentido === 'SEM_SALDO') return `${equipe} aplicou sem ter o material no caminhão`;
    if (r.sentido === 'LIVRE') return `${equipe} aplicou com material livre do caminhão (não entregue para esta obra)`;
    const outra = r.numeroOutraObra ? `obra ${r.numeroOutraObra}` : 'material livre';
    if (r.tipo === 'REMANEJAMENTO') {
      return r.sentido === 'RECEBIDO' ? `Passado para esta obra, vindo da ${outra}` : `Passado desta obra para a ${outra}`;
    }
    if (r.tipo === 'ESTORNO') {
      return 'Apontamento estornado: o material voltou à obra de origem';
    }
    return r.sentido === 'RECEBIDO'
      ? `Aplicado nesta obra com material da ${outra}`
      : `Material desta obra aplicado na ${outra}`;
  }

  protected abrirAcao(local: LocalComMaterial): void {
    this.acaoLocal.set(local);
    this.modo.set(local.idEquipe ? 'REMANEJAR' : 'DEVOLVER');
    this.idAlmox.set(null);
    this.idObraDestino.set(null);
    this.motivo.set('');
    this.erroAcao.set('');
    this.itensAcao.set(
      local.itens.map(({ linha, local: l }) => ({
        idMaterial: linha.idMaterial,
        codigo: linha.codigo,
        descricao: linha.descricao,
        unidade: linha.unidade,
        condicao: l.condicao,
        disponivel: l.quantidade,
        quantidade: l.quantidade,
      })),
    );
    if (this.almoxOpcoes().length === 1) this.idAlmox.set(this.almoxOpcoes()[0].value);
    if (!this.almoxOpcoes().length || !this.obraOpcoes().length) {
      this.preparando.set(true);
      forkJoin({
        estoques: this.almoxarifado.listarEstoquesAtivos(),
        obras: this.obras.listarObras({ ativo: true, size: 1000, sort: 'numero,asc' }),
      }).subscribe({
        next: ({ estoques, obras }) => {
          const fisicos = estoques.content.filter((e) => e.tipoEstoque?.nome?.toUpperCase() === 'FISICO');
          this.almoxOpcoes.set(fisicos.map((e) => ({ label: e.nomeIdentificador, value: e.id })));
          // Um almoxarifado só, ou um só na base do caminhão: já vem escolhido.
          const caminhao = estoques.content.find((e) => e.id === local.idEstoque);
          const daBase = fisicos.filter((e) => !!caminhao?.idBaseOperacional && e.idBaseOperacional === caminhao.idBaseOperacional);
          const sugerido = fisicos.length === 1 ? fisicos[0] : daBase.length === 1 ? daBase[0] : null;
          if (sugerido && !this.idAlmox()) this.idAlmox.set(sugerido.id);
          this.obraOpcoes.set(
            obras.content
              .filter((o) => o.id !== this.idObra())
              .map((o) => ({ label: `${o.numero}${o.titulo ? ' · ' + o.titulo : ''}`, value: o.id })),
          );
          this.preparando.set(false);
        },
        error: (e) => {
          this.erroAcao.set(getErrorMessage(e));
          this.preparando.set(false);
        },
      });
    }
  }

  protected definirQuantidade(indice: number, valor: number | null): void {
    this.itensAcao.update((itens) => itens.map((item, i) => (i === indice ? { ...item, quantidade: valor } : item)));
  }

  protected readonly itensValidos = computed(() =>
    this.itensAcao().filter((i) => (i.quantidade ?? 0) > 0),
  );

  protected readonly excede = computed(() => this.itensAcao().some((i) => (i.quantidade ?? 0) > i.disponivel));

  protected readonly pendencia = computed(() => {
    if (!this.itensValidos().length) return 'Informe a quantidade de ao menos um material.';
    if (this.excede()) return 'Há quantidade maior do que a desta obra aqui.';
    if (this.modo() === 'DEVOLVER' && !this.idAlmox()) return 'Escolha o almoxarifado que recebe.';
    if (this.modo() === 'REMANEJAR' && !this.idObraDestino()) return 'Escolha a obra que vai usar.';
    if (this.modo() === 'REMANEJAR' && !this.motivo().trim()) return 'Diga o motivo.';
    return '';
  });

  protected readonly podeConfirmar = computed(() => {
    if (!this.itensValidos().length || this.excede() || this.enviando()) return false;
    if (this.modo() === 'DEVOLVER') return !!this.idAlmox();
    return !!this.idObraDestino() && this.motivo().trim().length > 0;
  });

  protected confirmar(): void {
    const local = this.acaoLocal();
    if (!local || !this.podeConfirmar()) return;
    this.enviando.set(true);
    this.erroAcao.set('');
    const itens = this.itensValidos();
    const pedido: Observable<unknown> =
      this.modo() === 'DEVOLVER'
        ? this.service.devolverSobra({
            idOrigem: local.idEstoque,
            idAlmoxarifado: this.idAlmox()!,
            observacao: this.motivo().trim() || null,
            itens: itens.map((i) => ({ idMaterial: i.idMaterial, condicao: i.condicao, idObra: this.idObra(), quantidade: i.quantidade! })),
          })
        : forkJoin(
            itens.map((i) =>
              this.service.remanejar({
                idEstoque: local.idEstoque,
                idMaterial: i.idMaterial,
                condicao: i.condicao,
                idObraOrigem: this.idObra(),
                idObraDestino: this.idObraDestino(),
                quantidade: i.quantidade!,
                motivo: this.motivo().trim(),
              }),
            ),
          );
    pedido.subscribe({
      next: () => {
        this.enviando.set(false);
        this.notificacoes.success(
          this.modo() === 'DEVOLVER'
            ? `Sobra de ${local.nome} recebida no almoxarifado.`
            : `Material de ${local.nome} passado para a outra obra.`,
        );
        this.acaoLocal.set(null);
        this.carregar();
        this.movimentado.emit();
      },
      error: (e: unknown) => {
        this.enviando.set(false);
        this.erroAcao.set(getErrorMessage(e));
      },
    });
  }
}
