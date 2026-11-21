import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  ArrowDownToLine, ArrowLeftRight, ArrowRight, ArrowUpFromLine, Boxes, Calendar, CalendarCheck, Camera, Check,
  ChevronLeft, ChevronRight, CircleArrowDown, CircleUserRound, ClipboardCheck, ClipboardPaste, Clock, CloudUpload,
  Download, Ellipsis, FileText, Flag, Flashlight, FolderCheck, Fuel, History, Image, Info, Kanban, Keyboard, List, ListFilter,
  ListOrdered, LocateFixed, LogOut, MapPin, Maximize2, Minimize2, Minus, Moon, Package, Pencil, Plus, RefreshCw,
  ScanBarcode, Search, Share, ShieldCheck, ShoppingCart, Signature, Smartphone, Star, Sun, Trash2, TriangleAlert, Truck,
  Undo2, Upload, UserRoundX, Users, Warehouse, WifiOff, Wrench, X, HardHat, Navigation, Map as Mapa, Hammer, CircleCheckBig, Bell, Ban, Layers, QrCode, Phone,
  type IconNode,
} from 'lucide';

/**
 * Ícones do app de campo: Lucide, o mesmo conjunto do web, embutidos no bundle (abrem offline).
 * Os nomes são os do app (em português) e cada um aponta para o desenho Lucide equivalente.
 * Para um ícone novo, importe do `lucide` e acrescente aqui.
 */
export const ICONES = {
  hoje: CalendarCheck,
  servicos: Wrench,
  material: Package,
  conta: CircleUserRound,
  inspecao: ClipboardCheck,
  desvio: TriangleAlert,
  mais: Plus,
  menos: Minus,
  fechar: X,
  voltar: ChevronLeft,
  avancar: ChevronRight,
  seta: ArrowRight,
  check: Check,
  local: MapPin,
  local_busca: LocateFixed,
  nuvem: CloudUpload,
  aparelho: Smartphone,
  sem_rede: WifiOff,
  retomar: History,
  baixar: Download,
  subir: Upload,
  atualizar: RefreshCw,
  alerta: TriangleAlert,
  estrela: Star,
  info: Info,
  busca: Search,
  filtro: ListFilter,
  camera: Camera,
  imagem: Image,
  lixeira: Trash2,
  editar: Pencil,
  relogio: Clock,
  caminhao: Truck,
  combustivel: Fuel,
  pessoas: Users,
  sair: LogOut,
  sol: Sun,
  lua: Moon,
  compartilhar_ios: Share,
  instalar: CircleArrowDown,
  documento: FileText,
  transferencia: ArrowLeftRight,
  estoque: Warehouse,
  mais_opcoes: Ellipsis,
  // Almoxarifado (perfil administrativo)
  almox: Boxes,
  entrada: ArrowDownToLine,
  saida: ArrowUpFromLine,
  desfazer: Undo2,
  bandeira: Flag,
  codigo_barras: ScanBarcode,
  teclado: Keyboard,
  colar: ClipboardPaste,
  sequencia: ListOrdered,
  quadro: Kanban,
  lista: List,
  calendario: Calendar,
  escudo: ShieldCheck,
  lanterna: Flashlight,
  expandir: Maximize2,
  recolher: Minimize2,
  assinatura: Signature,
  fechamento: FolderCheck,
  carrinho: ShoppingCart,
  pessoa_fora: UserRoundX,
  // Obras
  obra: HardHat,
  navegar: Navigation,
  mapa: Mapa,
  ferramenta: Hammer,
  tudo_feito: CircleCheckBig,
  aviso: Bell,
  impedido: Ban,
  camadas: Layers,
  qr: QrCode,
  telefone: Phone,
} satisfies Record<string, IconNode>;

export type NomeIcone = keyof typeof ICONES;

/** Monta o conteúdo do `<svg>` a partir dos nós do Lucide (dados estáticos do pacote, nunca do usuário). */
export function svgDoIcone(no: IconNode): string {
  return no
    .map(([tag, atributos]) => {
      const attrs = Object.entries(atributos)
        .map(([nome, valor]) => `${nome}="${String(valor).replace(/"/g, '&quot;')}"`)
        .join(' ');
      return `<${tag} ${attrs}/>`;
    })
    .join('');
}

const CACHE_SVG = new Map<NomeIcone, string>();

@Component({
  selector: 'geo-icone',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg [attr.width]="tamanho()" [attr.height]="tamanho()" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"
      [innerHTML]="svg()"></svg>`,
  styles: [`:host { display: inline-flex; flex: none; line-height: 0; } svg { display: block; }`],
})
export class IconeComponent {
  private readonly sanitizer = inject(DomSanitizer);
  readonly nome = input.required<NomeIcone>();
  readonly tamanho = input(22);
  // Conteúdo vem só do mapa estático acima — nunca de entrada do usuário.
  readonly svg = computed(() => {
    const nome = this.nome();
    let svg = CACHE_SVG.get(nome);
    if (svg === undefined) {
      svg = ICONES[nome] ? svgDoIcone(ICONES[nome]) : '';
      CACHE_SVG.set(nome, svg);
    }
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });
}
