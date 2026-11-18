/**
 * Checklist do veículo no app: catálogo baixado na sincronização (para preencher sem sinal),
 * registro local (rascunho e envio) e as regras que o app confere antes de enfileirar.
 * O servidor repete as validações; aqui é para o condutor não descobrir o erro só depois.
 */

export type TipoRespostaChecklist = 'OK_NOK' | 'OPCOES' | 'TEXTO';
export type UnidadeMedicao = 'KM' | 'HORAS';
/** Quando a pergunta exige foto. */
export type ModoFotoPergunta = 'NUNCA' | 'NAO_OK' | 'SEMPRE';
/** USO tem condutor; recebimento e devolução são registros sem condutor, só para administrativos. */
export type FinalidadeChecklist = 'USO' | 'RECEBIMENTO' | 'DEVOLUCAO';

export const ROTULO_FINALIDADE: Record<FinalidadeChecklist, string> = {
  USO: 'Uso do veículo',
  RECEBIMENTO: 'Recebimento do veículo',
  DEVOLUCAO: 'Devolução do veículo'
};

export interface AlternativaChecklist {
  id: string;
  texto: string;
  indicaProblema: boolean;
}

export interface PerguntaChecklist {
  id: string;
  ordem: number;
  grupo: string | null;
  texto: string;
  tipoResposta: TipoRespostaChecklist;
  /** Legado; vale o {@link modoFoto} quando vier. */
  fotoNoNaoOk: boolean;
  modoFoto?: ModoFotoPergunta;
  opcoes: AlternativaChecklist[];
  motivos: AlternativaChecklist[];
}

export interface ModeloChecklist {
  id: string;
  nome: string;
  tipo: 'PRINCIPAL' | 'ADICIONAL';
  instrucoes: string | null;
  exigeAssinatura: boolean;
  perguntas: PerguntaChecklist[];
  fotosRecebimento: { id: string; descricao: string }[];
}

export interface VeiculoChecklist {
  idVeiculo: string;
  placa: string;
  descricao: string | null;
  idBaseOperacional: string | null;
  baseNome: string | null;
  unidadeMedicao: UnidadeMedicao;
  categoriaCnhExigida: string | null;
  medicaoAtual: number | null;
  idsModelosPrincipais: string[];
  idsModelosAdicionais: string[];
  idCondutorAtual: string | null;
  condutorAtualNome: string | null;
  /** Trava do campo: o painel aceita de `medicaoAtual` até ela somada a isto (nulo = sem limite de salto). */
  limiteSalto?: number | null;
}

export interface CondutorChecklist {
  idColaborador: string;
  nome: string;
  categoriaCnh: string | null;
  validadeCnh: string | null;
}

export interface CatalogoChecklist {
  geradoEm: string;
  modelos: ModeloChecklist[];
  veiculos: VeiculoChecklist[];
  condutores: CondutorChecklist[];
  liberacoesCnh: { idCondutor: string; idVeiculo: string; dia: string }[];
}

/** Foto guardada no aparelho no instante da captura. */
export interface FotoChecklistLocal {
  idFoto: string;
  arquivo: Blob;
  nomeArquivo: string;
  enviada: boolean;
}

export interface RespostaLocal {
  idPergunta: string;
  conforme?: boolean;
  idAlternativa?: string | null;
  texto?: string;
  comentario?: string;
  fotos: FotoChecklistLocal[];
}

/**
 * Checklist no aparelho. RASCUNHO enquanto preenche; FILA depois de confirmado (salvo no
 * aparelho e enfileirado); ENVIANDO/ENVIADO conforme a fila; ERRO quando o servidor recusou.
 */
export interface ChecklistVeiculoLocal {
  id: string;
  statusSync: 'RASCUNHO' | 'FILA' | 'ENVIANDO' | 'ENVIADO' | 'ERRO';
  passo: number;
  /** Ausente nos rascunhos antigos: vale como uso. */
  finalidade?: FinalidadeChecklist;
  idVeiculo: string | null;
  placa: string | null;
  idModelo: string | null;
  idsModelosAdicionais: string[];
  idCondutor: string | null;
  condutorNome: string | null;
  preenchidoEm: string | null;
  medicao: number | null;
  comentario: string;
  assinado: boolean;
  respostas: RespostaLocal[];
  fotosRecebimento: { idFotoRecebimento: string; foto: FotoChecklistLocal }[];
  /** Itens com problema na hora de confirmar (OK/Não OK e opções que indicam problema). */
  problemas?: number;
  /** Já aceito pelo servidor: falta só subir as fotos. */
  registrado?: boolean;
  /** Id do checklist no servidor (para abrir o detalhe com as fotos e as decisões do gestor). */
  idServidor?: string | null;
  /** Fotos que o servidor espera (as de recebimento só entram quando ele vê troca de condutor). */
  fotosEsperadas?: string[];
  erro?: string | null;
  /** Aviso devolvido pelo servidor (ex.: medição menor que a anterior). */
  aviso?: string | null;
  criadoEm: string;
}

export type SituacaoCnh = 'APTO' | 'SEM_CNH' | 'VENCIDA' | 'CATEGORIA_INSUFICIENTE';

const ORDEM_CATEGORIA = 'BCDE';

/** Mesma hierarquia do CTB que o servidor usa: C habilita B; D habilita C e B; E habilita D, C e B. */
export function categoriaHabilita(atual: string | null, exigida: string | null): boolean {
  if (!exigida) return true;
  if (!atual) return false;
  if (atual === exigida) return true;
  if (exigida === 'A') return atual.includes('A');
  const nivelExigido = ORDEM_CATEGORIA.indexOf(exigida.slice(-1));
  return [...atual].some((letra) => ORDEM_CATEGORIA.indexOf(letra) >= nivelExigido && nivelExigido >= 0);
}

/** Situação da CNH do condutor para o veículo no dia (`hoje` em yyyy-MM-dd), já considerando a liberação do gestor. */
export function situacaoCnh(
  condutor: CondutorChecklist | undefined,
  veiculo: VeiculoChecklist,
  liberacoes: CatalogoChecklist['liberacoesCnh'],
  hoje: string
): { situacao: SituacaoCnh; liberado: boolean; mensagem: string } {
  let situacao: SituacaoCnh = 'APTO';
  let mensagem = 'CNH em dia.';
  if (!condutor || !condutor.validadeCnh) {
    situacao = 'SEM_CNH';
    mensagem = 'Este condutor não tem CNH registrada na frota.';
  } else if (condutor.validadeCnh < hoje) {
    situacao = 'VENCIDA';
    mensagem = `A CNH venceu em ${formatarData(condutor.validadeCnh)}.`;
  } else if (!categoriaHabilita(condutor.categoriaCnh, veiculo.categoriaCnhExigida)) {
    situacao = 'CATEGORIA_INSUFICIENTE';
    mensagem = `A CNH ${condutor.categoriaCnh ?? ''} não habilita este veículo (exige ${veiculo.categoriaCnhExigida}).`;
  }
  const liberado = situacao !== 'APTO'
    && liberacoes.some((l) => l.idCondutor === condutor?.idColaborador && l.idVeiculo === veiculo.idVeiculo && l.dia === hoje);
  return { situacao, liberado, mensagem };
}

/** Modelos que o veículo usa: o principal (o primeiro, se houver mais de um) e os adicionais. */
export function modelosDoVeiculo(catalogo: CatalogoChecklist, veiculo: VeiculoChecklist, idPrincipal?: string | null) {
  const porId = new Map(catalogo.modelos.map((m) => [m.id, m]));
  const principais = veiculo.idsModelosPrincipais.map((id) => porId.get(id)).filter((m): m is ModeloChecklist => !!m);
  const principal = principais.find((m) => m.id === idPrincipal) ?? principais[0] ?? null;
  const adicionais = veiculo.idsModelosAdicionais.map((id) => porId.get(id)).filter((m): m is ModeloChecklist => !!m);
  return { principais, principal, adicionais };
}

export interface GrupoPerguntas {
  titulo: string;
  perguntas: PerguntaChecklist[];
}

/** Perguntas em grupos, na ordem do modelo; o adicional entra com o nome dele quando a pergunta não tem grupo. */
export function gruposDePerguntas(principal: ModeloChecklist, adicionais: ModeloChecklist[]): GrupoPerguntas[] {
  const grupos: GrupoPerguntas[] = [];
  for (const modelo of [principal, ...adicionais]) {
    for (const p of [...modelo.perguntas].sort((a, b) => a.ordem - b.ordem)) {
      const titulo = p.grupo ?? (modelo === principal ? 'Itens' : modelo.nome);
      const grupo = grupos.find((g) => g.titulo === titulo) ?? grupos[grupos.push({ titulo, perguntas: [] }) - 1];
      grupo.perguntas.push(p);
    }
  }
  return grupos;
}

/** A resposta indica problema (vira pendência para o gestor)? */
export function respostaComProblema(p: PerguntaChecklist, r: RespostaLocal | undefined): boolean {
  if (!r) return false;
  if (p.tipoResposta === 'OK_NOK') return r.conforme === false;
  if (p.tipoResposta === 'OPCOES') return !!p.opcoes.find((o) => o.id === r.idAlternativa)?.indicaProblema;
  return false;
}

/** Modo da foto, aceitando o catálogo antigo que só trazia o "foto no Não OK". */
export function modoFoto(p: PerguntaChecklist): ModoFotoPergunta {
  return p.modoFoto ?? (p.fotoNoNaoOk ? 'NAO_OK' : 'NUNCA');
}

/** A resposta atual pede foto (sempre, ou no Não OK marcado)? */
export function fotoExigida(p: PerguntaChecklist, r: RespostaLocal | undefined): boolean {
  const modo = modoFoto(p);
  return modo === 'SEMPRE' || (modo === 'NAO_OK' && r?.conforme === false);
}

/** O que falta na pergunta, ou `null` se está respondida. */
export function pendenciaDaPergunta(p: PerguntaChecklist, r: RespostaLocal | undefined): string | null {
  if (p.tipoResposta === 'OK_NOK') {
    if (r?.conforme === undefined) return 'Marque OK ou Não OK.';
  } else if (p.tipoResposta === 'OPCOES') {
    if (!r?.idAlternativa) return 'Escolha uma opção.';
  } else if (!r?.texto?.trim()) {
    return 'Escreva a resposta.';
  }
  if (fotoExigida(p, r) && !r?.fotos.length) {
    return modoFoto(p) === 'SEMPRE' ? 'Tire a foto do item.' : 'Tire a foto do problema.';
  }
  return null;
}

/**
 * Trava do campo (gestores, 23/10/2026): o KM nunca é menor que o último registrado nem passa
 * dele mais que o limite. Evita a casa decimal do painel virar milhões de km. Devolve o erro
 * para mostrar ao lado do campo, ou `null` quando o valor serve. O servidor confere de novo.
 */
export function erroTravaMedicao(
  valor: number | null,
  ultimo: number | null | undefined,
  limite: number | null | undefined,
  unidade: UnidadeMedicao
): string | null {
  if (valor === null || ultimo == null) return null;
  const sufixo = unidade === 'HORAS' ? 'h' : 'km';
  const fmt = (n: number) => n.toLocaleString('pt-BR');
  if (valor < ultimo) return `Menor que o último registrado (${fmt(ultimo)} ${sufixo}). Confira o painel.`;
  if (limite != null && valor > ultimo + limite) {
    return `Passa o último registrado (${fmt(ultimo)} ${sufixo}) em mais de ${fmt(limite)} ${sufixo}. Confira se não sobrou uma casa decimal do painel.`;
  }
  return null;
}

/** "Aceita de 45.120 a 47.120 km". */
export function intervaloAceito(ultimo: number | null | undefined, limite: number | null | undefined, unidade: UnidadeMedicao): string | null {
  if (ultimo == null) return null;
  const sufixo = unidade === 'HORAS' ? 'h' : 'km';
  const fmt = (n: number) => n.toLocaleString('pt-BR');
  return limite != null ? `Aceita de ${fmt(ultimo)} a ${fmt(ultimo + limite)} ${sufixo}` : `Aceita a partir de ${fmt(ultimo)} ${sufixo}`;
}

/** Pedido do servidor (sem os arquivos: as fotos sobem depois, uma a uma, pelos ids). */
export function montarRequest(c: ChecklistVeiculoLocal) {
  return {
    idAparelho: c.id,
    idVeiculo: c.idVeiculo,
    idModelo: c.idModelo,
    idsModelosAdicionais: c.idsModelosAdicionais,
    finalidade: c.finalidade ?? 'USO',
    idCondutor: (c.finalidade ?? 'USO') === 'USO' ? c.idCondutor : null,
    preenchidoEm: c.preenchidoEm,
    medicao: c.medicao,
    comentario: c.comentario.trim() || null,
    assinado: c.assinado,
    respostas: c.respostas.map((r) => ({
      idPergunta: r.idPergunta,
      conforme: r.conforme ?? null,
      idAlternativa: r.idAlternativa ?? null,
      texto: r.texto?.trim() || null,
      comentario: r.comentario?.trim() || null,
      idsFotos: r.fotos.map((f) => f.idFoto)
    })),
    fotosRecebimento: c.fotosRecebimento.map((f) => ({ idFotoRecebimento: f.idFotoRecebimento, idFoto: f.foto.idFoto }))
  };
}

/** Todas as fotos do checklist, para subir uma a uma. */
export function todasAsFotos(c: ChecklistVeiculoLocal): FotoChecklistLocal[] {
  return [...c.respostas.flatMap((r) => r.fotos), ...c.fotosRecebimento.map((f) => f.foto)];
}

/** Data civil de hoje no aparelho (yyyy-MM-dd). */
export function diaLocal(data = new Date()): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

/** Mesmo formato da web: o padrão antigo ganha hífen (ABC-1234); o Mercosul fica como está (ABC1D23). */
export function formatarPlaca(placa: string | null | undefined): string {
  if (!placa) return '';
  const limpa = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{3}\d{4}$/.test(limpa) ? `${limpa.slice(0, 3)}-${limpa.slice(3)}` : limpa;
}

export function formatarData(iso: string): string {
  const [a, m, d] = iso.substring(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

// ---------- consulta (o que já está no servidor) ----------

export type SituacaoPendencia = 'ABERTA' | 'OS_ABERTA' | 'RESOLVIDA_NA_HORA' | 'DESCARTADA';

export interface ChecklistResumoServidor {
  id: string;
  preenchidoEm: string;
  idVeiculo: string;
  placa: string;
  baseNome: string | null;
  modeloNome: string;
  condutorNome: string | null;
  preenchidoPor: string | null;
  medicao: number | null;
  unidadeMedicao: UnidadeMedicao;
  passagemVeiculo: boolean;
  problemas: number;
  fotosAChegar: number;
  liberacaoCnh: boolean;
  finalidade?: FinalidadeChecklist;
  finalidadeRotulo?: string;
  /** CNH que não permitia dirigir: o checklist valeu, o abastecimento não. */
  avisoCnh?: string | null;
}

/** Linha da consulta no app: o `idAparelho` liga ao registro que ainda está neste celular. */
export interface ChecklistAppItem {
  idAparelho: string;
  checklist: ChecklistResumoServidor;
}

export interface FotoChecklistServidor {
  id: string;
  tipo: 'RESPOSTA' | 'RECEBIMENTO';
  descricao: string | null;
  recebida: boolean;
}

export interface RespostaServidor {
  id: string;
  grupo: string | null;
  pergunta: string;
  tipoResposta: TipoRespostaChecklist;
  conforme: boolean | null;
  resposta: string | null;
  comentario: string | null;
  problema: boolean;
  fotos: FotoChecklistServidor[];
  situacaoPendencia: SituacaoPendencia | null;
  numeroOrdemServico: number | null;
}

export interface ChecklistDetalheServidor {
  resumo: ChecklistResumoServidor;
  comentario: string | null;
  assinado: boolean;
  justificativaLiberacaoCnh: string | null;
  respostas: RespostaServidor[];
  fotosRecebimento: FotoChecklistServidor[];
}

export type TomChecklist = 'ok' | 'atencao' | 'erro' | 'destaque' | 'neutro';

/** O que o gestor fez com o Não OK, dito para quem está no campo. */
export function decisaoPendencia(situacao: SituacaoPendencia | null, numeroOs: number | null): { texto: string; tom: TomChecklist } | null {
  switch (situacao) {
    case 'ABERTA': return { texto: 'Aguardando o gestor', tom: 'atencao' };
    case 'OS_ABERTA': return { texto: numeroOs ? `Foi para a OS nº ${numeroOs}` : 'Foi para uma OS', tom: 'destaque' };
    case 'RESOLVIDA_NA_HORA': return { texto: 'Resolvido na hora', tom: 'ok' };
    case 'DESCARTADA': return { texto: 'Gestor descartou', tom: 'neutro' };
    default: return null;
  }
}

/** Resposta em texto curto, como no servidor: "OK", "Não OK — motivo", a opção ou o texto livre. */
export function textoRespostaLocal(p: PerguntaChecklist, r: RespostaLocal | undefined): string {
  if (!r) return 'Sem resposta';
  if (p.tipoResposta === 'OK_NOK') {
    if (r.conforme === undefined) return 'Sem resposta';
    if (r.conforme) return 'OK';
    const motivo = p.motivos.find((m) => m.id === r.idAlternativa)?.texto;
    return motivo ? `Não OK — ${motivo}` : 'Não OK';
  }
  if (p.tipoResposta === 'OPCOES') return p.opcoes.find((o) => o.id === r.idAlternativa)?.texto ?? 'Sem resposta';
  return r.texto?.trim() || 'Sem resposta';
}

export function resumoProblemas(problemas: number): string {
  if (!problemas) return 'Tudo OK';
  return problemas === 1 ? '1 item com problema' : `${problemas} itens com problema`;
}

/** "Hoje às 07:42" ou "14/10 às 07:42". */
export function quandoChecklist(iso: string | null | undefined): string {
  if (!iso) return '';
  const data = new Date(iso);
  const dia = diaLocal(data) === diaLocal() ? 'Hoje' : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${dia} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatarMedicao(valor: number | null | undefined, unidade: UnidadeMedicao | null | undefined): string {
  if (valor == null) return '—';
  return `${valor.toLocaleString('pt-BR')} ${unidade === 'HORAS' ? 'h' : 'km'}`;
}
