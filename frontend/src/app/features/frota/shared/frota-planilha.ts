/**
 * Planilha detalhada da frota: CSV com ponto e vírgula e BOM, que o Excel abre direto em
 * colunas, com números no formato brasileiro (vírgula decimal) para somar sem conversão.
 */
export interface ColunaPlanilha<T> {
  readonly titulo: string;
  readonly valor: (linha: T) => string | number | null | undefined;
}

function celula(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  const texto = typeof valor === 'number' ? String(valor).replace('.', ',') : valor;
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function montarPlanilha<T>(linhas: readonly T[], colunas: readonly ColunaPlanilha<T>[]): string {
  const cabecalho = colunas.map((c) => celula(c.titulo)).join(';');
  const corpo = linhas.map((linha) => colunas.map((c) => celula(c.valor(linha))).join(';'));
  return '﻿' + [cabecalho, ...corpo].join('\r\n');
}

export function baixarPlanilha<T>(nome: string, linhas: readonly T[], colunas: readonly ColunaPlanilha<T>[]): void {
  const blob = new Blob([montarPlanilha(linhas, colunas)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${nome}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Data e hora local em "dd/mm/aaaa hh:mm", que o Excel reconhece como data. */
export function dataHoraPlanilha(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Horas entre dois instantes, com uma casa (para tempo de serviço e tempo parado). */
export function horasEntre(de: string | null | undefined, ate: string | null | undefined): number | null {
  if (!de || !ate) return null;
  const horas = (new Date(ate).getTime() - new Date(de).getTime()) / 36e5;
  return horas < 0 ? null : Math.round(horas * 10) / 10;
}
