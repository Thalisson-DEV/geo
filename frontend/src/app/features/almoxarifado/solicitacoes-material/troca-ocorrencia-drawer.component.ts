import { ChangeDetectionStrategy, Component, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoFormDrawerComponent,
  GeoTextareaComponent,
  GeoTextInputComponent,
  NotificationService
} from '@geo/ui';

import { getErrorMessage } from '../../../core/models/shared.models';
import { SolicitacaoMaterialTecnicaService } from '../../../core/services/solicitacao-material-tecnica.service';
import { novaChaveIdempotencia } from '../../../core/utils/idempotencia.util';

const MINIMO_MOTIVO = 5;

/**
 * Troca o número da OS/OC de uma solicitação técnica, até depois da entrega: a equipe às vezes
 * recebe o material para uma ocorrência e, a caminho, ela muda. O saldo não muda; a troca fica
 * na linha do tempo com o motivo.
 */
@Component({
  selector: 'app-troca-ocorrencia-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GeoButtonComponent, GeoCalloutComponent, GeoFormDrawerComponent, GeoTextareaComponent, GeoTextInputComponent],
  template: `
    <geo-form-drawer [(visible)]="visible" [title]="'Trocar a ' + rotulo()" size="sm"
      [description]="'A solicitação passa a valer para a nova ' + rotulo() + '. O material entregue continua onde está.'">
      <div class="flex flex-col gap-4">
        @if (entregue()) {
          <geo-callout tone="info" title="Já houve entrega">
            O saldo e as entregas ficam como estão. Só o número muda, e a troca aparece na linha do tempo.
          </geo-callout>
        }
        <div class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-[var(--geo-foreground-muted)]">{{ rotulo() }} atual</span>
          <strong class="font-mono text-sm text-[var(--geo-foreground)]">{{ atual() || '—' }}</strong>
        </div>
        <geo-text-input [label]="'Nova ' + rotulo()" [required]="true" [value]="nova()" (valueChange)="nova.set($event)"
          [placeholder]="'Ex.: ' + rotulo() + ' 88412'" [maxlength]="100"
          [error]="tentou() && !nova().trim() ? 'Informe o novo número.' : erroNova()" />
        <geo-textarea label="Motivo" [required]="true" [value]="motivo()" (valueChange)="motivo.set($event)" [rows]="3" [maxlength]="500"
          placeholder="Ex.: a equipe foi remanejada para outra ocorrência no caminho"
          [error]="tentou() && motivo().trim().length < minimo ? 'Conte em poucas palavras por que mudou.' : undefined" />
      </div>
      <div drawer-footer class="geo-actions-row">
        <geo-button label="Cancelar" variant="ghost" (pressed)="visible.set(false)" />
        <geo-button [label]="'Trocar ' + rotulo()" icon="pi pi-check" [loading]="salvando()" (pressed)="confirmar()" />
      </div>
    </geo-form-drawer>
  `
})
export class TrocaOcorrenciaDrawerComponent {
  private readonly service = inject(SolicitacaoMaterialTecnicaService);
  private readonly notificacoes = inject(NotificationService);

  readonly visible = model(false);
  readonly idSolicitacao = input<string | null>(null);
  readonly versao = input<number | null>(null);
  /** Como a OS/OC aparece hoje ("OC 88412"). */
  readonly atual = input<string | null>(null);
  readonly rotulo = input('OC');
  readonly entregue = input(false);
  readonly trocada = output<void>();
  /** A versão mudou no servidor: quem abriu recarrega. */
  readonly conflito = output<void>();

  protected readonly minimo = MINIMO_MOTIVO;
  protected readonly nova = signal('');
  protected readonly motivo = signal('');
  protected readonly tentou = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erroNova = signal<string | undefined>(undefined);
  private chave: string | null = null;

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      untracked(() => {
        this.nova.set('');
        this.motivo.set('');
        this.tentou.set(false);
        this.erroNova.set(undefined);
        this.chave = null;
      });
    });
  }

  protected confirmar(): void {
    const id = this.idSolicitacao();
    const versao = this.versao();
    if (!id || versao === null || this.salvando()) return;
    this.tentou.set(true);
    this.erroNova.set(undefined);
    if (!this.nova().trim() || this.motivo().trim().length < MINIMO_MOTIVO) return;
    this.chave ??= novaChaveIdempotencia();
    this.salvando.set(true);
    this.service.trocarOcorrencia(id, { versaoEsperada: versao, ocorrencia: this.nova().trim(), justificativa: this.motivo().trim() }, this.chave)
      .subscribe({
        next: (r) => {
          this.salvando.set(false);
          this.visible.set(false);
          this.notificacoes.success(`Agora a solicitação é da ${this.formatar(r.ocorrencia)}.`, { title: `${this.rotulo()} trocada` });
          this.trocada.emit();
        },
        error: (e) => {
          this.salvando.set(false);
          this.chave = null;
          if (e?.status === 409) {
            this.notificacoes.warning('Alguém alterou esta solicitação. Os dados foram atualizados; confira e tente de novo.', { title: 'Nada foi gravado' });
            this.conflito.emit();
            return;
          }
          const campo = e?.error?.erros?.ocorrencia ?? e?.error?.errors?.ocorrencia;
          if (campo) {
            this.erroNova.set(String(campo));
            return;
          }
          this.notificacoes.error(getErrorMessage(e), { title: `Não foi possível trocar a ${this.rotulo()}` });
        }
      });
  }

  private formatar(codigo: string): string {
    return /^(OS|OC)\b/i.test(codigo) ? codigo : `${this.rotulo()} ${codigo}`;
  }
}
