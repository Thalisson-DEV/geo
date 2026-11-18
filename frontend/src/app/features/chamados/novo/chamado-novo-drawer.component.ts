import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  model,
  output,
  signal,
  untracked
} from '@angular/core';
import { Router } from '@angular/router';
import {
  CesAsyncStateComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesFormActionsComponent,
  CesFormDrawerComponent,
  CesFormSectionComponent,
  CesIconButtonComponent,
  CesSelectComponent,
  CesSelectOption,
  CesStatusComponent,
  CesTextInputComponent,
  CesTextareaComponent,
  CesTone,
  NotificationService,
  cesFocusFirstInvalid
} from '@ces/ui';
import { firstValueFrom } from 'rxjs';
import {
  Chamado,
  ChamadoPrioridade,
  CriarChamadoRequest,
  TopicoChamado
} from '../../../core/models/chamado.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { ChamadosService } from '../../../core/services/chamados.service';
import { CHAMADO_PRIORIDADE_LABELS, PRIORIDADE_OPTIONS, formatarBytes } from '../chamados-ui';

export type UploadStatus = 'pendente' | 'enviando' | 'concluido' | 'erro';
export interface ArquivoPendente {
  file: File;
  status: UploadStatus;
  erro?: string;
}

export const LIMITE_ASSUNTO = 150;
export const LIMITE_DESCRICAO = 5000;
export const MINIMO_DESCRICAO = 10;
export const LIMITE_ANEXOS = 10;
export const LIMITE_BYTES_ANEXO = 15 * 1024 * 1024;
export const EXTENSOES_ACEITAS = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'txt', 'log', 'doc', 'docx', 'xls', 'xlsx'];

/** Apresentação de cada situação de envio: tom, ícone e texto (a cor nunca é o único indicador). */
const ENVIO: Record<UploadStatus, { tom: CesTone; icone: string; rotulo: string }> = {
  pendente: { tom: 'neutral', icone: 'pi pi-clock', rotulo: 'Aguardando envio' },
  enviando: { tom: 'info', icone: 'pi pi-spin pi-spinner', rotulo: 'Enviando…' },
  concluido: { tom: 'success', icone: 'pi pi-check-circle', rotulo: 'Enviado' },
  erro: { tom: 'danger', icone: 'pi pi-exclamation-circle', rotulo: 'Falha no envio' }
};

type Campo = 'topico' | 'assunto' | 'descricao';

/**
 * Abertura de chamado em drawer, sobre a lista de Meus chamados.
 * O chamado é criado uma única vez; depois cada anexo é enviado separadamente e pode ser reenviado.
 */
@Component({
  selector: 'app-chamado-novo-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CesAsyncStateComponent,
    CesButtonComponent,
    CesCalloutComponent,
    CesFormActionsComponent,
    CesFormDrawerComponent,
    CesFormSectionComponent,
    CesIconButtonComponent,
    CesSelectComponent,
    CesStatusComponent,
    CesTextInputComponent,
    CesTextareaComponent
  ],
  templateUrl: './chamado-novo-drawer.component.html',
  styleUrl: './chamado-novo-drawer.component.css'
})
export class ChamadoNovoDrawerComponent {
  private readonly service = inject(ChamadosService);
  private readonly router = inject(Router);
  private readonly notificacoes = inject(NotificationService);
  private readonly injector = inject(Injector);

  readonly visible = model(false);
  /** Emitido assim que o chamado é registrado no servidor, antes do envio dos anexos. */
  readonly chamadoAberto = output<Chamado>();
  protected readonly limiteAssunto = LIMITE_ASSUNTO;
  protected readonly limiteDescricao = LIMITE_DESCRICAO;
  protected readonly aceitos = EXTENSOES_ACEITAS.map((extensao) => `.${extensao}`).join(',');
  protected readonly limiteAnexos = LIMITE_ANEXOS;
  protected readonly formatarBytes = formatarBytes;
  protected readonly envio = ENVIO;

  // Carga dos tópicos
  protected readonly topicos = signal<TopicoChamado[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erroCarga = signal<string | null>(null);

  // Campos
  protected readonly topicoId = signal<string | null>(null);
  protected readonly assunto = signal('');
  protected readonly descricao = signal('');
  protected readonly prioridade = signal<ChamadoPrioridade | null>(null);
  protected readonly arquivos = signal<ArquivoPendente[]>([]);

  // Envio
  protected readonly tentouEnviar = signal(false);
  protected readonly salvando = signal(false);
  protected readonly criado = signal<Chamado | null>(null);

  protected readonly topicosOpcoes = computed<CesSelectOption<string>[]>(() =>
    this.topicos().map((topico) => ({ label: topico.nome, value: topico.id }))
  );
  protected readonly topicoSelecionado = computed(() =>
    this.topicos().find((topico) => topico.id === this.topicoId())
  );
  protected readonly prioridadePadrao = computed(() => {
    const prioridade = this.topicoSelecionado()?.prioridadePadrao;
    return prioridade ? CHAMADO_PRIORIDADE_LABELS[prioridade] : null;
  });
  protected readonly prioridadeOpcoes = computed<CesSelectOption<ChamadoPrioridade | null>[]>(() => [
    {
      label: this.prioridadePadrao() ? `Padrão do tópico (${this.prioridadePadrao()})` : 'Usar prioridade padrão do tópico',
      value: null
    },
    ...PRIORIDADE_OPTIONS
  ]);

  private readonly erros = computed<Partial<Record<Campo, string>>>(() => {
    const erros: Partial<Record<Campo, string>> = {};
    if (!this.topicoId()) erros.topico = 'Selecione um tópico.';
    if (!this.assunto().trim()) erros.assunto = 'Informe o assunto.';
    const descricao = this.descricao().trim().length;
    if (!descricao) erros.descricao = 'Descreva a necessidade.';
    else if (descricao < MINIMO_DESCRICAO) erros.descricao = `Use pelo menos ${MINIMO_DESCRICAO} caracteres.`;
    return erros;
  });

  protected readonly temFalhas = computed(() => this.arquivos().some((arquivo) => arquivo.status === 'erro'));
  private readonly enviandoAnexos = computed(() => this.arquivos().some((arquivo) => arquivo.status === 'enviando'));
  /** Algo preenchido e ainda não enviado: fechar pede confirmação. */
  protected readonly alterado = computed(
    () =>
      !this.criado() &&
      (!!this.topicoId() || !!this.assunto().trim() || !!this.descricao().trim() || !!this.prioridade() || this.arquivos().length > 0)
  );

  constructor() {
    // Cada abertura começa um chamado novo; se ainda há anexo subindo, mostra o andamento.
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        if (this.salvando() || this.enviandoAnexos()) return;
        this.limpar();
        if (!this.topicos().length && !this.carregando()) this.carregarTopicos();
      });
    });
  }

  protected carregarTopicos(): void {
    this.carregando.set(true);
    this.erroCarga.set(null);
    this.service.listarTopicosAtivos().subscribe({
      next: (topicos) => {
        this.topicos.set(topicos);
        this.carregando.set(false);
      },
      error: (error) => {
        this.erroCarga.set(getErrorMessage(error));
        this.carregando.set(false);
      }
    });
  }

  /** Erro do campo, exibido só depois da primeira tentativa de envio. */
  protected erro(campo: Campo): string | undefined {
    return this.tentouEnviar() ? this.erros()[campo] : undefined;
  }

  protected selecionarArquivos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const novos = Array.from(input.files ?? []);
    input.value = '';
    const atuais = this.arquivos();
    if (atuais.length + novos.length > LIMITE_ANEXOS) {
      this.notificacoes.warning(`Cada chamado aceita no máximo ${LIMITE_ANEXOS} arquivos.`, { title: 'Limite de anexos' });
      return;
    }
    const validos: ArquivoPendente[] = [];
    for (const file of novos) {
      const erro = validarArquivo(file);
      if (erro) {
        this.notificacoes.warning(`${file.name}: ${erro}`, { title: 'Arquivo não aceito' });
      } else if (![...atuais, ...validos].some((item) => mesmoArquivo(item.file, file))) {
        validos.push({ file, status: 'pendente' });
      }
    }
    this.arquivos.set([...atuais, ...validos]);
  }

  protected removerArquivo(index: number): void {
    this.arquivos.update((arquivos) => arquivos.filter((_, posicao) => posicao !== index));
  }

  protected fechar(): void {
    this.visible.set(false);
  }

  protected async salvar(): Promise<void> {
    if (this.salvando() || this.criado()) return;
    this.tentouEnviar.set(true);
    if (Object.keys(this.erros()).length) {
      this.notificacoes.warning('Revise os campos destacados antes de abrir o chamado.');
      afterNextRender(() => cesFocusFirstInvalid(document.querySelector('.ces-form-drawer') ?? document), {
        injector: this.injector
      });
      return;
    }
    const prioridade = this.prioridade();
    const request: CriarChamadoRequest = {
      topicoId: this.topicoId()!,
      assunto: this.assunto().trim(),
      descricao: this.descricao().trim(),
      ...(prioridade ? { prioridade } : {})
    };
    this.salvando.set(true);
    let chamado: Chamado;
    try {
      chamado = await firstValueFrom(this.service.criar(request));
    } catch (error) {
      this.notificacoes.error(getErrorMessage(error), { title: 'Não foi possível abrir o chamado' });
      this.salvando.set(false);
      return;
    }
    this.criado.set(chamado);
    this.salvando.set(false);
    this.chamadoAberto.emit(chamado);
    await this.enviarPendentes(chamado.id);
    if (!this.temFalhas()) {
      this.notificacoes.success(`Protocolo ${chamado.protocolo} criado com sucesso.`, { title: 'Chamado aberto' });
    }
  }

  protected async tentarNovamente(index: number): Promise<void> {
    const chamado = this.criado();
    const arquivo = this.arquivos()[index];
    if (!chamado || !arquivo || arquivo.status === 'enviando') return;
    await this.enviarArquivo(chamado.id, index);
  }

  protected irParaChamado(): void {
    const chamado = this.criado();
    // Substitui a entrada do drawer: voltar do detalhe leva à lista, não a um formulário vazio.
    if (chamado) void this.router.navigate(['/chamados/meus', chamado.id], { replaceUrl: true });
  }

  private limpar(): void {
    this.topicoId.set(null);
    this.assunto.set('');
    this.descricao.set('');
    this.prioridade.set(null);
    this.arquivos.set([]);
    this.tentouEnviar.set(false);
    this.criado.set(null);
  }

  private async enviarPendentes(chamadoId: string): Promise<void> {
    for (let index = 0; index < this.arquivos().length; index += 1) {
      if (this.arquivos()[index].status === 'pendente') await this.enviarArquivo(chamadoId, index);
    }
  }

  private async enviarArquivo(chamadoId: string, index: number): Promise<void> {
    this.atualizarArquivo(index, { status: 'enviando', erro: undefined });
    const arquivo = this.arquivos()[index];
    try {
      await firstValueFrom(this.service.anexar(chamadoId, arquivo.file));
      this.atualizarArquivo(index, { status: 'concluido', erro: undefined });
    } catch (error) {
      this.atualizarArquivo(index, { status: 'erro', erro: getErrorMessage(error) });
      this.notificacoes.error('O chamado foi mantido. Você pode tentar enviar somente este arquivo novamente.', {
        title: `Falha ao enviar ${arquivo.file.name}`
      });
    }
  }

  private atualizarArquivo(index: number, mudancas: Partial<ArquivoPendente>): void {
    this.arquivos.update((arquivos) =>
      arquivos.map((arquivo, posicao) => (posicao === index ? { ...arquivo, ...mudancas } : arquivo))
    );
  }
}

function mesmoArquivo(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size;
}

/** Motivo da recusa do arquivo, ou `null` quando ele pode ser anexado. */
export function validarArquivo(file: File): string | null {
  if (file.size > LIMITE_BYTES_ANEXO) return 'o tamanho máximo é 15 MB';
  const extensao = file.name.split('.').pop()?.toLowerCase();
  return extensao && EXTENSOES_ACEITAS.includes(extensao) ? null : 'formato não permitido';
}
