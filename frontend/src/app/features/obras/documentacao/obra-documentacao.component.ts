import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  GeoAsyncStateComponent,
  GeoBooleanControlComponent,
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoConfirmationService,
  GeoFileInputComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoIconButtonComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoStatusComponent,
  GeoTextInputComponent,
  NotificationService
} from '@geo/ui';
import { Observable, filter, take, timer } from 'rxjs';
import {
  DocumentacaoObra,
  DocumentoAsBuilt,
  EquipamentoObra,
  EvidenciaPonto,
  FinalidadeChecklist,
  ModeloChecklistResponse,
  PontoDocumentacao,
  TipoEquipamento,
  VisitaPrevia
} from '../../../core/models/obras-documentacao.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { AuthService } from '../../../core/services/auth.service';
import { ObrasDocumentacaoService } from '../../../core/services/obras-documentacao.service';
import { ObrasService } from '../../../core/services/obras.service';
import { ChecklistRespostasComponent } from './checklist-respostas.component';
import { RespostasEmEdicao, itensFaltando, paraInformadas, pendentes, respostasIniciais } from './checklist.logic';
import { EvidenciaMiniaturaComponent } from './evidencia-miniatura.component';
import { EvidenciaVisualizadorComponent } from './evidencia-visualizador.component';
import { VisitaPreviaDrawerComponent } from './visita-previa-drawer.component';

const INTERVALO_GERACAO_MS = 3000;
const LIMITE_FOTO_BYTES = 15 * 1024 * 1024;
const MINIATURAS_NO_CARTAO = 4;
const PONTOS_PARA_FILTRAR = 6;
/** Pontos mostrados antes de "Mostrar todos": obras grandes têm dezenas de pontos e empurravam o resto da ficha. */
const PONTOS_VISIVEIS = 12;
const ORDEM_NATURAL = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

type FiltroPontos = 'TODOS' | 'EXECUTADOS' | 'FALTANDO';

const FILTROS_PONTOS: GeoSelectOption<FiltroPontos>[] = [
  { label: 'Todos os pontos', value: 'TODOS' },
  { label: 'Executados', value: 'EXECUTADOS' },
  { label: 'Com foto faltando', value: 'FALTANDO' }
];

const TIPOS_EQUIPAMENTO: GeoSelectOption<TipoEquipamento>[] = [
  { label: 'Religador', value: 'RELIGADOR' },
  { label: 'Regulador', value: 'REGULADOR' }
];

/** Visita prévia, book e As Built, e equipamentos da obra. O pessoal de campo lança as fotos pelo app; aqui se analisa e também se pode lançar, com os mesmos comandos. */
@Component({
  selector: 'app-obra-documentacao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    GeoAsyncStateComponent,
    GeoBooleanControlComponent,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoFileInputComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoIconButtonComponent,
    GeoSelectComponent,
    GeoStatusComponent,
    GeoTextInputComponent,
    ChecklistRespostasComponent,
    EvidenciaMiniaturaComponent,
    EvidenciaVisualizadorComponent,
    VisitaPreviaDrawerComponent
  ],
  template: `
    @if (erro()) {
      <geo-async-state state="error" [compact]="true" title="Não foi possível carregar a documentação" [description]="erro()!" actionLabel="Tentar de novo" (action)="carregar()"></geo-async-state>
    } @else if (!dados()) {
      <geo-async-state state="loading" [compact]="true" title="Carregando a documentação"></geo-async-state>
    } @else {
      @let d = dados()!;
      <div class="od">
        <!-- Visita prévia -->
        <section class="od-bloco" aria-labelledby="od-visita">
          <header class="od-bloco__topo">
            <h3 id="od-visita">Visita prévia</h3>
            <geo-status [tone]="d.visitaRealizada ? 'success' : 'warning'" [icon]="d.visitaRealizada ? 'pi-check-circle' : 'pi-clock'">{{ d.visitaRealizada ? 'Realizada' : 'Não realizada' }}</geo-status>
            @if (podeEscrever) {
              <geo-button class="od-bloco__acao" variant="ghost" size="sm" icon="pi pi-plus" label="Registrar visita" (pressed)="novaVisita()"></geo-button>
            }
          </header>
          @if (!d.visitaRealizada) {
            <geo-callout tone="info" icon="pi pi-info-circle" title="Visita prévia não realizada" [dense]="true">
              Recomendada antes de iniciar a execução, para levantar acesso, interferências e necessidades da obra. Não impede programar nem executar.
            </geo-callout>
          }
          @if (d.visitas.length) {
            <ul class="od-lista">
              @for (v of d.visitas; track v.id) {
                <li>
                  <div class="od-lista__texto">
                    <strong>{{ dataBr(v.dataVisita) }} · {{ v.responsavel }}</strong>
                    <span>{{ v.tituloModelo }}@if (v.observacoes) { · {{ v.observacoes }} }</span>
                    <span class="od-visita__selos">
                      @if (v.naoConformidades) {
                        <geo-status tone="warning" icon="pi-exclamation-triangle">{{ v.naoConformidades === 1 ? '1 não conformidade' : v.naoConformidades + ' não conformidades' }}</geo-status>
                      } @else {
                        <geo-status tone="success" emphasis="outline" icon="pi-check">Sem não conformidades</geo-status>
                      }
                      @if (v.evidencias.length) {
                        <geo-status tone="neutral" emphasis="outline" icon="pi-paperclip">{{ v.evidencias.length === 1 ? '1 evidência' : v.evidencias.length + ' evidências' }}</geo-status>
                      }
                    </span>
                  </div>
                  <span class="od-lista__acoes">
                    <geo-icon-button icon="pi pi-file-pdf" [label]="'Baixar PDF da visita de ' + dataBr(v.dataVisita)" size="icon-sm" (pressed)="baixarVisita(v)"></geo-icon-button>
                    @if (podeEscrever) {
                      <geo-icon-button icon="pi pi-pencil" [label]="'Corrigir a visita de ' + dataBr(v.dataVisita)" size="icon-sm" (pressed)="editarVisita(v)"></geo-icon-button>
                      <geo-icon-button icon="pi pi-trash" [label]="'Remover a visita de ' + dataBr(v.dataVisita)" size="icon-sm" (pressed)="removerVisita(v)"></geo-icon-button>
                    }
                  </span>
                </li>
              }
            </ul>
          }
        </section>

        <!-- Book e As Built -->
        <section class="od-bloco" aria-labelledby="od-asbuilt">
          <header class="od-bloco__topo">
            <h3 id="od-asbuilt">Book e As Built</h3>
            @if (d.asBuilt.pontosExecutados) {
              <span class="od-contagem">{{ d.asBuilt.fichasCompletas }} de {{ d.asBuilt.pontosExecutados }} {{ d.asBuilt.pontosExecutados === 1 ? 'ficha completa' : 'fichas completas' }}</span>
            }
            @if (podeEscrever && d.asBuilt.pontosExecutados) {
              <geo-button class="od-bloco__acao" variant="outline" size="sm" icon="pi pi-file-export" [label]="'Gerar versão ' + proximaVersao()" [loading]="gerando() || processando()" (pressed)="gerar()"></geo-button>
            }
          </header>
          @if (!d.temProjetoMestre && d.asBuilt.pontosExecutados) {
            <geo-callout tone="warning" [dense]="true">Anexe o projeto mestre da obra para gerar o As Built.</geo-callout>
          }
          @if (pontosPendentesDaGeracao().length) {
            <geo-callout tone="danger" icon="pi pi-exclamation-circle" title="Fichas pendentes" [dense]="true">Complete as fichas dos pontos {{ pontosPendentesDaGeracao().join(', ') }} para gerar o documento.</geo-callout>
          }
          @if (d.pontos.length > pontosParaFiltrar) {
            <geo-select class="od-filtro" label="Mostrar" [options]="filtrosPontos" [value]="filtroPontos()" (valueChange)="filtroPontos.set($event ?? 'TODOS')"></geo-select>
          }
          @if (pontosDoBook().length) {
            <ul class="od-book">
              @for (p of pontosExibidos(); track p.id) {
                <li class="od-ponto">
                  <div class="od-ponto__topo">
                    <div class="od-lista__texto">
                      <strong>Ponto {{ p.numero }}</strong>
                      <span>Folha {{ p.pagina }}{{ p.executado ? ' · Executado' : ' · Sem execução' }}</span>
                    </div>
                    <geo-button variant="ghost" size="sm" label="Abrir" [ariaLabel]="'Abrir o ponto ' + p.numero" (pressed)="abrirFicha(p)"></geo-button>
                  </div>
                  @if (p.evidencias.length) {
                    <div class="od-ponto__fotos">
                      @for (e of p.evidencias.slice(0, miniaturasNoCartao); track e.id; let i = $index) {
                        <app-evidencia-miniatura [idObra]="idObra()" [evidencia]="e" (abrir)="verFoto(p, i)"></app-evidencia-miniatura>
                      }
                    </div>
                    @if (p.evidencias.length > miniaturasNoCartao) {
                      <button type="button" class="od-ponto__mais" (click)="verFoto(p, miniaturasNoCartao)">Ver mais {{ p.evidencias.length - miniaturasNoCartao }} {{ p.evidencias.length - miniaturasNoCartao === 1 ? 'foto' : 'fotos' }}</button>
                    }
                  }
                  <div class="od-ponto__estados">
                    @if (!p.evidencias.length) {
                      <geo-status tone="neutral" emphasis="outline" icon="pi-camera">Sem fotos</geo-status>
                    } @else if (faltando(p).length) {
                      <geo-status tone="warning" icon="pi-camera">{{ faltando(p).length === 1 ? 'Falta 1 foto' : 'Faltam ' + faltando(p).length + ' fotos' }}</geo-status>
                    } @else {
                      <geo-status tone="success" icon="pi-camera">{{ p.evidencias.length === 1 ? '1 foto' : p.evidencias.length + ' fotos' }}</geo-status>
                    }
                    @if (p.ficha?.completa) {
                      <geo-status tone="success" icon="pi-check-circle">Ficha completa</geo-status>
                    } @else if (p.ficha) {
                      <geo-status tone="warning" icon="pi-pencil">Ficha: faltam {{ p.ficha.pendencias.length }}</geo-status>
                    } @else if (p.executado) {
                      <geo-status tone="neutral" emphasis="outline" icon="pi-minus-circle">Sem ficha</geo-status>
                    }
                  </div>
                </li>
              }
            </ul>
            @if (pontosOcultos() > 0) {
              <button type="button" class="od-ponto__mais od-book__todos" (click)="todosPontos.set(true)">Mostrar todos os {{ pontosDoBook().length }} pontos</button>
            } @else if (todosPontos() && pontosDoBook().length > pontosVisiveis) {
              <button type="button" class="od-ponto__mais od-book__todos" (click)="todosPontos.set(false)">Mostrar menos</button>
            }
          } @else if (d.pontos.length) {
            <p class="od-vazio">Nenhum ponto com esse filtro.</p>
          } @else {
            <p class="od-vazio">Marque os pontos no planejamento da obra para lançar as evidências.</p>
          }
          @if (d.documentos.length) {
            <h4 class="od-subtitulo">Versões geradas</h4>
            <ul class="od-lista">
              @for (doc of d.documentos; track doc.id) {
                <li>
                  <div class="od-lista__texto">
                    <strong>Versão {{ doc.numeroVersao }}</strong>
                    <span>{{ doc.data | date: 'dd/MM/yyyy HH:mm' }}@if (doc.usuario) { · {{ doc.usuario }} }</span>
                    @if (doc.mensagemErro) { <span class="od-erro">{{ doc.mensagemErro }}</span> }
                  </div>
                  @switch (doc.status) {
                    @case ('PROCESSANDO') { <geo-status tone="info" icon="pi-spinner">Gerando</geo-status> }
                    @case ('ERRO') { <geo-status tone="danger" icon="pi-times-circle">Falhou</geo-status> }
                    @default {
                      <geo-icon-button icon="pi pi-download" [label]="'Baixar a versão ' + doc.numeroVersao" size="icon-sm" (pressed)="baixarDocumento(doc)"></geo-icon-button>
                    }
                  }
                </li>
              }
            </ul>
          }
        </section>

        <!-- Equipamentos -->
        <section class="od-bloco" aria-labelledby="od-book">
          <header class="od-bloco__topo">
            <h3 id="od-book">Equipamentos</h3>
            @if (podeEscrever && d.pontos.length) {
              <geo-button class="od-bloco__acao" variant="ghost" size="sm" icon="pi pi-plus" label="Marcar equipamento" (pressed)="novoEquipamento()"></geo-button>
            }
          </header>
          @if (d.equipamentos.length) {
            <ul class="od-lista">
              @for (e of d.equipamentos; track e.id) {
                <li>
                  <div class="od-lista__texto">
                    <strong>Ponto {{ e.numeroPonto }} · {{ descreverEquipamento(e) }}</strong>
                    <span>Folha {{ e.pagina }}@if (e.observacao) { · {{ e.observacao }} }</span>
                  </div>
                  @if (podeEscrever) {
                    <span class="od-lista__acoes">
                      <geo-icon-button icon="pi pi-pencil" [label]="'Corrigir o equipamento do ponto ' + e.numeroPonto" size="icon-sm" (pressed)="editarEquipamento(e)"></geo-icon-button>
                      <geo-icon-button icon="pi pi-trash" [label]="'Retirar o ponto ' + e.numeroPonto + ' da lista'" size="icon-sm" (pressed)="removerEquipamento(e)"></geo-icon-button>
                    </span>
                  }
                </li>
              }
            </ul>
          } @else {
            <p class="od-vazio">{{ d.pontos.length ? 'Nenhum ponto com religador ou regulador.' : 'Marque os pontos no planejamento para indicar os equipamentos.' }}</p>
          }
        </section>
      </div>
    }

    <!-- Checklist: visita ou ficha -->
    <geo-form-drawer [(visible)]="checklistAberto" [title]="tituloChecklist()" [dirty]="alterado()" size="lg">
      @if (!modelosAtivos().length && !modelo()) {
        <geo-callout tone="warning" icon="pi pi-exclamation-triangle" title="Nenhum modelo ativo" [dense]="true">
          Cadastre um modelo em
          @if (podeVerModelos) { <a routerLink="/obras/cadastros/checklists">Checklists da documentação</a> } @else { Checklists da documentação }
          para poder lançar{{ pontoDaFicha() ? ' a ficha e as fotos pedidas' : '' }}.
        </geo-callout>
      } @else {
        <geo-form-section title="Modelo do ponto" icon="pi pi-file-edit">
          <div class="geo-form-grid">
            <geo-select label="Modelo" [required]="true" [options]="opcoesModelo()" [value]="modelo()?.id ?? null" [disabled]="modeloFixo()" (valueChange)="escolherModelo($event)"></geo-select>
          </div>
        </geo-form-section>
      }
      @if (pontoAtual(); as p) {
        <section class="od-evidencias" aria-labelledby="od-evidencias-titulo">
          <h3 id="od-evidencias-titulo">Evidências</h3>
          @for (item of itensDoPonto(); track item.id) {
            <div class="od-item">
              <div class="od-item__topo">
                <strong>{{ item.titulo }}</strong>
                @if (item.obrigatoria) {
                  <geo-status [tone]="fotosDoItem(p, item.id).length ? 'success' : 'warning'" emphasis="outline">{{ fotosDoItem(p, item.id).length ? 'Fotografado' : 'Obrigatória' }}</geo-status>
                }
              </div>
              <ng-container [ngTemplateOutlet]="galeria" [ngTemplateOutletContext]="{ ponto: p, fotos: fotosDoItem(p, item.id), idItem: item.id }"></ng-container>
            </div>
          }
          <div class="od-item">
            <div class="od-item__topo"><strong>{{ itensDoPonto().length ? 'Outras evidências' : 'Fotos do ponto' }}</strong></div>
            <ng-container [ngTemplateOutlet]="galeria" [ngTemplateOutletContext]="{ ponto: p, fotos: fotosDoItem(p, null), idItem: null }"></ng-container>
          </div>
        </section>
        <h3 class="od-ficha-titulo">Ficha As Built</h3>
        @if (!p.executado) {
          <p class="od-vazio">A ficha é preenchida depois que o ponto tiver execução. As fotos podem ser lançadas desde já.</p>
        } @else if (!podeEscrever) {
          @if (p.ficha; as ficha) {
            <dl class="od-ficha">
              @for (r of ficha.respostas.itens; track r.idPergunta) {
                <div><dt>{{ r.enunciado }}</dt><dd>{{ r.naoSeAplica ? 'Não se aplica' : (r.selecionadas.length ? r.selecionadas.join(', ') : (r.valor || 'Não respondido')) }}</dd></div>
              }
            </dl>
          } @else {
            <p class="od-vazio">Ficha ainda não preenchida.</p>
          }
        }
      }
      @if (modelo(); as m) {
        @if (podeEscrever && pontoAtual()?.executado) {
          <app-checklist-respostas class="od-respostas" [estrutura]="m.estrutura" [(respostas)]="respostas" [mostrarPendencias]="tentou()"></app-checklist-respostas>
        }
      }
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" [label]="podeSalvarChecklist() ? 'Cancelar' : 'Fechar'" (pressed)="checklistAberto.set(false)"></geo-button>
        @if (podeSalvarChecklist()) {
          <geo-button icon="pi pi-check" label="Salvar ficha" [loading]="salvando()" (pressed)="salvarChecklist()"></geo-button>
        }
      </div>
    </geo-form-drawer>

    <ng-template #galeria let-ponto="ponto" let-fotos="fotos" let-idItem="idItem">
      @if (fotos.length) {
        <div class="od-galeria">
          @for (e of fotos; track e.id) {
            <app-evidencia-miniatura [idObra]="idObra()" [evidencia]="e" (abrir)="verFoto(ponto, indiceDaFoto(ponto, e))"></app-evidencia-miniatura>
          }
        </div>
      } @else if (!podeEscrever) {
        <p class="od-vazio">Nenhuma foto lançada.</p>
      }
      @if (podeEscrever) {
        @for (rodada of [envios()]; track rodada) {
          <geo-file-input label="Adicionar foto" buttonLabel="Escolher foto" emptyLabel="JPG ou PNG, até 15 MB" accept="image/jpeg,image/png" [maxBytes]="limiteFoto"
            [disabled]="!!enviandoItem()" (fileChange)="enviarFoto(ponto, idItem, $event)"></geo-file-input>
        }
        @if (enviandoItem() === chaveDoItem(idItem)) {
          <span class="od-vazio" role="status"><i class="pi pi-spin pi-spinner" aria-hidden="true"></i> Enviando a foto</span>
        }
      }
    </ng-template>

    <app-visita-previa-drawer [idObra]="idObra()" [visita]="visitaEmEdicao()" [podeEscrever]="podeEscrever" [podeVerModelos]="podeVerModelos"
      [(aberto)]="visitaAberta" (alterada)="carregar()"></app-visita-previa-drawer>

    <app-evidencia-visualizador [idObra]="idObra()" [aberto]="!!fotoAberta()" [tituloPonto]="'Ponto ' + (pontoDaFoto()?.numero ?? '')" [evidencias]="pontoDaFoto()?.evidencias ?? []"
      [indice]="fotoAberta()?.indice ?? 0" [podeEscrever]="podeEscrever" [podeRevisar]="podeEscrever" (navegar)="irParaFoto($event)" (fechar)="fotoAberta.set(null)" (alterado)="carregar()"></app-evidencia-visualizador>

    <!-- Equipamento -->
    <geo-form-drawer [(visible)]="equipamentoAberto" title="Equipamento do ponto" size="sm">
      <div class="geo-form-stack">
        <geo-select label="Ponto" [required]="true" [options]="opcoesPonto()" [filter]="true" [disabled]="equipamentoEmEdicao()" [(value)]="idPontoEquipamento" [error]="tentouEquipamento() && !idPontoEquipamento() ? 'Escolha o ponto.' : undefined"></geo-select>
        <geo-select label="Equipamento" [required]="true" [options]="tiposEquipamento" [value]="tipoEquipamento()" (valueChange)="trocarTipoEquipamento($event)"></geo-select>
        @if (tipoEquipamento() === 'RELIGADOR') {
          <geo-boolean-control label="Tem trafo auxiliar" kind="toggle" [(value)]="trafoAuxiliar"></geo-boolean-control>
        }
        <geo-text-input label="Observação" [maxlength]="500" [(value)]="observacaoEquipamento"></geo-text-input>
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button variant="ghost" label="Cancelar" (pressed)="equipamentoAberto.set(false)"></geo-button>
        <geo-button icon="pi pi-check" label="Salvar" [loading]="salvando()" (pressed)="salvarEquipamento()"></geo-button>
      </div>
    </geo-form-drawer>
  `,
  styles: `
    .od { display: flex; flex-direction: column; gap: 1.25rem; }
    .od-bloco { display: flex; flex-direction: column; gap: 0.625rem; min-width: 0; }
    .od-bloco + .od-bloco { padding-top: 1.25rem; border-top: 1px solid var(--geo-border); }
    .od-bloco__topo { display: flex; flex-wrap: wrap; align-items: center; gap: 0.625rem; }
    .od-bloco__topo h3 { margin: 0; color: var(--geo-foreground); font-size: 0.875rem; font-weight: 600; }
    .od-bloco__acao { margin-left: auto; }
    .od-contagem { color: var(--geo-foreground-muted); font-size: 0.8125rem; }
    .od-subtitulo { margin: 0.375rem 0 0; color: var(--geo-foreground-muted); font-size: 0.8125rem; font-weight: 600; }
    .od-lista { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
    .od-lista li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem; padding: 0.5rem 0; }
    .od-lista li + li { border-top: 1px solid var(--geo-border); }
    .od-lista__texto { display: flex; flex: 1 1 14rem; flex-direction: column; gap: 0.125rem; min-width: 0; overflow-wrap: anywhere; }
    .od-lista__texto strong { color: var(--geo-foreground); font-size: 0.875rem; font-weight: 600; }
    .od-lista__texto span { color: var(--geo-foreground-muted); font-size: 0.8125rem; }
    .od-lista__texto .od-erro { color: var(--geo-danger); }
    .od-lista__acoes { display: inline-flex; gap: 0.125rem; }
    .od-vazio { margin: 0; color: var(--geo-foreground-muted); font-size: 0.8125rem; }
    .od-respostas { display: block; margin-top: 1rem; }
    .od-filtro { display: block; width: 100%; max-width: 16rem; }
    .od-book { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); gap: 0.75rem; margin: 0; padding: 0; list-style: none; }
    .od-ponto { display: flex; flex-direction: column; gap: 0.625rem; min-width: 0; padding: 0.75rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-lg); background: var(--geo-surface); }
    .od-ponto__topo { display: flex; align-items: flex-start; gap: 0.5rem; }
    .od-ponto__fotos { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.375rem; }
    .od-ponto__mais { align-self: flex-start; padding: 0; border: 0; background: transparent; color: var(--geo-brand); font-size: 0.8125rem; font-weight: 600; cursor: pointer; }
    .od-ponto__mais:focus-visible { outline: 3px solid var(--geo-focus-ring); outline-offset: 2px; }
    .od-book__todos { margin-top: 0.125rem; }
    .od-ponto__estados { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: auto; }
    .od-evidencias { display: flex; flex-direction: column; gap: 0.875rem; margin-top: 1rem; }
    .od-evidencias h3, .od-ficha-titulo { margin: 0; color: var(--geo-foreground); font-size: 0.875rem; font-weight: 600; }
    .od-ficha-titulo { margin-top: 1.25rem; margin-bottom: 0.25rem; }
    .od-item { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md); background: var(--geo-surface-subtle); }
    .od-item__topo { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; color: var(--geo-foreground); font-size: 0.875rem; }
    .od-galeria { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr)); gap: 0.5rem; }
    .od-ficha { display: flex; flex-direction: column; gap: 0.5rem; margin: 0.25rem 0 0; }
    .od-ficha dt { color: var(--geo-foreground-muted); font-size: 0.8125rem; }
    .od-ficha dd { margin: 0; color: var(--geo-foreground); font-size: 0.875rem; font-weight: 600; overflow-wrap: anywhere; }
    .od-visita__selos { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.25rem; }
  `
})
export class ObraDocumentacaoComponent {
  private readonly servico = inject(ObrasDocumentacaoService);
  private readonly obras = inject(ObrasService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly permissoes = inject(AuthService).currentUser()?.permissoes ?? [];

  readonly idObra = input.required<string>();
  /** Um novo As Built entrou nos anexos da obra. */
  readonly anexoGerado = output<void>();
  /** Se a obra já tem visita prévia, a cada consulta; a tela da obra usa no aviso de "não realizada". */
  readonly visitaRealizada = output<boolean>();

  protected readonly podeEscrever = this.permissoes.includes('obras:documentacao:write');
  protected readonly podeVerModelos = this.permissoes.includes('obras:documentacao:read');
  protected readonly tiposEquipamento = TIPOS_EQUIPAMENTO;
  protected readonly filtrosPontos = FILTROS_PONTOS;
  protected readonly limiteFoto = LIMITE_FOTO_BYTES;
  protected readonly miniaturasNoCartao = MINIATURAS_NO_CARTAO;
  protected readonly pontosParaFiltrar = PONTOS_PARA_FILTRAR;
  protected readonly faltando = itensFaltando;

  protected readonly dados = signal<DocumentacaoObra | null>(null);
  protected readonly erro = signal<string | null>(null);
  protected readonly gerando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly pontosPendentesDaGeracao = signal<string[]>([]);

  // Book
  protected readonly filtroPontos = signal<FiltroPontos>('TODOS');
  protected readonly pontosDoBook = computed(() => {
    const pontos = this.dados()?.pontos ?? [];
    const filtro = this.filtroPontos();
    const ordenados = [...pontos].sort((a, b) => ORDEM_NATURAL.compare(String(a.pagina), String(b.pagina)) || ORDEM_NATURAL.compare(String(a.numero), String(b.numero)));
    if (filtro === 'EXECUTADOS') return ordenados.filter((p) => p.executado);
    if (filtro === 'FALTANDO') return ordenados.filter((p) => !p.evidencias.length || itensFaltando(p).length);
    return ordenados;
  });
  protected readonly pontosVisiveis = PONTOS_VISIVEIS;
  protected readonly todosPontos = signal(false);
  protected readonly pontosExibidos = computed(() => (this.todosPontos() ? this.pontosDoBook() : this.pontosDoBook().slice(0, PONTOS_VISIVEIS)));
  protected readonly pontosOcultos = computed(() => (this.todosPontos() ? 0 : this.pontosDoBook().length - PONTOS_VISIVEIS));
  protected readonly enviandoItem = signal<string | null>(null);
  /** Refaz o campo de arquivo depois de cada envio, para ele voltar vazio e aceitar o mesmo arquivo de novo. */
  protected readonly envios = signal(0);
  protected readonly fotoAberta = signal<{ idPonto: string; indice: number } | null>(null);
  protected readonly pontoDaFoto = computed(() => {
    const aberta = this.fotoAberta();
    return aberta ? (this.dados()?.pontos.find((p) => p.id === aberta.idPonto) ?? null) : null;
  });
  protected readonly processando = computed(() => this.dados()?.documentos.some((d) => d.status === 'PROCESSANDO') ?? false);
  protected readonly proximaVersao = computed(() => {
    const concluidas = this.dados()?.documentos.filter((d) => d.status !== 'ERRO').map((d) => d.numeroVersao) ?? [];
    return Math.max(0, ...concluidas) + 1;
  });

  // Checklist
  protected readonly checklistAberto = signal(false);
  protected readonly modelosAtivos = signal<ModeloChecklistResponse[]>([]);
  protected readonly modelo = signal<ModeloChecklistResponse | null>(null);
  protected readonly modeloFixo = signal(false);
  protected readonly respostas = signal<RespostasEmEdicao>({});
  protected readonly visitaEmEdicao = signal<VisitaPrevia | null>(null);
  protected readonly visitaAberta = signal(false);
  protected readonly pontoDaFicha = signal<PontoDocumentacao | null>(null);
  protected readonly tentou = signal(false);
  private readonly original = signal('');
  protected readonly alterado = computed(() => this.instantaneo() !== this.original());
  /** O ponto aberto, sempre com as fotos da última consulta. */
  protected readonly pontoAtual = computed(() => {
    const aberto = this.pontoDaFicha();
    return aberto ? (this.dados()?.pontos.find((p) => p.id === aberto.id) ?? aberto) : null;
  });
  protected readonly itensDoPonto = computed(() => this.modelo()?.estrutura.evidencias ?? this.pontoAtual()?.itensEvidencia ?? []);
  protected readonly podeSalvarChecklist = computed(() => !!this.modelo() && this.podeEscrever && !!this.pontoAtual()?.executado);
  protected readonly opcoesModelo = computed<GeoSelectOption<string>[]>(() => {
    const atual = this.modelo();
    const ativos = this.modelosAtivos().map((m) => ({ label: m.titulo, value: m.id }));
    return atual && !ativos.some((o) => o.value === atual.id) ? [{ label: atual.titulo, value: atual.id }, ...ativos] : ativos;
  });
  protected readonly tituloChecklist = computed(() => {
    const ponto = this.pontoDaFicha();
    return ponto ? `Ponto ${ponto.numero} · Folha ${ponto.pagina}` : '';
  });

  // Equipamento
  protected readonly equipamentoAberto = signal(false);
  protected readonly equipamentoEmEdicao = signal(false);
  protected readonly idPontoEquipamento = signal<string | null>(null);
  protected readonly tipoEquipamento = signal<TipoEquipamento>('RELIGADOR');
  protected readonly trafoAuxiliar = signal(false);
  protected readonly observacaoEquipamento = signal('');
  protected readonly tentouEquipamento = signal(false);
  protected readonly opcoesPonto = computed<GeoSelectOption<string>[]>(() => {
    const marcados = new Set(this.dados()?.equipamentos.map((e) => e.idPonto));
    return (this.dados()?.pontos ?? [])
      .filter((p) => this.equipamentoEmEdicao() || !marcados.has(p.id))
      .map((p) => ({ label: `${p.numero} · folha ${p.pagina}`, value: p.id }));
  });

  constructor() {
    effect(() => {
      this.idObra();
      untracked(() => this.carregar());
    });
    // Enquanto uma versão é gerada, confere de tempos em tempos e avisa quando o anexo entrar.
    timer(INTERVALO_GERACAO_MS, INTERVALO_GERACAO_MS)
      .pipe(filter(() => this.processando()), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.carregar(true));
  }

  protected carregar(acompanhandoGeracao = false): void {
    this.erro.set(null);
    this.servico.consultar(this.idObra()).pipe(take(1)).subscribe({
      next: (dados) => {
        const terminou = acompanhandoGeracao && !dados.documentos.some((d) => d.status === 'PROCESSANDO');
        this.dados.set(dados);
        this.visitaRealizada.emit(dados.visitaRealizada);
        if (terminou) {
          const ultimo = dados.documentos[0];
          if (ultimo?.status === 'CONCLUIDO') {
            this.notificacoes.success(`Versão ${ultimo.numeroVersao} do As Built gerada e guardada nos anexos.`);
            this.anexoGerado.emit();
          } else if (ultimo?.status === 'ERRO') {
            this.notificacoes.error(ultimo.mensagemErro ?? 'Não foi possível gerar o As Built.');
          }
        }
      },
      error: (e) => this.erro.set(getErrorMessage(e))
    });
  }

  protected dataBr(data: string): string {
    return data.split('-').reverse().join('/');
  }

  protected descreverEquipamento(e: EquipamentoObra): string {
    if (e.tipo === 'REGULADOR') return 'Regulador';
    return e.trafoAuxiliar ? 'Religador com trafo auxiliar' : 'Religador sem trafo auxiliar';
  }

  // ---- Visita e ficha ----

  protected novaVisita(): void {
    this.visitaEmEdicao.set(null);
    this.visitaAberta.set(true);
  }

  protected editarVisita(visita: VisitaPrevia): void {
    this.visitaEmEdicao.set(visita);
    this.visitaAberta.set(true);
  }

  protected abrirFicha(ponto: PontoDocumentacao): void {
    this.prepararChecklist(ponto);
    this.carregarModelos('AS_BUILT', ponto.idModelo, ponto.ficha?.respostas.itens ?? []);
  }

  protected fotosDoItem(ponto: PontoDocumentacao, idItem: string | null): EvidenciaPonto[] {
    return ponto.evidencias.filter((e) => e.idItem === idItem);
  }

  protected indiceDaFoto(ponto: PontoDocumentacao, evidencia: EvidenciaPonto): number {
    return ponto.evidencias.findIndex((e) => e.id === evidencia.id);
  }

  protected chaveDoItem(idItem: string | null): string {
    return idItem ?? 'avulsa';
  }

  protected verFoto(ponto: PontoDocumentacao, indice: number): void {
    this.fotoAberta.set({ idPonto: ponto.id, indice });
  }

  protected irParaFoto(indice: number): void {
    this.fotoAberta.update((aberta) => (aberta ? { ...aberta, indice } : aberta));
  }

  /** A foto vai na hora, sem esperar a ficha: o lançamento de cada foto é independente. */
  protected enviarFoto(ponto: PontoDocumentacao, idItem: string | null, arquivo: File | null): void {
    if (!arquivo) return;
    const idModelo = this.modelo()?.id;
    const item = idItem && idModelo ? { idModelo, idItem } : null;
    this.enviandoItem.set(this.chaveDoItem(idItem));
    this.servico.enviarEvidencia(this.idObra(), ponto.id, arquivo, item).pipe(take(1)).subscribe({
      next: () => {
        this.enviandoItem.set(null);
        this.envios.update((n) => n + 1);
        if (item) this.modeloFixo.set(true);
        this.notificacoes.success('Foto lançada.');
        this.carregar();
      },
      error: (e) => {
        this.enviandoItem.set(null);
        this.envios.update((n) => n + 1);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private prepararChecklist(ponto: PontoDocumentacao): void {
    this.pontoDaFicha.set(ponto);
    this.modelo.set(null);
    this.modelosAtivos.set([]);
    this.respostas.set({});
    this.tentou.set(false);
  }

  /** Com um modelo só, ele já vem escolhido; registro existente continua no modelo em que foi respondido. */
  private carregarModelos(finalidade: FinalidadeChecklist, idDoRegistro: string | null, itens: Parameters<typeof respostasIniciais>[1]): void {
    this.modeloFixo.set(!!idDoRegistro);
    this.servico.listarModelos({ finalidade, ativo: true, size: 100, sort: 'titulo,asc' }).pipe(take(1)).subscribe({
      next: (pagina) => {
        this.modelosAtivos.set(pagina.content);
        if (idDoRegistro) {
          this.servico.buscarModelo(idDoRegistro).pipe(take(1)).subscribe({
            next: (modelo) => this.abrirComModelo(modelo, itens),
            error: (e) => this.notificacoes.error(getErrorMessage(e))
          });
        } else {
          this.abrirComModelo(pagina.content.length === 1 ? pagina.content[0] : null, []);
        }
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  private abrirComModelo(modelo: ModeloChecklistResponse | null, itens: Parameters<typeof respostasIniciais>[1]): void {
    this.modelo.set(modelo);
    this.respostas.set(modelo ? respostasIniciais(modelo.estrutura, itens) : {});
    this.original.set(this.instantaneo());
    this.checklistAberto.set(true);
  }

  protected escolherModelo(id: string | null): void {
    const modelo = this.modelosAtivos().find((m) => m.id === id) ?? null;
    this.modelo.set(modelo);
    this.respostas.set(modelo ? respostasIniciais(modelo.estrutura) : {});
  }

  protected salvarChecklist(): void {
    const modelo = this.modelo();
    if (!modelo) return;
    const ponto = this.pontoDaFicha();
    if (!ponto) return;
    const informadas = paraInformadas(modelo.estrutura, this.respostas());
    // A ficha pode ficar pela metade: o pendente só impede de gerar o documento.
    this.tentou.set(true);
    this.executar(this.servico.preencherFicha(this.idObra(), ponto.id, modelo.id, informadas), () => {
      this.checklistAberto.set(false);
      this.pontosPendentesDaGeracao.set([]);
      const faltam = pendentes(modelo.estrutura, this.respostas()).length;
      this.notificacoes.success(faltam ? `Ficha salva. Faltam ${faltam} ${faltam === 1 ? 'resposta' : 'respostas'} para completá-la.` : 'Ficha completa.');
    });
  }

  protected async removerVisita(visita: VisitaPrevia): Promise<void> {
    const ok = await this.confirmacao.confirm({
      title: `Remover a visita de ${this.dataBr(visita.dataVisita)}?`,
      message: 'Se for a única, a obra volta a "Não realizada".',
      confirmLabel: 'Remover'
    });
    if (ok) this.executar(this.servico.removerVisita(this.idObra(), visita.id), () => this.notificacoes.success('Visita removida.'));
  }

  protected baixarVisita(visita: VisitaPrevia): void {
    this.servico.baixarPdfDaVisita(this.idObra(), visita.id).pipe(take(1)).subscribe({
      next: (arquivo) => this.obras.baixarArquivoBlob(arquivo, `visita-previa-${visita.dataVisita}.pdf`),
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  // ---- As Built ----

  protected async gerar(): Promise<void> {
    const pendentesAgora = this.dados()?.asBuilt.pontosPendentes ?? [];
    this.pontosPendentesDaGeracao.set(pendentesAgora);
    if (pendentesAgora.length) return;
    const semFoto = this.dados()?.asBuilt.pontosSemEvidencia ?? [];
    if (semFoto.length) {
      const ok = await this.confirmacao.confirm({
        title: 'Gerar com fotos faltando?',
        message: `Faltam fotos ${semFoto.length === 1 ? 'no ponto' : 'nos pontos'} ${semFoto.join(', ')}. O documento sai com as fotos que já foram lançadas.`,
        confirmLabel: 'Gerar mesmo assim'
      });
      if (!ok) return;
    }
    this.gerando.set(true);
    this.servico.gerarAsBuilt(this.idObra()).pipe(take(1)).subscribe({
      next: () => {
        this.gerando.set(false);
        this.carregar();
      },
      error: (e) => {
        this.gerando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected baixarDocumento(documento: DocumentoAsBuilt): void {
    if (!documento.idAnexo) return;
    const nome = `as-built-v${documento.numeroVersao}.pdf`;
    this.obras.baixarAnexo(this.idObra(), documento.idAnexo, nome).pipe(take(1)).subscribe({
      next: (resposta) => {
        if (resposta.body) this.obras.baixarArquivoBlob(resposta.body, this.obras.extrairNomeArquivoDeResponse(resposta, nome));
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  // ---- Equipamentos ----

  protected novoEquipamento(): void {
    this.equipamentoEmEdicao.set(false);
    this.idPontoEquipamento.set(null);
    this.tipoEquipamento.set('RELIGADOR');
    this.trafoAuxiliar.set(false);
    this.observacaoEquipamento.set('');
    this.tentouEquipamento.set(false);
    this.equipamentoAberto.set(true);
  }

  protected editarEquipamento(e: EquipamentoObra): void {
    this.equipamentoEmEdicao.set(true);
    this.idPontoEquipamento.set(e.idPonto);
    this.tipoEquipamento.set(e.tipo);
    this.trafoAuxiliar.set(e.trafoAuxiliar);
    this.observacaoEquipamento.set(e.observacao ?? '');
    this.tentouEquipamento.set(false);
    this.equipamentoAberto.set(true);
  }

  protected trocarTipoEquipamento(tipo: TipoEquipamento | null): void {
    this.tipoEquipamento.set(tipo ?? 'RELIGADOR');
    if (tipo !== 'RELIGADOR') this.trafoAuxiliar.set(false);
  }

  protected salvarEquipamento(): void {
    this.tentouEquipamento.set(true);
    const idPonto = this.idPontoEquipamento();
    if (!idPonto) return;
    const request = { tipo: this.tipoEquipamento(), trafoAuxiliar: this.trafoAuxiliar(), observacao: this.observacaoEquipamento().trim() || null };
    this.executar(this.servico.definirEquipamento(this.idObra(), idPonto, request), () => this.equipamentoAberto.set(false));
  }

  protected async removerEquipamento(e: EquipamentoObra): Promise<void> {
    const ok = await this.confirmacao.confirm({ title: `Retirar o ponto ${e.numeroPonto} do book?`, message: 'O ponto continua no planejamento.', confirmLabel: 'Retirar' });
    if (ok) this.executar(this.servico.removerEquipamento(this.idObra(), e.idPonto));
  }

  private executar(acao: Observable<unknown>, depois?: () => void): void {
    this.salvando.set(true);
    acao.pipe(take(1)).subscribe({
      next: () => {
        this.salvando.set(false);
        depois?.();
        this.carregar();
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private instantaneo(): string {
    return JSON.stringify([this.modelo()?.id, this.respostas(), ]);
  }
}
