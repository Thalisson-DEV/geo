import { inject, signal } from '@angular/core';
import { CesSelectOption, cesFilter, cesListState } from '@ces/ui';
import { of } from 'rxjs';
import { OrigemAbastecimento, SituacaoAbastecimento } from '../../../core/models/frota-abastecimento.models';
import { FrotaAbastecimentoService } from '../../../core/services/frota-abastecimento.service';
import { basesFrota } from '../shared/frota-lista';

export const SITUACOES_ABASTECIMENTO: CesSelectOption<SituacaoAbastecimento>[] = [
  { label: 'Aguardando aprovação', value: 'AGUARDANDO_APROVACAO' },
  { label: 'Aprovada', value: 'APROVADA' },
  { label: 'Liberada', value: 'LIBERADA' },
  { label: 'Realizada', value: 'REALIZADA' },
  { label: 'Reprovada', value: 'REPROVADA' },
  { label: 'Cancelada', value: 'CANCELADA' },
  { label: 'Vencida', value: 'VENCIDA' }
];

export const OPCOES_ORIGEM: CesSelectOption<OrigemAbastecimento | null>[] = [
  { label: 'Todas', value: null },
  { label: 'Pedido pelo app', value: 'APP' },
  { label: 'Avulso', value: 'AVULSA' }
];

export const OPCOES_ALERTA: CesSelectOption<boolean | null>[] = [
  { label: 'Todos', value: null },
  { label: 'Com alerta', value: true },
  { label: 'Sem alerta', value: false }
];

/**
 * Um só recorte para as quatro abas (base, posto, período, alertas e, em Todos, a situação):
 * quem filtra por um posto em "Para liberar" continua nele ao passar para "Liberados". Fica na
 * URL; cada aba guarda só a própria página e ordenação. Crie num inicializador de campo.
 */
export function filtrosAbastecimento() {
  const servico = inject(FrotaAbastecimentoService);
  const bases = basesFrota();
  const opcoesPosto = signal<CesSelectOption<string | null>[]>([]);
  servico.postos(true).subscribe({
    next: (p) =>
      opcoesPosto.set(p.content.filter((x) => x.ativo).map((x) => ({ label: x.baseNome ? `${x.nome} · ${x.baseNome}` : x.nome, value: x.id }))),
    error: () => undefined
  });

  const estado = cesListState({
    storageKey: 'frota-abastecimentos',
    rememberFilters: 'frota-abastecimentos',
    filters: {
      situacoes: cesFilter.list<SituacaoAbastecimento>([], {
        label: 'Situação',
        param: 'situacao',
        itemLabel: (s) => SITUACOES_ABASTECIMENTO.find((o) => o.value === s)?.label ?? s,
        countLabel: (n) => `${n} selecionadas`
      }),
      idsBase: cesFilter.list<string>([], { label: 'Base', param: 'base', shared: 'frota.base', itemLabel: (id) => bases.nome(id), countLabel: (n) => `${n} selecionadas` }),
      idPosto: cesFilter.value<string | null>(null, { label: 'Posto', param: 'posto', options: () => opcoesPosto() }),
      de: cesFilter.date(null, { label: 'De' }),
      ate: cesFilter.date(null, { label: 'Até' }),
      comAlerta: cesFilter.value<boolean | null>(null, { label: 'Alertas', param: 'alerta', options: () => OPCOES_ALERTA }),
      origem: cesFilter.value<OrigemAbastecimento | null>(null, { label: 'Origem', param: 'origem', options: () => OPCOES_ORIGEM })
    }
  });
  // Sem consulta própria: a "carga" vazia só grava o recorte aplicado na URL; as abas consultam.
  estado.results(() => of([]));

  return { estado, bases, opcoesPosto };
}

export type FiltrosAbastecimento = ReturnType<typeof filtrosAbastecimento>;
