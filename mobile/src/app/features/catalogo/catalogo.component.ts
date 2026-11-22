import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ToastService } from '../../core/ui/toast.service';
import { montarCarimbo } from '../../core/fotos/carimbo';
import { EvidenciaPreparada } from '../../core/sst/evidencia-foto.util';
import {
  BarraTopoComponent, ChipsComponent, FolhaComponent, FotoExibida, FotosComponent, IconeComponent, OpcaoChip, OpcaoSegmento,
  OpcaoSeletor, QuantidadeComponent, SegmentadoComponent, SeletorComponent, StatusEnvioComponent, VazioComponent,
} from '../../ui';

/** Miniatura sintética (sem rede): um quadro colorido com o número, para a grade de fotos do catálogo. */
function miniatura(cor: string, texto: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="${cor}"/>`
    + `<text x="120" y="135" font-size="48" text-anchor="middle" fill="white" font-family="sans-serif">${texto}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Catálogo dos componentes de toque do app (rota de desenvolvimento `/catalogo`, sem link no app).
 * Serve para conferir o visual em claro/escuro, celular e tablet, e para os screenshots do redesign.
 */
@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [
    BarraTopoComponent, ChipsComponent, FolhaComponent, FotosComponent, IconeComponent, QuantidadeComponent, SegmentadoComponent,
    SeletorComponent, StatusEnvioComponent, VazioComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <geo-barra-topo titulo="Catálogo de componentes" subtitulo="GEO Campo" navegacao="nenhuma" />
    <div class="geo-passos" aria-hidden="true"><i class="feito"></i><i class="feito"></i><i></i><i></i></div>

    <h2 class="geo-secao">Botões</h2>
    <div class="bloco linha">
      <button type="button" class="geo-btn geo-btn--principal">Principal</button>
      <button type="button" class="geo-btn geo-btn--tonal">Tonal</button>
      <button type="button" class="geo-btn geo-btn--neutro">Neutro</button>
      <button type="button" class="geo-btn geo-btn--texto">Texto</button>
      <button type="button" class="geo-btn geo-btn--perigo">Perigo</button>
      <button type="button" class="geo-btn geo-btn--principal" disabled>Desabilitado</button>
    </div>

    <h2 class="geo-secao">Campos</h2>
    <div class="bloco">
      <div class="geo-campo">
        <label for="cat-nota">Número da nota</label>
        <input id="cat-nota" class="geo-input geo-input--grande" inputmode="numeric" placeholder="0000000">
        <span class="geo-campo__ajuda">Como está na OS ou no talão.</span>
      </div>
      <geo-seletor rotulo="Tipo de serviço" [opcoes]="tipos" [obrigatorio]="true" placeholder="Escolher o tipo" />
      <geo-segmentado rotulo="Etapa" [opcoes]="etapas" [(valor)]="etapa" />
      <geo-quantidade rotulo="Postes" unidade="un" [(valor)]="quantidade" />
    </div>

    <h2 class="geo-secao">Filtros e interruptor</h2>
    <geo-chips [opcoes]="filtros" [contagem]="{ fila: 2, problema: 1 }" [(valor)]="filtro" />
    <ul class="geo-grupo">
      <li><button type="button" role="switch" class="geo-linha geo-linha--acao" [attr.aria-checked]="ligado()" (click)="ligado.set(!ligado())">
        <span class="geo-linha__texto"><span class="geo-linha__titulo">Usar dados móveis</span>
          <span class="geo-linha__apoio">Envia também pelo 4G/5G</span></span>
        <span class="geo-interruptor" aria-hidden="true"><span></span></span>
      </button></li>
    </ul>

    <h2 class="geo-secao">Lista e estado de envio</h2>
    <ul class="geo-grupo">
      @for (e of estados; track e) {
        <li><div class="geo-linha">
          <span class="geo-selo geo-selo--destaque"><geo-icone nome="servicos" /></span>
          <span class="geo-linha__texto"><span class="geo-linha__titulo">Ponto 4 · Poste DT 11 m</span>
            <span class="geo-linha__apoio">Estrutura N3, aterramento e cruzeta; o texto de apoio usa até duas linhas antes de cortar</span></span>
          <geo-status-envio [estado]="e" [discreto]="e === 'synced'" />
        </div></li>
      }
    </ul>

    <h2 class="geo-secao">Fotos com carimbo</h2>
    <div class="bloco">
      <geo-fotos rotulo="Fotos do ponto" [fotos]="fotos()" [galeria]="true" [carimbo]="carimbo"
        (adicionada)="adicionar($event)" (removida)="remover($event)" />
    </div>

    <h2 class="geo-secao">Folha, desfazer e vazio</h2>
    <div class="bloco linha">
      <button type="button" class="geo-btn geo-btn--neutro" (click)="folha.set(true)">Abrir folha</button>
      <button type="button" class="geo-btn geo-btn--neutro" (click)="desfazer()">Ação com desfazer</button>
    </div>
    <geo-vazio icone="servicos" titulo="Nenhuma execução hoje" texto="Toque em Nova execução para lançar a primeira." />
    <div class="geo-esqueletos" role="status" aria-busy="true" aria-label="Carregando">
      <span class="geo-esqueleto" style="height: 64px"></span><span class="geo-esqueleto" style="height: 64px"></span>
    </div>
    <div class="geo-respiro"></div>

    <geo-folha [aberta]="folha()" (fechar)="folha.set(false)" titulo="Sem condição de executar" descricao="Diga o motivo; a APR deixa de ser exigida.">
      <ul class="geo-grupo">
        @for (m of motivos; track m) {
          <li><button type="button" class="geo-linha geo-linha--acao" (click)="folha.set(false)">
            <span class="geo-linha__texto"><span class="geo-linha__titulo">{{ m }}</span></span></button></li>
        }
      </ul>
    </geo-folha>
  `,
  styles: [`
    :host { display: block; }
    .bloco { display: grid; gap: var(--geo-e4); padding: 0 var(--geo-margem); }
    .bloco.linha { display: flex; flex-wrap: wrap; gap: var(--geo-e2); }
  `],
})
export class CatalogoComponent {
  private readonly toast = inject(ToastService);

  readonly tipos: OpcaoSeletor[] = [
    { valor: 'CORTE', rotulo: 'Corte', apoio: 'Código CS' },
    { valor: 'LIGACAO', rotulo: 'Ligação nova', apoio: 'Código CL' },
  ];
  readonly etapas: OpcaoSegmento<string>[] = [
    { valor: 'ANTES', rotulo: 'Antes' }, { valor: 'DURANTE', rotulo: 'Durante' }, { valor: 'DEPOIS', rotulo: 'Depois' },
  ];
  readonly filtros: OpcaoChip[] = [
    { valor: 'todas', rotulo: 'Todas' }, { valor: 'fila', rotulo: 'Na fila' }, { valor: 'problema', rotulo: 'Com problema' },
  ];
  readonly estados = ['committed', 'queued', 'syncing', 'synced', 'error', 'conflict'] as const;
  readonly motivos = ['Clima', 'Acesso impedido', 'Falta de material', 'Desligamento não confirmado'];
  readonly carimbo = () => montarCarimbo({ titulo: 'Obra 1234 · Ponto 4', detalhe: 'Poste instalado · Depois da execução', data: new Date(),
    latitude: -3.7319, longitude: -38.5267, precisao: 12, autoria: 'EQP-01 · ENCARREGADO' });

  readonly etapa = signal('DEPOIS');
  readonly quantidade = signal(2);
  readonly filtro = signal('todas');
  readonly ligado = signal(true);
  readonly folha = signal(false);
  readonly fotos = signal<FotoExibida[]>([
    { id: 'a', url: miniatura('#3f3f46', 'Antes'), legenda: 'Antes', estado: 'synced' },
    { id: 'b', url: miniatura('#52525b', 'Durante'), legenda: 'Durante', estado: 'queued' },
  ]);

  adicionar(foto: EvidenciaPreparada): void {
    const id = crypto.randomUUID();
    this.fotos.update(lista => [...lista, { id, url: URL.createObjectURL(foto.arquivo), legenda: 'Depois', estado: 'committed' }]);
  }

  remover(id: string): void {
    const anterior = this.fotos();
    this.fotos.set(anterior.filter(f => f.id !== id));
    this.toast.desfazer('Foto removida', () => this.fotos.set(anterior));
  }

  desfazer(): void {
    this.toast.desfazer('Ponto 4 marcado como feito', () => this.toast.info('Desfeito'));
  }
}
