import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  GeoButtonComponent,
  GeoCalloutComponent,
  GeoConfirmationService,
  GeoDatepickerComponent,
  GeoFormDrawerComponent,
  GeoFormSectionComponent,
  GeoNumberInputComponent,
  GeoSelectComponent,
  GeoSelectOption,
  GeoTextInputComponent,
  GeoTextareaComponent,
  NotificationService
} from '@geo/ui';
import { Observable, of, switchMap } from 'rxjs';
import {
  AnexoFrota,
  Apolice,
  ROTULO_TIPO_SINISTRO,
  Sinistro,
  SinistroRequest,
  situacaoSinistro
} from '../../../core/models/frota-seguro.models';
import { Condutor, TipoSinistro, formatarPlaca, paraDataIso, paraInstanteIso, rotuloOs } from '../../../core/models/frota.models';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaSeguroService } from '../../../core/services/frota-seguro.service';
import { FrotaAnexosComponent, salvarArquivo } from './frota-anexos.component';
import { VeiculoSeguro } from './frota-apolice-drawer.component';

type Culpa = 'SIM' | 'NAO' | 'NAO_APURADA';
type Etapa = 'seguradora' | 'finalizar' | 'cancelar' | null;
const TIPOS: GeoSelectOption<TipoSinistro>[] = (Object.keys(ROTULO_TIPO_SINISTRO) as TipoSinistro[])
  .map((t) => ({ label: ROTULO_TIPO_SINISTRO[t], value: t }));
const CULPAS: GeoSelectOption<Culpa>[] = [
  { label: 'Não apurada', value: 'NAO_APURADA' },
  { label: 'Sim, do condutor', value: 'SIM' },
  { label: 'Não', value: 'NAO' }
];
const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Registro e acompanhamento do sinistro num só painel: o que aconteceu, com quem (preenchido pelo
 * vínculo do veículo no instante), fotos e boletim; depois, a OS de reparo, a seguradora acionada,
 * a finalização com a franquia e o cancelamento.
 */
@Component({
  selector: 'app-frota-sinistro-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    GeoButtonComponent,
    GeoCalloutComponent,
    GeoDatepickerComponent,
    GeoFormDrawerComponent,
    GeoFormSectionComponent,
    GeoNumberInputComponent,
    GeoSelectComponent,
    GeoTextInputComponent,
    GeoTextareaComponent,
    FrotaAnexosComponent
  ],
  styles: `
    .andamento { display: grid; gap: 0.5rem; }
    .andamento dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0.5rem 1rem; margin: 0; }
    .andamento dt { font-size: var(--geo-font-caption); color: var(--geo-foreground-muted); }
    .andamento dd { margin: 0; font-weight: 600; }
    .botoes { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .etapa { display: grid; gap: 0.75rem; padding: 0.75rem; border: 1px solid var(--geo-border); border-radius: var(--geo-radius-md);
      background: var(--geo-surface-subtle); }
    .etapa__botoes { display: flex; justify-content: flex-end; gap: 0.5rem; }
    .rodape { display: flex; align-items: center; gap: 0.5rem; width: 100%; flex-wrap: wrap; }
    .rodape__espaco { flex: 1; }
  `,
  template: `
    <geo-form-drawer [(visible)]="visivel" [title]="sinistro() ? 'Sinistro ' + sinistro()!.numero + ' · ' + placa(sinistro()!.placa) : 'Registrar sinistro'"
      [description]="sinistro() ? sinistro()!.tipoRotulo + ' em ' + (sinistro()!.ocorridoEm | date: 'dd/MM/yyyy HH:mm') : 'Acidente, furto, assalto ou carga avariada. Registre logo; as fotos, o boletim e a seguradora podem vir depois.'"
      [dirty]="alterado()" [loading]="salvando()" size="lg">

      @if (sinistro(); as s) {
        @let st = situacao(s.situacao);
        <geo-callout [tone]="st.tom === 'neutral' ? 'info' : st.tom" [icon]="st.icone" [dense]="true" [title]="st.rotulo">
          <div class="andamento">
            <dl>
              <div><dt>Reparo</dt><dd>
                @if (s.reparo; as r) {
                  <a [routerLink]="['/frota/ordens-servico', r.idOrdemServico]">{{ rotuloOs(r.numero) }}</a> · {{ r.situacaoRotulo }}{{ r.veiculoParado ? ' · veículo parado' : '' }}
                } @else { Sem OS de reparo }
              </dd></div>
              <div><dt>Seguradora</dt><dd>
                @if (s.seguradora; as g) {
                  Apólice {{ g.numeroApolice }}{{ g.seguradora ? ' · ' + g.seguradora : '' }}{{ g.numeroSinistro ? ' · sinistro ' + g.numeroSinistro : '' }}
                } @else { Não acionada }
              </dd></div>
              @if (s.situacao === 'FINALIZADO') {
                <div><dt>Finalizado em</dt><dd>{{ s.finalizadoEm | date: 'dd/MM/yyyy' }}{{ s.franquiaPaga ? ' · franquia ' + moeda(s.franquiaPaga) : '' }}</dd></div>
              }
              @if (s.situacao === 'CANCELADO') {
                <div><dt>Cancelado</dt><dd>{{ s.motivoCancelamento }}</dd></div>
              }
            </dl>
            @if (emAndamento() && podeEditar()) {
              <div class="botoes">
                @if (!s.reparo && podeAbrirOs()) {
                  <geo-button size="sm" icon="pi pi-wrench" label="Abrir OS de reparo" (pressed)="abrirOs.emit(s)"></geo-button>
                }
                <geo-button size="sm" variant="outline" icon="pi pi-shield" [label]="s.seguradora ? 'Corrigir seguradora' : 'Acionar seguradora'" (pressed)="abrirEtapa('seguradora')"></geo-button>
                <geo-button size="sm" variant="outline" icon="pi pi-check-circle" label="Finalizar" [disabled]="!s.podeFinalizar" (pressed)="abrirEtapa('finalizar')"></geo-button>
                <geo-button size="sm" variant="ghost" icon="pi pi-ban" label="Cancelar sinistro" [disabled]="!!s.reparo?.aberta" (pressed)="abrirEtapa('cancelar')"></geo-button>
              </div>
              @if (s.reparo?.aberta) {
                <span class="geo-cell-muted">Para finalizar ou cancelar, conclua ou cancele antes a {{ rotuloOs(s.reparo!.numero) }}.</span>
              }
            }
          </div>
        </geo-callout>

        @switch (etapa()) {
          @case ('seguradora') {
            <div class="etapa" role="group" aria-label="Acionar seguradora">
              <geo-select label="Apólice acionada" [required]="true" [options]="opcoesApolice()" [(value)]="idApolice" [loading]="carregandoApolices()"
                [description]="opcoesApolice().length || carregandoApolices() ? 'Apólices que cobriam o veículo no dia do sinistro.' : 'Nenhuma apólice cobria o veículo no dia do sinistro.'"></geo-select>
              <div class="geo-form-grid">
                <geo-text-input label="Número do sinistro na seguradora" [(value)]="numeroSeguradora" [maxlength]="60" [showOptional]="true"></geo-text-input>
                <geo-datepicker label="Acionada em" [(value)]="acionadaEm" [showTime]="true" [maxDate]="agora" description="Vazio: agora."></geo-datepicker>
              </div>
              <div class="etapa__botoes">
                <geo-button variant="ghost" label="Voltar" (pressed)="etapa.set(null)"></geo-button>
                <geo-button icon="pi pi-check" label="Acionar" [disabled]="!idApolice()" [loading]="gravandoEtapa()" (pressed)="acionar()"></geo-button>
              </div>
            </div>
          }
          @case ('finalizar') {
            <div class="etapa" role="group" aria-label="Finalizar sinistro">
              <geo-number-input label="Franquia paga" mode="currency" [(value)]="franquiaPaga" [min]="0" [showOptional]="true" [disabled]="!s.seguradora"
                [description]="s.seguradora?.franquiaApolice ? 'Franquia da apólice: ' + moeda(s.seguradora!.franquiaApolice) + '.' : s.seguradora ? undefined : 'Sem seguradora acionada, não há franquia.'"></geo-number-input>
              <div class="etapa__botoes">
                <geo-button variant="ghost" label="Voltar" (pressed)="etapa.set(null)"></geo-button>
                <geo-button icon="pi pi-check" label="Finalizar sinistro" [loading]="gravandoEtapa()" (pressed)="finalizar()"></geo-button>
              </div>
            </div>
          }
          @case ('cancelar') {
            <div class="etapa" role="group" aria-label="Cancelar sinistro">
              <geo-textarea label="Motivo do cancelamento" [required]="true" [(value)]="motivo" [rows]="2" [maxlength]="1000"
                placeholder="Ex.: registrado no veículo errado"></geo-textarea>
              <div class="etapa__botoes">
                <geo-button variant="ghost" label="Voltar" (pressed)="etapa.set(null)"></geo-button>
                <geo-button variant="destructive" icon="pi pi-ban" label="Cancelar sinistro" [disabled]="motivo().trim().length < 5" [loading]="gravandoEtapa()" (pressed)="cancelar()"></geo-button>
              </div>
            </div>
          }
        }
      }

      <geo-form-section title="O que aconteceu" icon="pi pi-exclamation-circle">
        <div class="geo-form-grid">
          @if (!idVeiculoFixo()) {
            <geo-select label="Veículo" [required]="true" [options]="opcoesVeiculo()" [(value)]="veiculo" [filter]="true" [disabled]="!!sinistro() || !editavel()"
              [description]="sinistro() ? 'O veículo não muda; se foi o errado, cancele e registre de novo.' : undefined" [error]="erro('veiculo')"></geo-select>
          }
          <geo-select label="Tipo" [required]="true" [options]="tipos" [(value)]="tipo" [disabled]="!editavel()" [error]="erro('tipo')"></geo-select>
          <geo-datepicker label="Data e hora" [required]="true" [(value)]="ocorridoEm" [showTime]="true" [maxDate]="agora"
            [disabled]="!editavel() || !!sinistro()?.seguradora" [error]="erro('ocorridoEm')"
            [description]="sinistro()?.seguradora ? 'A seguradora já foi acionada com esta data.' : undefined"></geo-datepicker>
          <geo-text-input label="Local" [(value)]="local" [maxlength]="300" [showOptional]="true" [disabled]="!editavel()"
            placeholder="Ex.: BR-324, km 10, Feira de Santana"></geo-text-input>
        </div>
        <geo-textarea label="Relato" [required]="true" [(value)]="descricao" [rows]="3" [maxlength]="4000" [disabled]="!editavel()"
          placeholder="Como aconteceu, danos no veículo e na carga" [error]="erro('descricao')"></geo-textarea>
      </geo-form-section>

      <geo-form-section title="Condutor e terceiros" icon="pi pi-users">
        <div class="geo-form-grid">
          <geo-select label="Condutor" [options]="opcoesCondutor()" [(value)]="condutor" [filter]="true" [clearable]="true" [showOptional]="true"
            [disabled]="!editavel()" [description]="sinistro() ? undefined : 'Em branco, fica quem estava vinculado ao veículo na hora do sinistro.'"></geo-select>
          <geo-select label="Culpa do condutor" [options]="culpas" [(value)]="culpa" [disabled]="!editavel()"
            description="Com culpa, pode levar a medida disciplinar no RH."></geo-select>
        </div>
        <div class="geo-form-grid">
          <geo-text-input label="Boletim de ocorrência" [(value)]="boletim" [maxlength]="60" [showOptional]="true" [disabled]="!editavel()"></geo-text-input>
        </div>
        <geo-textarea label="Terceiros envolvidos" [(value)]="terceiros" [rows]="2" [maxlength]="2000" [showOptional]="true" [disabled]="!editavel()"
          placeholder="Nome, placa, contato e seguradora do terceiro"></geo-textarea>
      </geo-form-section>

      <geo-form-section title="Fotos e documentos" icon="pi pi-images">
        <app-frota-anexos [anexos]="sinistro()?.anexos ?? []" [podeEditar]="podeEditar() && sinistro()?.situacao !== 'CANCELADO'" [(arquivo)]="arquivo"
          rotulo="Foto ou documento" descricao="Fotos do local e dos danos, boletim de ocorrência, orçamento. PDF ou imagem até 15 MB; anexe um por vez."
          (baixar)="baixar($event)" (remover)="removerAnexo($event)"></app-frota-anexos>
      </geo-form-section>

      <div drawer-footer class="rodape">
        <span class="rodape__espaco"></span>
        <geo-button variant="ghost" [label]="editavel() || !!arquivo() ? 'Cancelar' : 'Fechar'" (pressed)="visivel.set(false)"></geo-button>
        @if (editavel() || (podeEditar() && !!arquivo())) {
          <geo-button icon="pi pi-check" [label]="sinistro() ? 'Salvar' : 'Registrar sinistro'" [loading]="salvando()" (pressed)="salvar()"></geo-button>
        }
      </div>
    </geo-form-drawer>
  `
})
export class FrotaSinistroDrawerComponent {
  private readonly servico = inject(FrotaSeguroService);
  private readonly notificacoes = inject(NotificationService);
  private readonly confirmacao = inject(GeoConfirmationService);

  readonly visivel = model(false);
  readonly sinistro = input<Sinistro | null>(null);
  readonly veiculos = input<VeiculoSeguro[]>([]);
  readonly condutores = input<Condutor[]>([]);
  /** Na ficha do veículo o sinistro nasce para ele. */
  readonly idVeiculoFixo = input<string | null>(null);
  readonly podeEditar = input(false);
  readonly podeAbrirOs = input(false);
  readonly salvo = output<Sinistro>();
  readonly abrirOs = output<Sinistro>();

  protected readonly tipos = TIPOS;
  protected readonly culpas = CULPAS;
  protected readonly moeda = moeda;
  protected readonly placa = formatarPlaca;
  protected readonly rotuloOs = rotuloOs;
  protected readonly situacao = situacaoSinistro;
  protected readonly agora = (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; })();

  protected readonly veiculo = signal<string | null>(null);
  protected readonly tipo = signal<TipoSinistro | null>(null);
  protected readonly ocorridoEm = signal<Date | null>(null);
  protected readonly local = signal('');
  protected readonly descricao = signal('');
  protected readonly condutor = signal<string | null>(null);
  protected readonly culpa = signal<Culpa>('NAO_APURADA');
  protected readonly boletim = signal('');
  protected readonly terceiros = signal('');
  protected readonly arquivo = signal<File | null>(null);
  protected readonly salvando = signal(false);
  protected readonly tentou = signal(false);
  private readonly snapshot = signal('');

  protected readonly etapa = signal<Etapa>(null);
  protected readonly gravandoEtapa = signal(false);
  protected readonly apolices = signal<Apolice[]>([]);
  protected readonly carregandoApolices = signal(false);
  protected readonly idApolice = signal<string | null>(null);
  protected readonly numeroSeguradora = signal('');
  protected readonly acionadaEm = signal<Date | null>(null);
  protected readonly franquiaPaga = signal<number | null>(null);
  protected readonly motivo = signal('');

  protected readonly emAndamento = computed(() => {
    const s = this.sinistro()?.situacao;
    return !!s && s !== 'FINALIZADO' && s !== 'CANCELADO';
  });
  /** Novo, ou em andamento: finalizado e cancelado só se consultam (e recebem anexos, no finalizado). */
  protected readonly editavel = computed(() => this.podeEditar() && (!this.sinistro() || this.emAndamento()));
  protected readonly opcoesVeiculo = computed<GeoSelectOption<string>[]>(() =>
    this.veiculos().map((v) => ({ label: `${formatarPlaca(v.placa)}${v.modelo ? ' · ' + v.modelo : ''}`, value: v.idVeiculo })));
  protected readonly opcoesCondutor = computed<GeoSelectOption<string>[]>(() => {
    const opcoes = this.condutores().map((c) => ({ label: c.nome ?? 'Sem nome', value: c.idColaborador }));
    const s = this.sinistro();
    // Quem estava no sinistro continua na lista mesmo sem cadastro de condutor ativo.
    if (s?.idCondutor && !opcoes.some((o) => o.value === s.idCondutor)) opcoes.unshift({ label: s.condutor ?? 'Condutor', value: s.idCondutor });
    return opcoes;
  });
  protected readonly opcoesApolice = computed<GeoSelectOption<string>[]>(() =>
    this.apolices().map((a) => ({ label: `${a.numero}${a.seguradora ? ' · ' + a.seguradora : ''}`, value: a.id })));

  private readonly erros = computed<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!this.idVeiculoFixo() && !this.sinistro() && !this.veiculo()) e['veiculo'] = 'Escolha o veículo.';
    if (!this.tipo()) e['tipo'] = 'Escolha o tipo.';
    if (!this.ocorridoEm()) e['ocorridoEm'] = 'Informe a data e a hora.';
    if (!this.descricao().trim()) e['descricao'] = 'Descreva o que aconteceu.';
    return e;
  });
  protected readonly alterado = computed(() => !!this.arquivo() || this.snapshot() !== JSON.stringify(this.request()));

  constructor() {
    effect(() => {
      if (this.visivel()) {
        const s = this.sinistro();
        untracked(() => this.preencher(s));
      }
    });
  }

  protected erro(campo: string): string | undefined {
    return this.tentou() ? this.erros()[campo] : undefined;
  }

  protected abrirEtapa(etapa: Exclude<Etapa, null>): void {
    const s = this.sinistro();
    if (!s) return;
    this.etapa.set(etapa);
    if (etapa === 'seguradora') {
      this.idApolice.set(s.seguradora?.idApolice ?? null);
      this.numeroSeguradora.set(s.seguradora?.numeroSinistro ?? '');
      this.acionadaEm.set(null);
      this.carregandoApolices.set(true);
      this.servico.apolicesCobrindo(s.idVeiculo, paraDataIso(new Date(s.ocorridoEm))).subscribe({
        next: (a) => {
          this.apolices.set(a);
          if (!this.idApolice() && a.length === 1) this.idApolice.set(a[0].id);
          this.carregandoApolices.set(false);
        },
        error: (e) => {
          this.carregandoApolices.set(false);
          this.notificacoes.error(getErrorMessage(e));
        }
      });
    }
    if (etapa === 'finalizar') this.franquiaPaga.set(s.seguradora?.franquiaApolice ?? null);
    if (etapa === 'cancelar') this.motivo.set('');
  }

  protected acionar(): void {
    const s = this.sinistro();
    if (!s || !this.idApolice()) return;
    const quando = this.acionadaEm() ? paraInstanteIso(this.acionadaEm()!) : null;
    this.executarEtapa(this.servico.acionarSeguradora(s.id, this.idApolice()!, this.numeroSeguradora().trim() || null, quando), 'Seguradora acionada.');
  }

  protected finalizar(): void {
    const s = this.sinistro();
    if (!s) return;
    this.executarEtapa(this.servico.finalizarSinistro(s.id, this.franquiaPaga()), 'Sinistro finalizado.');
  }

  protected cancelar(): void {
    const s = this.sinistro();
    if (!s) return;
    this.executarEtapa(this.servico.cancelarSinistro(s.id, this.motivo().trim()), 'Sinistro cancelado.');
  }

  protected salvar(): void {
    const existente = this.sinistro();
    const arquivo = this.arquivo();
    let operacao: Observable<Sinistro>;
    if (this.editavel()) {
      this.tentou.set(true);
      if (Object.keys(this.erros()).length) {
        this.notificacoes.warning('Revise os campos destacados antes de salvar.');
        return;
      }
      operacao = this.servico.salvarSinistro(this.request(), existente?.id);
    } else if (existente && arquivo) {
      operacao = of(existente);
    } else {
      return;
    }
    this.salvando.set(true);
    operacao.pipe(switchMap((s) => (arquivo ? this.servico.anexarSinistro(s.id, arquivo) : of(s)))).subscribe({
      next: (s) => {
        this.salvando.set(false);
        this.arquivo.set(null);
        this.notificacoes.success(existente ? 'Sinistro atualizado.' : `Sinistro ${s.numero} registrado.${s.condutor ? ' Condutor: ' + s.condutor + '.' : ''}`);
        this.salvo.emit(s);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  protected baixar(anexo: AnexoFrota): void {
    const s = this.sinistro();
    if (!s) return;
    this.servico.baixarAnexoSinistro(s.id, anexo.id).subscribe({
      next: (blob) => salvarArquivo(blob, anexo.nome),
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  protected async removerAnexo(anexo: AnexoFrota): Promise<void> {
    const s = this.sinistro();
    if (!s) return;
    const ok = await this.confirmacao.confirm({ title: 'Remover anexo', message: `Remover ${anexo.nome} deste sinistro?`, variant: 'destructive' });
    if (!ok) return;
    this.servico.removerAnexoSinistro(s.id, anexo.id).subscribe({
      next: (atualizado) => {
        this.notificacoes.success('Anexo removido.');
        this.salvo.emit(atualizado);
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }

  private executarEtapa(operacao: Observable<Sinistro>, mensagem: string): void {
    this.gravandoEtapa.set(true);
    operacao.subscribe({
      next: (s) => {
        this.gravandoEtapa.set(false);
        this.etapa.set(null);
        this.notificacoes.success(mensagem);
        this.salvo.emit(s);
      },
      error: (e) => {
        this.gravandoEtapa.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private preencher(s: Sinistro | null): void {
    this.tentou.set(false);
    this.etapa.set(null);
    this.veiculo.set(s?.idVeiculo ?? this.idVeiculoFixo());
    this.tipo.set(s?.tipo ?? null);
    this.ocorridoEm.set(s ? new Date(s.ocorridoEm) : new Date());
    this.local.set(s?.local ?? '');
    this.descricao.set(s?.descricao ?? '');
    this.condutor.set(s?.idCondutor ?? null);
    this.culpa.set(s?.culpaCondutor === true ? 'SIM' : s?.culpaCondutor === false ? 'NAO' : 'NAO_APURADA');
    this.boletim.set(s?.boletimOcorrencia ?? '');
    this.terceiros.set(s?.terceiros ?? '');
    this.arquivo.set(null);
    this.snapshot.set(JSON.stringify(this.request()));
  }

  private request(): SinistroRequest {
    const texto = (v: string) => (v.trim() ? v.trim() : null);
    const culpa = this.culpa();
    return {
      idVeiculo: this.sinistro()?.idVeiculo ?? this.idVeiculoFixo() ?? this.veiculo() ?? '',
      ocorridoEm: this.ocorridoEm() ? paraInstanteIso(this.ocorridoEm()!) : '',
      local: texto(this.local()),
      tipo: this.tipo() ?? 'COLISAO_SEM_VITIMA',
      idCondutor: this.condutor(),
      culpaCondutor: culpa === 'SIM' ? true : culpa === 'NAO' ? false : null,
      descricao: this.descricao().trim(),
      terceiros: texto(this.terceiros()),
      boletimOcorrencia: texto(this.boletim())
    };
  }
}
