import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GeoBussolaAvatarComponent, GeoIconComponent, GeoMapaCampoComponent } from '@geo/ui';
import { AuthService } from '../../core/services/auth.service';
import { rotaOculta } from '../../core/white-label/modulos-ocultos';

/** Um destino do GEO, liberado pela mesma permissão que o guard exige na rota. */
export interface DestinoDoInicio {
  readonly rotulo: string;
  readonly rota: string;
  readonly permissao: string;
  readonly query?: Record<string, string>;
}

/** Módulo apresentado na entrada: a porta principal e os atalhos mais usados dentro dele. */
export interface ModuloDoInicio extends DestinoDoInicio {
  readonly descricao: string;
  /** Nome do ícone GEO. */
  readonly icone: string;
  readonly destaque?: boolean;
  readonly atalhos: readonly DestinoDoInicio[];
}

/** Quantos atalhos cada cartão mostra; o destaque tem espaço para mais. */
const ATALHOS_POR_CARTAO = 3;
const ATALHOS_NO_DESTAQUE = 4;

export const MODULOS_DO_INICIO: readonly ModuloDoInicio[] = [
  {
    rotulo: 'Obras',
    descricao: 'Carteira, programação das equipes, medições e encerramento.',
    icone: 'building-2',
    rota: '/obras',
    permissao: 'obras:obra:read',
    destaque: true,
    atalhos: [
      { rotulo: 'Nova obra', rota: '/obras/nova', permissao: 'obras:obra:write' },
      { rotulo: 'Programação', rota: '/obras/programacao', permissao: 'obras:programacao:read' },
      { rotulo: 'Medições', rota: '/obras/medicoes', permissao: 'obras:medicao:read' },
      { rotulo: 'Encerramento', rota: '/obras/encerramento', permissao: 'obras:fechamento:read' },
    ],
  },
  {
    rotulo: 'Almoxarifado',
    descricao: 'Solicitações, saldos e movimentação de materiais.',
    icone: 'package',
    rota: '/almoxarifado/solicitacoes-tecnicas',
    permissao: 'estoque:solicitacao:read',
    atalhos: [
      { rotulo: 'Solicitar materiais', rota: '/almoxarifado/solicitacoes-tecnicas/nova', permissao: 'estoque:solicitacao:create' },
      { rotulo: 'Saldos', rota: '/almoxarifado/saldos', permissao: 'estoque:saldo:read' },
      { rotulo: 'Movimentações', rota: '/almoxarifado/movimentacoes', permissao: 'estoque:movimentacao:read' },
    ],
  },
  {
    rotulo: 'Execução',
    descricao: 'Turnos das equipes e produtividade em campo.',
    icone: 'zap',
    rota: '/execucao/dashboard-operacional',
    permissao: 'obras:turno:read',
    atalhos: [
      { rotulo: 'Turnos', rota: '/obras/turnos', permissao: 'obras:turno:read' },
      { rotulo: 'Boletim', rota: '/obras/boletim', permissao: 'obras:turno:read' },
    ],
  },
  {
    rotulo: 'Frota',
    descricao: 'Veículos, manutenção, abastecimento e condutores.',
    icone: 'car',
    rota: '/frota/veiculos',
    permissao: 'frota:veiculo:read',
    atalhos: [
      { rotulo: 'Ordens de serviço', rota: '/frota/ordens-servico', permissao: 'frota:os:read' },
      { rotulo: 'Abastecimentos', rota: '/frota/abastecimentos', permissao: 'frota:abastecimento:read' },
      { rotulo: 'Preventiva', rota: '/frota/preventiva', permissao: 'frota:preventiva:read' },
    ],
  },
  {
    rotulo: 'Segurança do trabalho',
    descricao: 'Inspeções de campo, desvios e prevenção.',
    icone: 'shield-check',
    rota: '/sst/inspecoes',
    permissao: 'sst:inspecao:read',
    atalhos: [
      { rotulo: 'Nova inspeção', rota: '/sst/inspecoes/nova', permissao: 'sst:inspecao:write' },
      { rotulo: 'Desvios', rota: '/sst/desvios', permissao: 'sst:inspecao:read' },
    ],
  },
  {
    rotulo: 'Departamento pessoal',
    descricao: 'Descontos em folha, da validação à baixa.',
    icone: 'users',
    rota: '/dp/descontos/lancamento',
    permissao: 'desconto:read',
    atalhos: [
      { rotulo: 'Aguardando validação', rota: '/dp/descontos/validacao', permissao: 'desconto:read' },
      { rotulo: 'Painel', rota: '/dp/descontos/dashboard', permissao: 'desconto:dashboard:read' },
    ],
  },
  {
    rotulo: 'Financeiro',
    descricao: 'Compras, pagamentos e aprovações.',
    icone: 'wallet',
    rota: '/financeiro/compras',
    permissao: 'financeiro:compra:read',
    atalhos: [
      { rotulo: 'Nova compra', rota: '/financeiro/compras/nova', permissao: 'financeiro:compra:write' },
      { rotulo: 'Aprovações', rota: '/financeiro/aprovacoes/compras', permissao: 'financeiro:compra:aprovar' },
      { rotulo: 'Pagamentos', rota: '/financeiro/pagamentos', permissao: 'financeiro:pagamento:read' },
    ],
  },
  {
    rotulo: 'Automações',
    descricao: 'Relatórios e avisos que saem sozinhos, na hora combinada.',
    icone: 'network',
    rota: '/notificacoes/automacoes',
    permissao: 'automacao:read',
    atalhos: [{ rotulo: 'Nova automação', rota: '/notificacoes/automacoes', query: { novo: '1' }, permissao: 'automacao:manage' }],
  },
  {
    rotulo: 'Chamados',
    descricao: 'Suporte interno e atendimento da central.',
    icone: 'ticket',
    rota: '/chamados/meus',
    permissao: 'chamado:read',
    atalhos: [
      { rotulo: 'Novo chamado', rota: '/chamados/meus', query: { novo: '1' }, permissao: 'chamado:read' },
      { rotulo: 'Fila da central', rota: '/chamados/fila', permissao: 'chamado:manage' },
    ],
  },
];

/** Administração não é trabalho do dia a dia: fica numa faixa discreta no fim da página, na largura toda. */
export const ADMINISTRACAO_DO_INICIO: readonly DestinoDoInicio[] = [
  { rotulo: 'Usuários', rota: '/admin/cadastros/usuarios', permissao: 'iam:usuario:read' },
  { rotulo: 'Perfis de acesso', rota: '/admin/cadastros/perfis-acesso', permissao: 'iam:perfil:read' },
];

/** Perguntas prontas para quem ainda não sabe o que pedir à Bússola. */
export const SUGESTOES_DA_BUSSOLA: readonly string[] = [
  'Quais obras estão atrasadas?',
  'Como está o estoque de materiais?',
  'Resuma a operação desta semana',
];

/** Mesma permissão da rota /bussola. */
const PERMISSAO_BUSSOLA = 'assistente:chat:use';

/** O mapa da entrada se desenha só na primeira visita da sessão; depois, já aparece pronto. */
let mapaJaDesenhado = false;

/** "Bom dia", "Boa tarde" ou "Boa noite", pela hora local. */
export function saudacaoPelaHora(hora: number): string {
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Primeiro nome, com só a inicial maiúscula (os cadastros costumam vir em caixa alta). */
export function primeiroNome(nome: string | undefined | null): string {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0] ?? '';
  return primeiro ? primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR') : '';
}

const FORMATO_DATA = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Entrada do GEO: faixa da marca (mapa de campo, saudação e a pergunta à Bússola) e os módulos que o
 * perfil pode abrir, cada um com os atalhos mais usados. Sem dados do servidor: abre na hora, inclusive
 * sem sinal.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, GeoBussolaAvatarComponent, GeoIconComponent, GeoMapaCampoComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly sugestoes = SUGESTOES_DA_BUSSOLA;

  protected readonly animarMapa = !mapaJaDesenhado;
  protected readonly hoje = primeiraMaiuscula(FORMATO_DATA.format(new Date()));
  protected readonly saudacao = computed(() => {
    const usuario = this.auth.currentUser();
    // Conta técnica (nome igual ao login, como USRADMIN) não tem nome de gente para cumprimentar.
    const nome = usuario?.nome?.trim().toUpperCase() === usuario?.login?.trim().toUpperCase() ? '' : primeiroNome(usuario?.nome);
    const ola = saudacaoPelaHora(new Date().getHours());
    return nome ? `${ola}, ${nome}` : ola;
  });

  constructor() {
    mapaJaDesenhado = true;
  }

  private readonly permissoes = computed(() => new Set(this.auth.currentUser()?.permissoes ?? []));

  protected readonly modulos = computed(() => {
    const pode = (destino: DestinoDoInicio) => this.liberado(destino);
    return MODULOS_DO_INICIO.filter(pode).map((modulo) => ({
      ...modulo,
      atalhos: modulo.atalhos
        .filter(pode)
        .slice(0, modulo.destaque ? ATALHOS_NO_DESTAQUE : ATALHOS_POR_CARTAO),
    }));
  });

  protected readonly administracao = computed(() =>
    ADMINISTRACAO_DO_INICIO.filter((destino) => this.liberado(destino)),
  );

  protected readonly podeUsarBussola = computed(() => this.permissoes().has(PERMISSAO_BUSSOLA));

  /** Abre a Bússola com a pergunta já escrita no campo, pronta para enviar. Vazia, só abre o chat. */
  protected perguntar(evento: Event, campo: HTMLInputElement): void {
    evento.preventDefault();
    this.abrirBussola(campo.value);
  }

  protected abrirBussola(pergunta = ''): void {
    const texto = pergunta.trim();
    void this.router.navigate(['/bussola'], texto ? { queryParams: { pergunta: texto } } : {});
  }

  private liberado(destino: DestinoDoInicio): boolean {
    return this.permissoes().has(destino.permissao) && !rotaOculta(destino.rota);
  }
}

function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1);
}
