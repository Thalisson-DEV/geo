import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GeoIconComponent } from '@geo/ui';
import { AuthService } from '../../core/services/auth.service';
import { rotaOculta } from '../../core/white-label/modulos-ocultos';

interface GeoModule {
  name: string;
  description: string;
  /** Nome do ícone GEO. */
  icon: string;
  route: string;
  /** Mesma permissão que o guard exige na rota de entrada do módulo. */
  permission: string;
}

const MODULES: GeoModule[] = [
  {
    name: 'Obras',
    description: 'Carteira, programação e medições',
    icon: 'building-2',
    route: '/obras',
    permission: 'obras:obra:read',
  },
  {
    name: 'Almoxarifado',
    description: 'Materiais e estoques',
    icon: 'package',
    route: '/almoxarifado/solicitacoes-tecnicas',
    permission: 'estoque:solicitacao:read',
  },
  {
    name: 'Execução',
    description: 'Operação e produtividade',
    icon: 'zap',
    route: '/execucao/dashboard-operacional',
    permission: 'obras:turno:read',
  },
  {
    name: 'Frota',
    description: 'Veículos, manutenção e condutores',
    icon: 'car',
    route: '/frota/veiculos',
    permission: 'frota:veiculo:read',
  },
  {
    name: 'Segurança do trabalho',
    description: 'Inspeções e prevenção',
    icon: 'shield-check',
    route: '/sst/inspecoes',
    permission: 'sst:inspecao:read',
  },
  {
    name: 'Departamento pessoal',
    description: 'Pessoas e descontos em folha',
    icon: 'users',
    route: '/dp/descontos/lancamento',
    permission: 'desconto:read',
  },
  {
    name: 'Financeiro',
    description: 'Compras e pagamentos',
    icon: 'wallet',
    route: '/financeiro/compras',
    permission: 'financeiro:compra:read',
  },
  {
    name: 'Chamados',
    description: 'Suporte e atendimento',
    icon: 'ticket',
    route: '/chamados/meus',
    permission: 'chamado:read',
  },
  {
    name: 'Administração',
    description: 'Usuários e acessos',
    icon: 'settings',
    route: '/admin/cadastros/usuarios',
    permission: 'iam:usuario:read',
  },
];

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, GeoIconComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly auth = inject(AuthService);

  /** Só os módulos que o perfil consegue abrir e que fazem parte desta distribuição. */
  protected readonly modules = computed(() => {
    const permissoes = this.auth.currentUser()?.permissoes ?? [];
    return MODULES.filter(
      (module) => permissoes.includes(module.permission) && !rotaOculta(module.route),
    );
  });
}
