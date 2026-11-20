import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { GeoButtonComponent, GeoIconButtonComponent } from '@geo/ui';
import { GeoAsyncStateComponent } from '@geo/ui/feedback';
import { ArquivoAssistente, ArtefatoAssistente } from '../../../core/models/assistente.models';
import { CopilotoStore, formatarTamanho } from '../copiloto.store';
import { ICONE_ARTEFATO, ROTULO_ARTEFATO } from '../copiloto-formatos';

const ICONE_ARQUIVO: Record<string, string> = {
  PDF: 'pi pi-file-pdf',
  PLANILHA: 'pi pi-file-excel',
  CSV: 'pi pi-file-excel',
  IMAGEM: 'pi pi-image',
  DOCUMENTO: 'pi pi-file-word',
};

/** Tudo o que a conversa produziu e recebeu, num lugar só: artefatos, arquivos gerados e anexos (última versão). */
@Component({
  selector: 'app-copiloto-arquivos',
  standalone: true,
  imports: [GeoButtonComponent, GeoIconButtonComponent, GeoAsyncStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="arquivos" aria-labelledby="copiloto-arquivos-titulo">
      <header class="arquivos__cabecalho">
        <span class="arquivos__icone" aria-hidden="true"><i class="pi pi-folder-open"></i></span>
        <div class="arquivos__titulos">
          <h2 class="arquivos__titulo" id="copiloto-arquivos-titulo">Arquivos da conversa</h2>
          <p class="arquivos__subtitulo">Só a versão mais recente de cada arquivo</p>
        </div>
        <ng-content select="[acoes-painel]"></ng-content>
        <geo-icon-button icon="pi pi-times" label="Fechar a lista de arquivos" size="icon-sm" (pressed)="fechar.emit()"></geo-icon-button>
      </header>

      <div class="arquivos__corpo">
        @if (!artefatos().length && !gerados().length && !anexos().length) {
          <geo-async-state state="empty" [compact]="true" title="Nenhum arquivo ainda"
            description="Relatórios, planilhas, dashboards e anexos desta conversa aparecem aqui."></geo-async-state>
        }
        @if (artefatos().length) {
          <section class="grupo" aria-labelledby="arquivos-artefatos">
            <h3 class="grupo__titulo" id="arquivos-artefatos">Criados pela Bússola</h3>
            <ul>
              @for (artefato of artefatos(); track artefato.codigo) {
                <li class="item">
                  <span class="item__icone" aria-hidden="true"><i [class]="iconeArtefato[artefato.tipo] || 'pi pi-file'"></i></span>
                  <span class="item__texto">
                    <span class="item__nome" [attr.title]="artefato.titulo">{{ artefato.titulo }}</span>
                    <span class="item__meta">{{ rotuloArtefato[artefato.tipo] || artefato.tipo }}</span>
                  </span>
                  <geo-button variant="ghost" size="sm" icon="pi pi-arrow-right" label="Abrir"
                    [ariaLabel]="'Abrir ' + artefato.titulo" (pressed)="abrirArtefato.emit(artefato.codigo)"></geo-button>
                </li>
              }
            </ul>
          </section>
        }
        @for (grupo of grupos(); track grupo.titulo) {
          @if (grupo.itens.length) {
            <section class="grupo" [attr.aria-label]="grupo.titulo">
              <h3 class="grupo__titulo">{{ grupo.titulo }}</h3>
              <ul>
                @for (arquivo of grupo.itens; track arquivo.id) {
                  <li class="item">
                    <span class="item__icone" aria-hidden="true"><i [class]="icone(arquivo)"></i></span>
                    <span class="item__texto">
                      <span class="item__nome" [attr.title]="arquivo.nome">{{ arquivo.nome }}</span>
                      <span class="item__meta">{{ formatarTamanho(arquivo.tamanhoBytes) }}@if (arquivo.criadoEm) { · {{ data(arquivo.criadoEm) }} }</span>
                    </span>
                    <geo-icon-button icon="pi pi-download" [label]="'Baixar ' + arquivo.nome" tooltip="Baixar" size="icon-sm"
                      (pressed)="baixar(arquivo)"></geo-icon-button>
                  </li>
                }
              </ul>
            </section>
          }
        }
      </div>
    </section>
  `,
  styles: `
    :host { display: flex; flex: 1; min-width: 0; min-height: 0; }
    .arquivos { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; background: var(--geo-surface); }
    .arquivos__cabecalho { display: flex; align-items: center; gap: 0.65rem; padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--geo-border); }
    .arquivos__icone {
      display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
      width: 2.2rem; height: 2.2rem; border-radius: var(--geo-radius-sm); background: var(--geo-brand-soft); color: var(--geo-brand);
    }
    .arquivos__titulos { flex: 1; min-width: 0; }
    .arquivos__titulo { margin: 0; font-size: var(--geo-font-title); font-weight: 600; color: var(--geo-foreground); }
    .arquivos__subtitulo { margin: 0.1rem 0 0; font-size: var(--geo-font-caption); color: var(--geo-foreground-subtle); }
    .arquivos__corpo { flex: 1; min-height: 0; overflow-y: auto; padding: 0.6rem 0.9rem 1.2rem; }
    .grupo + .grupo { margin-top: 1rem; }
    .grupo__titulo {
      margin: 0.4rem 0 0.4rem; font-size: var(--geo-font-caption); font-weight: 600; letter-spacing: 0.05em;
      text-transform: uppercase; color: var(--geo-foreground-subtle);
    }
    ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.4rem; }
    .item {
      display: flex; align-items: center; gap: 0.65rem; padding: 0.5rem 0.6rem;
      border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface);
    }
    .item__icone {
      display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
      width: 2rem; height: 2rem; border-radius: var(--geo-radius-sm); background: var(--geo-surface-muted); color: var(--geo-brand);
    }
    .item__texto { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .item__nome { font-size: var(--geo-font-body); font-weight: 600; color: var(--geo-foreground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item__meta { font-size: var(--geo-font-caption); color: var(--geo-foreground-subtle); }
  `,
})
export class CopilotoArquivosComponent {
  private readonly store = inject(CopilotoStore);

  readonly fechar = output<void>();
  readonly abrirArtefato = output<string>();

  protected readonly artefatos = computed<ArtefatoAssistente[]>(() => [...this.store.artefatosAtuais()].reverse());
  protected readonly gerados = computed(() => this.store.arquivosAtuais().filter((arquivo) => arquivo.origem === 'GERADO').reverse());
  protected readonly anexos = computed(() => this.store.arquivosAtuais().filter((arquivo) => arquivo.origem !== 'GERADO').reverse());
  protected readonly grupos = computed(() => [
    { titulo: 'Arquivos gerados', itens: this.gerados() },
    { titulo: 'Anexos enviados', itens: this.anexos() },
  ]);

  protected readonly iconeArtefato = ICONE_ARTEFATO;
  protected readonly rotuloArtefato = ROTULO_ARTEFATO;
  protected readonly formatarTamanho = formatarTamanho;

  protected icone(arquivo: ArquivoAssistente): string {
    return ICONE_ARQUIVO[arquivo.categoria] ?? 'pi pi-file';
  }

  protected data(valor: string): string {
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? '' : data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  protected baixar(arquivo: ArquivoAssistente): void {
    void this.store.baixar(arquivo);
  }
}
