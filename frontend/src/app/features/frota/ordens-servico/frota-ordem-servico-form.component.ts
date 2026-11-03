import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  CesBooleanControlComponent,
  CesButtonComponent,
  CesCalloutComponent,
  CesDatepickerComponent,
  CesFormDrawerComponent,
  CesFormSectionComponent,
  CesMultiSelectComponent,
  CesNumberInputComponent,
  CesSelectComponent,
  CesSelectOption,
  CesTextInputComponent,
  CesTextareaComponent,
  NotificationService
} from '@ces/ui';
import { forkJoin } from 'rxjs';
import { LookupStore } from '../../../core/lookup';
import {
  Condutor,
  Criticidade,
  EditarOrdemServicoRequest,
  FornecedorFrota,
  ItemManutencao,
  MotivoServico,
  OpcoesFrota,
  OrdemServicoDetalhe,
  OrigemOrdemServico,
  PreviaRepeticao,
  TipoManutencao,
  TipoOficina,
  VeiculoFrotaResumo,
  formatarPlaca,
  paraInstanteIso,
  rotuloOs,
  sufixoUnidade
} from '../../../core/models/frota.models';
import { fimDeHoje } from './frota-ordem-servico.util';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService, PAGINA_OPCOES } from '../../../core/services/frota.service';
import { Sinistro } from '../../../core/models/frota-seguro.models';
import { FrotaSeguroService } from '../../../core/services/frota-seguro.service';

/**
 * Abertura e edição de OS. Na abertura, o veículo pode vir fixo (aberta pela ficha do
 * veículo); o condutor em branco é preenchido pelo servidor com quem dirigia no momento.
 * Ao escolher veículo e itens, a tela avisa se algum item já foi feito na placa há pouco.
 */
@Component({
  selector: 'app-frota-ordem-servico-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    CesBooleanControlComponent,
    CesButtonComponent,
    CesCalloutComponent,
    CesDatepickerComponent,
    CesFormDrawerComponent,
    CesFormSectionComponent,
    CesMultiSelectComponent,
    CesNumberInputComponent,
    CesSelectComponent,
    CesTextInputComponent,
    CesTextareaComponent
  ],
  template: `
    <ces-form-drawer
      [(visible)]="visivel"
      [title]="editando() ? 'Editar ' + rotuloOs(ordem()!.ordem.numero) : sinistro() ? 'OS de reparo do sinistro ' + sinistro()!.numero : 'Abrir ordem de serviço'"
      [description]="editando()
        ? (ordem()!.ordem.veicular
            ? 'Veículo ' + placa(ordem()!.ordem.placa) + '. Veículo, data de abertura e KM não mudam depois de abrir.'
            : 'Sem veículo: ' + ordem()!.ordem.descricaoEquipamento + '. Equipamento e data de abertura não mudam depois de abrir.')
        : sinistro()
          ? 'Veículo ' + placa(sinistro()!.placa) + '. A OS nasce com origem sinistro, ligada a ele, e o sinistro passa a em oficina.'
          : 'Registre o problema relatado. A OS entra como pendente no painel de manutenção.'"
      [dirty]="alterado()"
      [loading]="salvando()"
      size="lg"
    >
      <!-- Só com o drawer aberto: fechar destrói os datepickers e o painel que eles anexam ao body. -->
      @if (visivel()) {
      <ces-form-section title="Veículo e problema" icon="pi pi-car">
        @if (!editando() && !idVeiculoFixo() && !sinistro()) {
          <ces-boolean-control kind="toggle" label="Manutenção sem veículo" [(value)]="semVeiculo"
            description="Ferramental, oficina ou equipamento sem placa. Não registra KM, condutor nem veículo parado."></ces-boolean-control>
        }
        <div class="ces-form-grid">
          @if (!editando() && semVeiculo()) {
            <ces-text-input label="Equipamento" [required]="true" [(value)]="descricaoEquipamento" [maxlength]="150"
              placeholder="Ex.: esmerilhadeira da oficina" [error]="erros()['descricaoEquipamento']"></ces-text-input>
            <ces-select label="Base" [required]="true" [options]="bases()" [(value)]="idBase" [filter]="true"
              [error]="erros()['idBase']"></ces-select>
          }
          @if (!editando() && !semVeiculo()) {
            <ces-select label="Veículo" [required]="true" [options]="veiculosOpcoes()" [(value)]="idVeiculo" [filter]="true"
              [disabled]="!!idVeiculoFixo() || !!sinistro()" [loading]="carregando()" [error]="erros()['idVeiculo']"
              (valueChange)="aoMudarVeiculoOuItens()"></ces-select>
          }
          <ces-multiselect label="Itens de manutenção" [required]="true" [options]="itensOpcoes()" [(value)]="idsItem"
            display="chip" [maxSelectedLabels]="6" [error]="erros()['idsItem']"
            description="O serviço ou a peça. É por item que a repetição é contada."
            (valueChange)="aoMudarVeiculoOuItens()"></ces-multiselect>
        </div>
        @if (repeticoes().length) {
          <ces-callout tone="warning" title="Manutenção recente nesta placa">
            <ul class="list-disc pl-5 my-1">
              @for (r of repeticoes(); track r.idItem) {
                <li>
                  {{ r.nome }}: {{ rotuloOs(r.repeticao.numeroOsAnterior) }} concluída
                  {{ r.repeticao.fimRealAnterior ? 'em ' + (r.repeticao.fimRealAnterior | date: 'dd/MM/yyyy') : '' }}
                  ({{ r.repeticao.diasDesdeAnterior }} dias atrás, janela de {{ r.repeticao.janelaDias }} dias).
                </li>
              }
            </ul>
            Confira se é o mesmo defeito voltando antes de abrir: a repetição fica registrada quando a OS for concluída.
          </ces-callout>
        }
        <ces-textarea label="Descrição do problema" [required]="true" [(value)]="descricao" [rows]="3" [maxlength]="2000"
          placeholder="O que foi relatado, por quem e em que situação" [error]="erros()['descricao']"></ces-textarea>
      </ces-form-section>

      <ces-form-section title="Classificação" icon="pi pi-tags">
        <div class="ces-form-grid">
          <ces-select label="Criticidade" [required]="true" [options]="criticidades()" [(value)]="criticidade"
            (valueChange)="aoMudarCriticidade()"></ces-select>
          <ces-select label="Tipo de manutenção" [required]="true" [options]="tipos()" [(value)]="tipoManutencao"></ces-select>
          <ces-select label="Origem" [required]="true" [options]="origens()" [(value)]="origem" [disabled]="origemFixa()"
            [description]="origemFixa() ? 'Reparo de sinistro: a origem não muda.' : 'Como a necessidade chegou até a frota.'"></ces-select>
          <ces-select label="Motivo" [options]="motivos()" [(value)]="motivo" [clearable]="true" [showOptional]="true"
            description="Mau uso pode virar desconto do condutor."></ces-select>
        </div>
      </ces-form-section>

      <ces-form-section title="Condutor e abertura" icon="pi pi-user">
        <div class="ces-form-grid">
          @if (veicular()) {
          <ces-select label="Condutor no momento" [options]="condutoresOpcoes()" [(value)]="idCondutor" [filter]="true"
            [clearable]="true" [showOptional]="true"
            [description]="editando() ? undefined : 'Em branco, fica quem estava vinculado ao veículo na abertura.'"></ces-select>
          }
          @if (!editando()) {
            <ces-datepicker label="Aberta em" [required]="true" [(value)]="abertaEm" [showTime]="true" [maxDate]="agora"
              description="Ajuste para lançar uma OS de algo que já aconteceu."></ces-datepicker>
            @if (!semVeiculo()) {
            <ces-number-input [label]="unidadeVeiculo() === 'HORAS' ? 'Horímetro no momento' : 'KM no momento'" [(value)]="kmAbertura"
              [min]="0" [suffix]="' ' + sufixoUnidade(unidadeVeiculo())" [showOptional]="true"
              [description]="unidadeVeiculo() === 'HORAS' ? 'Entra no histórico do horímetro do veículo.' : 'Entra no histórico de quilometragem do veículo.'"></ces-number-input>
            }
          }
        </div>
        @if (!editando() && !semVeiculo()) {
          <ces-boolean-control kind="toggle" label="Veículo parado" [(value)]="veiculoParado"
            description="Enquanto a OS estiver aberta, o veículo fica em manutenção e o tempo parado conta para a disponibilidade."></ces-boolean-control>
        }
      </ces-form-section>

      <ces-form-section title="Oficina e fornecedor" icon="pi pi-wrench" description="Já informe se o fornecedor é conhecido (ex.: serviço de Munk). Pode ficar em branco e ser definido depois.">
        <div class="ces-form-grid">
          <ces-select label="Onde será feito" [options]="tiposOficina()" [(value)]="tipoOficina"></ces-select>
          @if (tipoOficina() === 'EXTERNA') {
            <ces-select label="Fornecedor" [options]="fornecedoresOpcoes()" [(value)]="idFornecedor" [filter]="true"
              [clearable]="true" [showOptional]="true" description="Cadastro de fornecedores do financeiro."></ces-select>
          }
          <ces-text-input [label]="tipoOficina() === 'EXTERNA' ? 'Oficina não cadastrada' : 'Oficina'" [(value)]="oficinaNome"
            [maxlength]="150" [showOptional]="true"
            [placeholder]="tipoOficina() === 'EXTERNA' ? 'Nome, se não estiver na lista' : 'Ex.: oficina da base'"></ces-text-input>
        </div>
      </ces-form-section>
      }

      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="visivel.set(false)"></ces-button>
        <ces-button icon="pi pi-check" [label]="editando() ? 'Salvar alterações' : 'Abrir OS'" [loading]="salvando()"
          (pressed)="salvar()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaOrdemServicoFormComponent {
  private readonly frota = inject(FrotaService);
  private readonly lookups = inject(LookupStore);
  private readonly notificacoes = inject(NotificationService);

  readonly visivel = model(false);
  /** OS em edição; nula abre uma nova. */
  readonly ordem = input<OrdemServicoDetalhe | null>(null);
  /** Veículo já escolhido (abertura pela ficha do veículo). */
  readonly idVeiculoFixo = input<string | null>(null);
  readonly opcoes = input<OpcoesFrota | null>(null);
  /** Abertura da OS de reparo pelo sinistro: veículo, condutor e origem vêm dele. */
  readonly sinistro = input<Sinistro | null>(null);
  readonly salvo = output<OrdemServicoDetalhe>();
  /** Sinistro atualizado depois de abrir a OS de reparo por ele. */
  readonly sinistroAtualizado = output<Sinistro>();
  private readonly seguros = inject(FrotaSeguroService);

  protected readonly placa = formatarPlaca;
  protected readonly rotuloOs = rotuloOs;
  /** Limite dos campos de data: o fim do dia de hoje (o servidor recusa o que estiver no futuro). */
  protected readonly agora = fimDeHoje();

  protected readonly veiculos = signal<VeiculoFrotaResumo[]>([]);
  protected readonly itens = signal<ItemManutencao[]>([]);
  protected readonly condutores = signal<Condutor[]>([]);
  protected readonly fornecedores = signal<FornecedorFrota[]>([]);
  protected readonly carregando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erros = signal<Record<string, string>>({});
  protected readonly repeticoes = signal<PreviaRepeticao[]>([]);
  protected readonly alterado = signal(false);

  protected readonly idVeiculo = signal<string | null>(null);
  protected readonly idsItem = signal<string[]>([]);
  protected readonly descricao = signal('');
  protected readonly criticidade = signal<Criticidade>('MEDIA');
  protected readonly tipoManutencao = signal<TipoManutencao>('CORRETIVA');
  protected readonly origem = signal<OrigemOrdemServico>('VERBAL');
  protected readonly motivo = signal<MotivoServico | null>(null);
  protected readonly idCondutor = signal<string | null>(null);
  protected readonly abertaEm = signal<Date | null>(new Date());
  protected readonly kmAbertura = signal<number | null>(null);
  /** Unidade do veículo escolhido: o valor de abertura é gravado nela. */
  protected readonly unidadeVeiculo = computed(
    () => this.veiculos().find((v) => v.idVeiculo === this.idVeiculo())?.unidadeMedicao ?? 'KM'
  );
  protected readonly sufixoUnidade = sufixoUnidade;
  protected readonly veiculoParado = signal(false);
  /** OS de ferramental, oficina ou equipamento sem placa. */
  protected readonly semVeiculo = signal(false);
  protected readonly descricaoEquipamento = signal('');
  protected readonly idBase = signal<string | null>(null);
  protected readonly bases = computed<CesSelectOption<string>[]>(() =>
    this.lookups.operationalBases().map((b) => ({ label: b.label, value: b.value }))
  );
  /** Abrindo com veículo ou editando uma OS de veículo. */
  protected readonly veicular = computed(() => (this.editando() ? this.ordem()!.ordem.veicular : !this.semVeiculo()));
  protected readonly tipoOficina = signal<TipoOficina>('EXTERNA');
  protected readonly idFornecedor = signal<string | null>(null);
  protected readonly oficinaNome = signal('');

  protected readonly editando = computed(() => !!this.ordem());
  protected readonly veiculosOpcoes = computed<CesSelectOption<string>[]>(() =>
    this.veiculos().map((v) => ({
      label: `${formatarPlaca(v.placa)} — ${[v.fabricante, v.modelo].filter(Boolean).join(' ')}${v.baseOperacional ? ' · ' + v.baseOperacional : ''}`,
      value: v.idVeiculo,
      disabled: v.situacao === 'BAIXADO'
    }))
  );
  protected readonly itensOpcoes = computed<CesSelectOption<string>[]>(() =>
    this.itens().map((i) => ({ label: `${i.nome} (${i.naturezaRotulo})`, value: i.id }))
  );
  protected readonly condutoresOpcoes = computed<CesSelectOption<string>[]>(() =>
    this.condutores().map((c) => ({ label: c.nome ?? 'Sem nome', value: c.idColaborador }))
  );
  protected readonly fornecedoresOpcoes = computed<CesSelectOption<string>[]>(() =>
    this.fornecedores().map((f) => ({ label: f.nome, value: f.id }))
  );
  protected readonly criticidades = computed(() => this.paraOpcoes(this.opcoes()?.criticidades));
  protected readonly tipos = computed(() => this.paraOpcoes(this.opcoes()?.tiposManutencao));
  /** A origem sinistro só nasce pelo sinistro e não muda na edição. */
  protected readonly origemFixa = computed(() => !!this.sinistro() || this.ordem()?.ordem.origem === 'SINISTRO');
  protected readonly origens = computed(() => {
    const todas = this.paraOpcoes(this.opcoes()?.origensOrdemServico).filter((o) => o.value !== 'IMPORTACAO');
    if (!this.origemFixa()) return todas.filter((o) => o.value !== 'SINISTRO');
    return todas.some((o) => o.value === 'SINISTRO') ? todas : [...todas, { label: 'Sinistro', value: 'SINISTRO' as OrigemOrdemServico }];
  });
  protected readonly motivos = computed(() => this.paraOpcoes(this.opcoes()?.motivosServico));
  protected readonly tiposOficina = computed(() => this.paraOpcoes(this.opcoes()?.tiposOficina));

  constructor() {
    effect(() => {
      if (this.visivel()) untracked(() => this.preparar());
    });
    effect(() => {
      // Qualquer mudança depois de preparar conta como alteração (confirmação ao fechar).
      this.idVeiculo(); this.idsItem(); this.descricao(); this.criticidade(); this.tipoManutencao(); this.origem();
      this.motivo(); this.idCondutor(); this.kmAbertura(); this.tipoOficina(); this.idFornecedor(); this.oficinaNome();
      untracked(() => {
        if (this.visivel() && !this.carregando()) this.alterado.set(true);
      });
    });
  }

  protected aoMudarCriticidade(): void {
    if (!this.editando()) this.veiculoParado.set(this.criticidade() === 'URGENTE');
  }

  protected aoMudarVeiculoOuItens(): void {
    const idVeiculo = this.editando() ? this.ordem()!.ordem.idVeiculo : this.idVeiculo();
    const idsItem = this.idsItem();
    if (!idVeiculo || !idsItem.length) {
      this.repeticoes.set([]);
      return;
    }
    this.frota.previaRepeticoes(idVeiculo, idsItem).subscribe({
      next: (r) => this.repeticoes.set(r),
      error: () => this.repeticoes.set([])
    });
  }

  protected salvar(): void {
    const erros: Record<string, string> = {};
    if (!this.editando() && !this.semVeiculo() && !this.idVeiculo()) erros['idVeiculo'] = 'Escolha o veículo.';
    if (!this.editando() && this.semVeiculo() && !this.descricaoEquipamento().trim()) erros['descricaoEquipamento'] = 'Informe o equipamento.';
    if (!this.editando() && this.semVeiculo() && !this.idBase()) erros['idBase'] = 'Escolha a base.';
    if (!this.idsItem().length) erros['idsItem'] = 'Escolha ao menos um item.';
    if (!this.descricao().trim()) erros['descricao'] = 'Descreva o problema.';
    this.erros.set(erros);
    if (Object.keys(erros).length) return;

    const comum: EditarOrdemServicoRequest = {
      tipoManutencao: this.tipoManutencao(),
      origem: this.origem(),
      criticidade: this.criticidade(),
      motivo: this.motivo(),
      descricao: this.descricao().trim(),
      idsItem: this.idsItem(),
      idCondutor: this.veicular() ? this.idCondutor() : null,
      tipoOficina: this.tipoOficina(),
      idFornecedor: this.tipoOficina() === 'EXTERNA' ? this.idFornecedor() : null,
      oficinaNome: this.oficinaNome().trim() || null
    };
    const atual = this.ordem();
    const sinistro = this.sinistro();
    if (!atual && sinistro) {
      this.abrirPeloSinistro(sinistro, comum);
      return;
    }
    const operacao = atual
      ? this.frota.editarOrdemServico(atual.ordem.id, comum)
      : this.frota.abrirOrdemServico({
          ...comum,
          idVeiculo: this.semVeiculo() ? null : this.idVeiculo(),
          abertaEm: this.abertaEm() ? paraInstanteIso(this.abertaEm()!) : null,
          kmAbertura: this.semVeiculo() ? null : this.kmAbertura(),
          veiculoParado: this.semVeiculo() ? false : this.veiculoParado(),
          idBaseOperacional: this.semVeiculo() ? this.idBase() : null,
          descricaoEquipamento: this.semVeiculo() ? this.descricaoEquipamento().trim() : null
        });
    this.salvando.set(true);
    operacao.subscribe({
      next: (os) => {
        this.salvando.set(false);
        this.alterado.set(false);
        this.notificacoes.success(atual ? 'OS atualizada.' : `${rotuloOs(os.ordem.numero)} aberta.`);
        for (const aviso of os.avisos) this.notificacoes.warning(aviso);
        this.visivel.set(false);
        this.salvo.emit(os);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private abrirPeloSinistro(sinistro: Sinistro, comum: EditarOrdemServicoRequest): void {
    this.salvando.set(true);
    const { origem: _origem, ...semOrigem } = comum;
    this.seguros.abrirOrdemServico(sinistro.id, {
      ...semOrigem,
      abertaEm: this.abertaEm() ? paraInstanteIso(this.abertaEm()!) : null,
      kmAbertura: this.kmAbertura(),
      veiculoParado: this.veiculoParado()
    }).subscribe({
      next: (s) => {
        this.salvando.set(false);
        this.alterado.set(false);
        this.notificacoes.success(`${rotuloOs(s.reparo?.numero)} aberta para o sinistro ${s.numero}.`);
        this.visivel.set(false);
        this.sinistroAtualizado.emit(s);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private preparar(): void {
    this.carregando.set(true);
    this.erros.set({});
    this.repeticoes.set([]);
    const atual = this.ordem()?.ordem;
    const sinistro = this.sinistro();
    this.idVeiculo.set(atual?.idVeiculo ?? sinistro?.idVeiculo ?? this.idVeiculoFixo());
    this.idsItem.set(this.ordem()?.itens.map((i) => i.idItem) ?? []);
    this.descricao.set(atual?.descricao ?? (sinistro ? `Sinistro ${sinistro.numero} (${sinistro.tipoRotulo.toLowerCase()}): ${sinistro.descricao}`.slice(0, 2000) : ''));
    this.criticidade.set(atual?.criticidade ?? 'MEDIA');
    this.tipoManutencao.set(atual?.tipoManutencao ?? 'CORRETIVA');
    this.origem.set(sinistro ? 'SINISTRO' : atual?.origem && atual.origem !== 'IMPORTACAO' ? atual.origem : 'VERBAL');
    this.motivo.set(atual?.motivo ?? null);
    this.idCondutor.set(atual?.idCondutor ?? sinistro?.idCondutor ?? null);
    this.abertaEm.set(new Date());
    this.kmAbertura.set(null);
    this.veiculoParado.set(false);
    this.semVeiculo.set(false);
    this.descricaoEquipamento.set('');
    this.idBase.set(null);
    this.lookups.loadBootstrap().subscribe({ error: () => undefined });
    this.tipoOficina.set(atual?.tipoOficina ?? 'EXTERNA');
    this.idFornecedor.set(atual?.idFornecedor ?? null);
    this.oficinaNome.set(atual?.oficinaNome ?? '');

    forkJoin({
      veiculos: this.frota.listarVeiculos({ ativo: true }, { ...PAGINA_OPCOES, sort: ['placa'] }),
      itens: this.frota.itensManutencao(true),
      condutores: this.frota.listarCondutores({ ativo: true }, { ...PAGINA_OPCOES, sort: ['cnhValidade'] }),
      fornecedores: this.frota.fornecedoresOficina()
    }).subscribe({
      next: (r) => {
        this.veiculos.set(r.veiculos.content);
        this.itens.set(this.comItensDaOs(r.itens.content));
        this.condutores.set(r.condutores.content.sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '')));
        this.fornecedores.set(r.fornecedores);
        this.carregando.set(false);
        this.alterado.set(false);
        if (this.editando()) this.aoMudarVeiculoOuItens();
      },
      error: (e) => {
        this.carregando.set(false);
        this.alterado.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  /** Itens desativados que a OS já tem continuam aparecendo na edição. */
  private comItensDaOs(ativos: ItemManutencao[]): ItemManutencao[] {
    const daOs = (this.ordem()?.itens ?? [])
      .filter((i) => !ativos.some((a) => a.id === i.idItem))
      .map<ItemManutencao>((i) => ({
        id: i.idItem, nome: i.nome, natureza: i.natureza, naturezaRotulo: i.naturezaRotulo,
        descricao: null, diasRepeticao: null, ativo: false
      }));
    return [...ativos, ...daOs];
  }

  private paraOpcoes<T extends string>(lista: { valor: T; rotulo: string }[] | undefined): CesSelectOption<T>[] {
    return (lista ?? []).map((o) => ({ label: o.rotulo, value: o.valor }));
  }
}
