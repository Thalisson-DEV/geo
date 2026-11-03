/** "3 dias e 4 h", "5 h", "40 min": tempo entre dois instantes (até agora quando falta o fim). */
export function duracaoEntre(inicio: string, fim: string | null | undefined, agora = new Date()): string {
  const minutos = Math.max(0, Math.round(((fim ? new Date(fim) : agora).getTime() - new Date(inicio).getTime()) / 60000));
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  const resto = horas % 24;
  const textoDias = dias === 1 ? '1 dia' : `${dias} dias`;
  return resto ? `${textoDias} e ${resto} h` : textoDias;
}
