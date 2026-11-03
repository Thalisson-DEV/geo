/**
 * Fim do dia de hoje, para o `maxDate` dos campos de data e hora da OS. Um "agora" fixado
 * quando o componente nasce fica para trás e faz o datepicker descartar o valor sugerido.
 */
export function fimDeHoje(): Date {
  const data = new Date();
  data.setHours(23, 59, 59, 999);
  return data;
}
