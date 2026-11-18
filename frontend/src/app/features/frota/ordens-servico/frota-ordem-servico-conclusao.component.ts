import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
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
import {
  FornecedorFrota,
  ItemManutencao,
  OpcoesFrota,
  OrdemServicoDetalhe,
  TipoOficina,
  formatarMedida,
  paraInstanteIso,
  rotuloOs,
  CausaManutencao,
  MotivoServico
} from '../../../core/models/frota.models';
import { fimDeHoje } from './frota-ordem-servico.util';
import { getErrorMessage } from '../../../core/models/shared.models';
import { FrotaService } from '../../../core/services/frota.service';

/** Concluir a OS ou completar a conclusão de uma OS concluída com valores pendentes. */
export type ModoConclusao = 'concluir' | 'completar';

/**
 * Encerramento da OS: datas reais, KM (ou horímetro), causa, serviço feito, peças trocadas, oficina
 * e valor. Se algum serviço ou peça da execução estiver sem valor (ou, sem lançamentos, o valor ficar
 * em branco), a OS fica "Concluída · valores pendentes" e finaliza sozinha quando o último valor entra.
 * O modo "completar" ajusta causa, serviço, oficina e valor depois de concluída.
 * Uma OS pendente ou agendada também pode ser concluída aqui (serviço já realizado).
 */
@Component({
  selector: 'app-frota-ordem-servico-conclusao',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
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
    <ces-form-drawer #drawer [(visible)]="visivel" [title]="titulo()" [description]="subtitulo()"
      [dirty]="alterado()" [loading]="salvando()" size="lg">
      <!-- Só com o drawer aberto: fechar destrói os datepickers e o painel que eles anexam ao body. -->
      @if (visivel()) {
      @if (valorAprovado() !== null) {
        <ces-callout tone="info" [dense]="true">
          Orçamentos aprovados no financeiro somam {{ moeda(valorAprovado()!) }}.
        </ces-callout>
      }
      @if (modo() === 'concluir') {
        <ces-form-section title="Execução" icon="pi pi-clock">
          <div class="ces-form-grid">
            <ces-datepicker label="Início real" [required]="true" [(value)]="inicio" [showTime]="true" [maxDate]="agora"
              [error]="erros()['inicio']"></ces-datepicker>
            <ces-datepicker label="Fim real" [required]="true" [(value)]="fim" [showTime]="true" [maxDate]="agora"
              [error]="erros()['fim']"></ces-datepicker>
            @if (ordem()?.ordem?.veicular !== false) {
              <ces-number-input [label]="horas() ? 'Horímetro na entrega' : 'KM na entrega'" [(value)]="km" [min]="0"
                [suffix]="horas() ? ' h' : ' km'" [showOptional]="!preventiva()" [required]="preventiva()" [description]="kmDescricao()"
                [error]="erros()['km']"></ces-number-input>
            }
          </div>
        </ces-form-section>
      } @else if (ordem()?.ordem; as os) {
        <ces-callout tone="neutral" icon="pi pi-check-circle" [dense]="true">
          Serviço de {{ os.inicioReal | date: 'dd/MM/yyyy HH:mm' }} a {{ os.fimReal | date: 'dd/MM/yyyy HH:mm' }}.
          Peças e serviços lançados na aba Execução entram no valor.
        </ces-callout>
      }

      <ces-form-section title="Serviço realizado" icon="pi pi-wrench">
        <ces-select label="Causa" [required]="true" [options]="causas()" [(value)]="causa" [error]="erros()['causa']"
          [description]="causaSugerida() ? 'Sugerida pelo motivo informado na abertura.' : 'Por que a manutenção aconteceu.'"></ces-select>
        <ces-multiselect label="Itens de manutenção" [required]="true" [options]="itensOpcoes()" [(value)]="idsItem" display="chip"
          [maxSelectedLabels]="6" description="Ajuste se o serviço feito foi diferente do previsto na abertura."
          [error]="erros()['idsItem']"></ces-multiselect>
        <ces-textarea label="Descrição do serviço" [required]="true" [(value)]="descricaoServico" [rows]="3" [maxlength]="4000"
          [description]="descricaoVeioDaAbertura() ? 'Veio da abertura da OS. Ajuste só se o serviço foi diferente.' : undefined"
          [error]="erros()['descricaoServico']"></ces-textarea>
        <ces-textarea label="Itens substituídos" [(value)]="itensSubstituidos" [rows]="2" [maxlength]="4000" [showOptional]="true"
          placeholder="Peças trocadas, quantidades, marcas"></ces-textarea>
      </ces-form-section>

      <ces-form-section title="Oficina e valor" icon="pi pi-briefcase">
        <div class="ces-form-grid">
          <ces-select label="Onde foi feito" [required]="true" [options]="tiposOficina()" [(value)]="tipoOficina"></ces-select>
          @if (tipoOficina() === 'EXTERNA') {
            <ces-select label="Fornecedor" [options]="fornecedoresOpcoes()" [(value)]="idFornecedor" [filter]="true" [clearable]="true"
              [error]="erros()['oficina']"></ces-select>
          }
          <!-- Na externa, fornecedor ou nome: um dos dois é obrigatório, então nenhum se diz "opcional". -->
          <ces-text-input [label]="tipoOficina() === 'EXTERNA' ? 'Oficina não cadastrada' : 'Oficina'" [(value)]="oficinaNome"
            [maxlength]="150" [showOptional]="tipoOficina() !== 'EXTERNA'"
            [description]="tipoOficina() === 'EXTERNA' ? 'Ou escolha o fornecedor ao lado.' : undefined"></ces-text-input>
          @if (totais()?.calculado) {
            <ces-number-input label="Valor total" mode="currency" [value]="totais()!.total" [readonly]="true"
              description="Calculado pelos serviços e peças da aba Execução."></ces-number-input>
          } @else {
            <ces-number-input label="Valor total" mode="currency" [(value)]="valorTotal" [min]="0" [showOptional]="true"
              description="Sem serviços nem peças lançados, vale este valor. Em branco, a OS fica com valores pendentes."></ces-number-input>
          }
        </div>
      </ces-form-section>

      @if (faltaValor().length) {
        <ces-callout tone="warning" icon="pi pi-hourglass" [dense]="true"
          [title]="modo() === 'concluir' ? 'A OS vai ficar com valores pendentes' : 'Ainda faltam valores'">
          Falta o valor de: {{ faltaValor().join('; ') }}. Lance na aba Execução quando tiver
          (ou marque como sem custo). Com o último valor, a OS fica finalizada sozinha.
        </ces-callout>
      }
      }

      <div drawer-footer class="ces-actions-row">
        <ces-button variant="ghost" label="Cancelar" (pressed)="visivel.set(false)"></ces-button>
        <ces-button icon="pi pi-check" [label]="rotuloSalvar()" [loading]="salvando()" (pressed)="salvar()"></ces-button>
      </div>
    </ces-form-drawer>
  `
})
export class FrotaOrdemServicoConclusaoComponent {
  private readonly frota = inject(FrotaService);
  private readonly notificacoes = inject(NotificationService);

  readonly visivel = model(false);
  readonly ordem = input<OrdemServicoDetalhe | null>(null);
  readonly opcoes = input<OpcoesFrota | null>(null);
  readonly modo = input<ModoConclusao>('concluir');
  readonly salvo = output<OrdemServicoDetalhe>();

  protected readonly rotuloOs = rotuloOs;
  /** Limite dos campos de data: o fim do dia de hoje (o servidor recusa o que estiver no futuro). */
  protected readonly agora = fimDeHoje();
  protected readonly itens = signal<ItemManutencao[]>([]);
  protected readonly fornecedores = signal<FornecedorFrota[]>([]);
  protected readonly salvando = signal(false);
  protected readonly erros = signal<Record<string, string>>({});

  protected readonly inicio = signal<Date | null>(null);
  protected readonly fim = signal<Date | null>(null);
  protected readonly km = signal<number | null>(null);
  protected readonly idsItem = signal<string[]>([]);
  protected readonly descricaoServico = signal('');
  protected readonly itensSubstituidos = signal('');
  protected readonly tipoOficina = signal<TipoOficina>('EXTERNA');
  protected readonly idFornecedor = signal<string | null>(null);
  protected readonly oficinaNome = signal('');
  protected readonly valorTotal = signal<number | null>(null);
  protected readonly causa = signal<CausaManutencao | null>(null);
  protected readonly descricaoVeioDaAbertura = signal(false);
  protected readonly titulo = computed(() =>
    (this.modo() === 'completar' ? 'Completar a ' : 'Concluir ') + rotuloOs(this.ordem()?.ordem?.numero));
  protected readonly subtitulo = computed(() => {
    const os = this.ordem()?.ordem;
    const alvo = os?.veicular === false ? 'Sem veículo: ' + os?.descricaoEquipamento : 'Veículo ' + (os?.placa ?? '');
    return this.modo() === 'completar'
      ? `${alvo}. Com todos os valores lançados, a OS fica finalizada e a execução não muda mais.`
      : `${alvo}. As datas reais e o tempo parado alimentam os indicadores de manutenção.`;
  });
  protected readonly rotuloSalvar = computed(() => this.modo() === 'completar' ? 'Salvar' : 'Concluir OS');
  protected readonly totais = computed(() => this.ordem()?.totais ?? null);
  /**
   * O que vai deixar a OS com valores pendentes (a mesma regra do servidor): serviço ou peça com
   * valor zero sem a marca "sem custo" (a mão de obra da oficina interna pode ficar zerada) ou,
   * sem lançamentos, o valor em branco.
   */
  protected readonly faltaValor = computed(() => {
    const d = this.ordem();
    if (!d) return [];
    if (!d.servicos.length && !d.pecas.length) return this.valorTotal() == null ? ['valor da OS'] : [];
    const interna = this.tipoOficina() === 'INTERNA';
    return [
      ...d.servicos.filter((s) => !s.subtotal && !s.semCusto && !interna).map((s) => s.descricao),
      ...d.pecas.filter((p) => !p.subtotal && !p.semCusto).map((p) => p.descricao)
    ];
  });
  private readonly drawer = viewChild.required<CesFormDrawerComponent>('drawer');
  /** Na preventiva o KM da entrega recomeça o ciclo do plano: vem preenchido com a leitura atual e é obrigatório. */
  protected readonly preventiva = computed(() => this.ordem()?.ordem.tipoManutencao === 'PREVENTIVA' && this.ordem()?.ordem.veicular !== false);
  protected readonly causaSugerida = signal(false);
  protected readonly causas = computed<CesSelectOption<CausaManutencao>[]>(() =>
    (this.opcoes()?.causasManutencao ?? []).map((o) => ({ label: o.rotulo, value: o.valor }))
  );

  private readonly assinatura = computed(() => JSON.stringify([
    this.inicio()?.getTime() ?? null, this.fim()?.getTime() ?? null, this.km(), this.idsItem(), this.descricaoServico(),
    this.itensSubstituidos(), this.tipoOficina(), this.idFornecedor(), this.oficinaNome(), this.valorTotal(), this.causa()
  ]));
  private readonly inicial = signal('');
  protected readonly alterado = computed(() => this.assinatura() !== this.inicial());

  protected readonly itensOpcoes = computed<CesSelectOption<string>[]>(() =>
    this.itens().map((i) => ({ label: `${i.nome} (${i.naturezaRotulo})`, value: i.id }))
  );
  protected readonly fornecedoresOpcoes = computed<CesSelectOption<string>[]>(() =>
    this.fornecedores().map((f) => ({ label: f.nome, value: f.id }))
  );
  protected readonly tiposOficina = computed<CesSelectOption<TipoOficina>[]>(() =>
    (this.opcoes()?.tiposOficina ?? []).map((o) => ({ label: o.rotulo, value: o.valor }))
  );
  protected readonly valorAprovado = computed(() => {
    const aprovados = (this.ordem()?.orcamentos ?? []).filter((o) => o.status === 'APROVADO');
    return aprovados.length ? aprovados.reduce((soma, o) => soma + (o.valorAprovado ?? o.valor ?? 0), 0) : null;
  });
  /** OS de veículo controlado por horas: o valor de entrega é do horímetro. */
  protected readonly horas = computed(() => this.ordem()?.ordem.unidadeMedicao === 'HORAS');
  protected readonly kmDescricao = computed(() => {
    const atual = this.ordem()?.kmAtualVeiculo;
    if (this.horas()) {
      return atual != null ? `Horímetro atual registrado: ${formatarMedida(atual, 'h')}.` : 'Entra no histórico do horímetro.';
    }
    return atual != null ? `KM atual registrado: ${formatarMedida(atual, 'km')}.` : 'Entra no histórico de quilometragem.';
  });

  constructor() {
    effect(() => {
      if (this.visivel()) untracked(() => this.preparar());
    });
  }

  protected moeda(valor: number): string {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  protected salvar(): void {
    const erros: Record<string, string> = {};
    if (this.modo() === 'concluir') {
      if (!this.inicio()) erros['inicio'] = 'Informe o início real.';
      if (!this.fim()) erros['fim'] = 'Informe o fim real.';
      if (this.inicio() && this.fim() && this.fim()! < this.inicio()!) erros['fim'] = 'O fim não pode ser antes do início.';
      if (this.preventiva() && this.km() == null) {
        erros['km'] = `Informe o ${this.horas() ? 'horímetro' : 'KM'} da entrega: o ciclo do plano recomeça por ele.`;
      }
    }
    if (!this.idsItem().length) erros['idsItem'] = 'Escolha ao menos um item.';
    if (!this.descricaoServico().trim()) erros['descricaoServico'] = 'Descreva o serviço realizado.';
    if (!this.causa()) erros['causa'] = 'Escolha a causa da manutenção.';
    if (this.tipoOficina() === 'EXTERNA' && !this.idFornecedor() && !this.oficinaNome().trim()) {
      erros['oficina'] = 'Escolha o fornecedor ou informe o nome da oficina.';
    }
    this.erros.set(erros);
    const os = this.ordem()?.ordem;
    if (Object.keys(erros).length) this.drawer().focusFirstError();
    if (Object.keys(erros).length || !os) return;

    const dadosBaixa = {
      descricaoServico: this.descricaoServico().trim(),
      itensSubstituidos: this.itensSubstituidos().trim() || null,
      valorTotal: this.totais()?.calculado ? null : this.valorTotal(),
      causa: this.causa(),
      tipoOficina: this.tipoOficina(),
      idFornecedor: this.tipoOficina() === 'EXTERNA' ? this.idFornecedor() : null,
      oficinaNome: this.oficinaNome().trim() || null,
      idsItem: this.idsItem()
    };
    this.salvando.set(true);
    const requisicao = this.modo() === 'completar'
      ? this.frota.completarConclusaoOrdemServico(os.id, { ...dadosBaixa, causa: this.causa()! })
      : this.frota.concluirOrdemServico(os.id, {
        inicioReal: paraInstanteIso(this.inicio()!),
        fimReal: paraInstanteIso(this.fim()!),
        kmEncerramento: os.veicular ? this.km() : null,
        ...dadosBaixa
      });
    requisicao.subscribe({
      next: (detalhe) => {
        this.salvando.set(false);
        this.inicial.set(this.assinatura());
        const rotulo = rotuloOs(detalhe.ordem.numero);
        const pendente = !!detalhe.ordem.baixaPendente;
        if (this.modo() === 'completar') {
          this.notificacoes.success(pendente ? `${rotulo} atualizada. Ainda faltam valores.` : `${rotulo} finalizada.`);
        } else {
          this.notificacoes.success(pendente ? `${rotulo} concluída, com valores pendentes.` : `${rotulo} concluída e finalizada.`);
        }
        for (const aviso of detalhe.avisos) this.notificacoes.warning(aviso);
        this.visivel.set(false);
        this.salvo.emit(detalhe);
      },
      error: (e) => {
        this.salvando.set(false);
        this.notificacoes.error(getErrorMessage(e));
      }
    });
  }

  private preparar(): void {
    const detalhe = this.ordem();
    const os = detalhe?.ordem;
    this.erros.set({});
    const agora = new Date();
    // Início: o real, se a oficina já começou; senão o agendamento que já passou; senão agora (o fim padrão).
    const agendada = os?.agendadaPara ? new Date(os.agendadaPara) : null;
    this.inicio.set(os?.inicioReal ? new Date(os.inicioReal) : agendada && agendada <= agora ? agendada : agora);
    this.fim.set(agora);
    this.km.set(this.preventiva() ? (detalhe?.kmAtualVeiculo ?? null) : null);
    this.idsItem.set(detalhe?.itens.map((i) => i.idItem) ?? []);
    // A descrição do serviço quase sempre repete a da abertura: vem preenchida para não digitar duas vezes.
    const planos = detalhe?.preventivas.map((p) => p.plano) ?? [];
    const daAbertura = planos.length ? `${planos.join(', ')} conforme o roteiro.` : (os?.descricao ?? '');
    this.descricaoServico.set(os?.descricaoServico ?? daAbertura);
    this.descricaoVeioDaAbertura.set(!os?.descricaoServico && !!daAbertura);
    this.itensSubstituidos.set(os?.itensSubstituidos ?? '');
    this.tipoOficina.set(os?.tipoOficina ?? 'EXTERNA');
    this.idFornecedor.set(os?.idFornecedor ?? null);
    // O local do agendamento costuma ser a oficina: não pede para digitar de novo.
    this.oficinaNome.set(os?.oficinaNome ?? (os?.idFornecedor ? '' : (os?.localAgendamento ?? '')));
    this.valorTotal.set(os?.valorTotal ?? this.valorAprovado());
    // Preventiva sugere a causa; corretiva parte do motivo da abertura, quando há equivalente.
    const sugerida = os?.causa ? null : os?.tipoManutencao === 'PREVENTIVA' ? 'SERVICO_PREVENTIVO' : causaDoMotivo(os?.motivo ?? null);
    this.causa.set(os?.causa ?? sugerida);
    this.causaSugerida.set(!!sugerida && os?.tipoManutencao !== 'PREVENTIVA');
    this.inicial.set(this.assinatura());
    forkJoin({ itens: this.frota.itensManutencao(true), fornecedores: this.frota.fornecedoresOficina() }).subscribe({
      next: (r) => {
        const daOs = (detalhe?.itens ?? [])
          .filter((i) => !r.itens.content.some((a) => a.id === i.idItem))
          .map<ItemManutencao>((i) => ({
            id: i.idItem, nome: i.nome, natureza: i.natureza, naturezaRotulo: i.naturezaRotulo,
            descricao: null, diasRepeticao: null, ativo: false
          }));
        this.itens.set([...r.itens.content, ...daOs]);
        this.fornecedores.set(r.fornecedores);
      },
      error: (e) => this.notificacoes.error(getErrorMessage(e))
    });
  }
}

/** Causa equivalente ao motivo da abertura, para a conclusão já vir sugerida (editável). */
function causaDoMotivo(motivo: MotivoServico | null): CausaManutencao | null {
  switch (motivo) {
    case 'DESGASTE_NATURAL': return 'DESGASTE_NATURAL';
    case 'MAU_USO_DESCONTO': return 'USO_INDEVIDO';
    case 'PROBLEMA_MECANICO': return 'SERVICO_CORRETIVO';
    default: return null;
  }
}
