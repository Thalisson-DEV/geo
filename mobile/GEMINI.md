# App de campo GEO (`mobile/`) — instruções para agentes

Leia também o `CLAUDE.md` e o `AGENTS.md` da raiz. O plano em andamento está nas changes OpenSpec
`identidade-visual-app-campo` (redesign) e `execucao-campo-obras` (Obras offline).

---

## 🎯 1. Identidade do Projeto

**Nome:** GEO Campo (projeto Angular `geo-field-app-tmp`). Produto white label: nenhum nome, logo ou mascote de empresa.
**Propósito:** PWA usado por **encarregados de equipes de campo** e pelo **perfil administrativo** (SST, almoxarifado, técnico de
obras). Em campo o aparelho fica sem sinal por horas: tudo o que a equipe lança precisa funcionar offline e sincronizar depois.
**Aparelhos:** ~70% tablet (deitado e em pé), também celular; Android e iPhone. Distribuição como PWA, sem loja.
**Diretriz do produto:** tudo o que puder ser facilitado para a equipe de campo deve ser facilitado — o app diz o próximo passo,
pré-preenche o que o sistema já sabe e nunca trava por falta de rede.

---

## 📱 2. UI/UX — padrão de mercado para apps de campo

Material 3 e diretrizes da Apple, com a marca GEO do web e **escala de toque** (a regra "densidade compacta" é só do web).

- **Navegação:** 3 a 5 destinos por perfil. Abas embaixo no celular e no tablet em pé; **barra lateral** (navigation rail) no
  tablet deitado (≥ 900 × 600 px), com a marca no topo. Telas de lançamento e detalhe ocupam a tela toda, sem navegação.
- **Coluna de conteúdo:** no tablet a tela fica numa coluna centralizada (`--geo-conteudo-max`); elementos fixos usam
  `--geo-nav-lateral` e `--geo-recuo-coluna` para se alinhar a ela.
- **Toque:** alvos ≥ 48 px (botão principal 52–56 px; quando o visual é menor, estenda a área com pseudo-elemento); corpo de 15 px,
  campos com fonte ≥ 16 px (sem zoom no iOS); `:hover` só em `@media (hover: hover) and (pointer: fine)`; retorno no `:active`.
- **Um botão principal por tela**, ao alcance do polegar. Faixa de ação fixa no pé leva `data-acao-fixa` (o toast sobe acima dela).
- **Folhas inferiores** no lugar de diálogos; formulários longos em passos; **desfazer** no lugar de "tem certeza?" para ações
  reversíveis; skeleton (`role="status"`) em vez de spinner; estado de envio sempre visível.
- **Cores e tipo:** só tokens de `src/styles/geo-tokens.scss` (nomes em português: `--geo-fundo`, `--geo-texto`, `--geo-destaque`…)
  com a paleta do web (zinc + azul 600), Inter empacotada no app (`styles/_fonte.scss`), peso máximo 600. Verde, âmbar e texto
  terciário ficam um tom mais escuros que no web (≥ 4,5:1 sob sol); contorno de controle usa `--geo-borda-campo` (≥ 3:1).
- **Temas:** claro por padrão (decisão do produto), escuro, "Sistema" e alto contraste (modo sol), em qualquer combinação.
- **Ícones:** Lucide pelo `<geo-icone>` (`src/app/ui/icone.component.ts`), traço 1,75; ícone novo = importar do `lucide` e mapear.
- **Componentes:** os do `src/app/ui/` (sem PrimeNG no app). Toda mudança visual termina com screenshots claro/escuro em celular,
  tablet em pé e deitado (`e2e/support/redesign-shots.spec.ts` → `docs/redesign/mobile/`) e revisão do `ui-reviewer`.

---

## 🏗️ 3. Stack Tecnológica

| Tecnologia | Versão | Papel |
|---|---|---|
| Angular | 22 (standalone, signals, **zoneless**, OnPush) | Framework |
| TypeScript | 6.0 | Linguagem |
| `@angular/service-worker` | 22 | PWA, cache offline |
| Dexie | 4 | IndexedDB (fila, rascunhos, sessão) |
| `lucide` | 1.x | Ícones |
| `@fontsource-variable/inter` | 5 | Fonte (só subconjuntos latinos) |
| Vitest (modo navegador, Chromium) + Playwright | — | Testes unitários e e2e |

- Sem `zone.js`, `@angular/animations`, Tailwind, NgRx ou PrimeNG. Transições por CSS com os tokens de movimento.
- Estado com `signal`/`computed`/`effect`; `inject()`; rotas lazy; guards funcionais.
- Os bancos IndexedDB (`ces-field-db`, `ces-field-sessao`), o cache dos documentos do veículo e as travas entre abas mantêm o nome
  antigo de propósito (marcador `renomear-geo: manter`); as chaves do `localStorage` migram para `geo_*` na abertura
  (`core/migracao/`).

---

## 📁 4. Estrutura de Diretórios

- `src/app/core/` — serviços (auth, sync/fila, db, sessão/rascunhos, plataforma/tema, turno, campo, frota, sst, almox, fechamento)
- `src/app/ui/` — componentes base do app (`geo-*`): barra de abas/lateral, barra de topo, folha, lista e chips, seletor,
  segmentado, quantidade, leitor de código, assinatura, status de envio, indicador de rede, ícone
- `src/app/features/<area>/` — telas
- `src/styles/` — `geo-tokens.scss` (tokens), `_fonte.scss`, `_reset.scss`, `geo-base.scss` (primitivas globais)
- `e2e/` — Playwright (caracterização, piloto, fase4, sw, a11y, visual; `support/` com o mock da API e geradores de screenshot)

---

## 🔐 5. Segurança

### 5.1 Autenticação e JWT
- O backend emite um **JWT assinado com chave assimétrica** (veja `/docs/iam.md` para o contrato do endpoint `POST /v1/auth/login`).
- **Nunca armazene o token JWT em `localStorage` ou `sessionStorage`** — esses storages são vulneráveis a XSS.
- **Estratégia de armazenamento seguro:**
  - O token de acesso é mantido **em memória** (signal no `TokenService`).
  - Para persistência entre reloads (necessário para PWA offline), use `sessionStorage` **apenas** se o token tiver vida curta, ou implemente um refresh flow.
  - O `TokenService` expõe um `signal<string | null>` para o token atual.
- **Interceptor de autenticação (`auth.interceptor.ts`):** Adiciona o header `Authorization: Bearer <token>` em todas as requisições ao domínio da API.
- **Guard de autenticação (`auth.guard.ts`):** Protege todas as rotas exceto `/login`. Redireciona para `/login` se não autenticado.

### 5.1.1 Sessão em campo (regra que não se quebra)
- **Quem entrou só volta ao login tocando em "Sair".** Token vencido, falta de internet (inclusive 4G bloqueado ou Wi-Fi sem saída, quando `navigator.onLine` mente) e erro do servidor nunca mandam para `/login`: o `authGuard` e a retomada a frio aceitam qualquer sessão local.
- A tela `/login` tem o `loginGuard`: com sessão no aparelho segue para `volta` (ou `/hoje`) e, sem token, tenta o cookie antes. O Android reabre o app instalado na última página carregada, não pelo ícone; sem o guarda, quem tinha entrado pelo login via o formulário em toda reabertura. A abertura pelo ícone (`retomadaGuard`) também tenta o cookie antes de mandar ao login.
- O token de acesso (~1h) é renovado sozinho por `POST /v1/auth/refresh` com o cookie HttpOnly `geo_sessao` (`AuthService.renovarToken`, uma renovação por vez entre abas). O `authInterceptor` renova e repete a requisição; ele fica **depois** do `errorInterceptor` na cadeia.
- `SESSAO_INVALIDA` só marca `reautenticacaoNecessaria`: o app continua, a fila espera e o shell mostra o aviso "Entre novamente para enviar" (`geo-aviso-sessao`). O login só abre se a pessoa tocar em "Entrar".
- A renovação respeita o `ConnectivityService` (não sai pelo 4G bloqueado) e é tentada ao reabrir o app e quando a rede volta.
- Garantias cobertas por `e2e/piloto/sessao-campo.spec.ts` e `e2e/sw/sessao-offline.spec.ts` (modo avião + token vencido com o service worker real).

### 5.2 Dados Sensíveis no IndexedDB
- Dados armazenados offline no IndexedDB **não devem incluir** campos criptografados brutos do backend (ex: CPF em texto claro).
- Armazene apenas os dados necessários para operação offline (IDs, nomes de exibição, estoques, municípios).
- Se um dado sensível for necessário offline, consulte a equipe antes de implementar.

### 5.3 Content Security Policy
- Configure `meta[http-equiv="Content-Security-Policy"]` no `index.html` para restringir fontes de script.
- Nenhum `eval()`, nenhum `innerHTML` com dados externos.

### 5.4 Validação de Entrada
- **Todo formulário** deve ter validação tanto no frontend (Angular Reactive Forms com Validators) quanto a resposta de erro do backend deve ser tratada e exibida (RFC 7807 Problem Details).
- Sanitize inputs antes de exibir em templates (Angular faz isso por padrão, mas tenha atenção com `[innerHTML]`).

---

## 📡 6. Estratégia Offline-First (CRÍTICO)

Esta é a característica mais importante do app. Implemente com rigor.

### 6.1 Fluxo de Inicialização (Login → Cache)
```
1. Usuário faz login (POST /v1/auth/login)
   → Recebe JWT
   → TokenService armazena em memória

2. SyncService.initialSync() é chamado:
   → GET /v1/rh/colaboradores/{meuId}/equipe  (minha equipe)
   → GET /v1/municipios                        (municípios cobertos pela equipe)
   → GET /v1/veiculos (filtrado pela equipe)   (veículos da equipe)
   → GET /v1/processos-negocio                 (catálogo de processos)
   → GET /v1/comercial/acoes                   (catálogo de ações/serviços)
   → GET estoque/materiais disponíveis para a equipe (ver /docs/logistica.md)

3. Todos os dados são persistidos no IndexedDB via Dexie

4. Usuário é redirecionado ao Dashboard
   → App funciona offline a partir daqui
```

### 6.2 Schema IndexedDB (Dexie)
```typescript
// src/app/core/db/app-db.ts
class AppDatabase extends Dexie {
  equipe!: Table<EquipeLocal>;
  colaboradores!: Table<ColaboradorLocal>;
  municipios!: Table<MunicipioLocal>;
  veiculos!: Table<VeiculoLocal>;
  materiais!: Table<MaterialLocal>;
  estoque!: Table<EstoqueLocal>;
  processos!: Table<ProcessoLocal>;
  acoes!: Table<AcaoComercialLocal>;
  
  // Tabelas de operação offline
  solicitacoes!: Table<SolicitacaoLocal>;     ← Solicitações de material
  execucoesCampo!: Table<ExecucaoCampoLocal>; ← Execuções/eventos de campo
  outbox!: Table<OutboxItem>;                 ← Fila de sync pendente
}
```

### 6.3 Outbox Pattern (Operações Pendentes)
Toda operação de escrita (POST/PUT/PATCH/DELETE) que o usuário executar **offline** deve seguir este fluxo:

```
1. Usuário executa ação (ex: criar solicitação de material)
2. Dados são validados localmente (regras básicas no frontend)
3. Operação é gravada localmente no IndexedDB (status: 'PENDENTE')
4. Item é adicionado à tabela `outbox` com:
   - id: UUID gerado localmente (crypto.randomUUID())
   - endpoint: '/v1/solicitacoes'
   - method: 'POST'
   - payload: objeto serializado
   - status: 'PENDENTE' | 'ERRO' | 'SINCRONIZADO'
   - erroDetalhes: string | null  ← erro retornado pela API
   - tentativas: number
   - criadoEm: Date
5. UI mostra o item com badge "⏳ Pendente"
6. Quando conectividade retorna → SyncService processa outbox
7. Se API retorna sucesso → status = 'SINCRONIZADO', remove do outbox
8. Se API retorna erro de negócio (4xx) → status = 'ERRO', erroDetalhes preenchido
   ← ITEM FICA RETIDO, usuário deve corrigir e reenviar
9. Se API retorna erro de servidor (5xx) → retenta automaticamente (máx 3x)
```

### 6.4 ConnectivityService
```typescript
// Detecta mudanças de conectividade
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  readonly isOnline = signal(navigator.onLine);
  // Escuta window eventos 'online' e 'offline'
  // Ao ficar online → notifica SyncService para processar outbox
}
```

### 6.5 OfflineBanner Component
- Exibir banner persistente no topo do content area quando `isOnline() === false`.
- Tom de atenção (`--geo-atencao`, `--geo-atencao-suave`), ícone `sem_rede`, texto "Modo Offline — alterações serão sincronizadas quando a conexão retornar".

### 6.6 Service Worker (ngsw-config.json)
- Cache de assets estáticos: `prefetch` para shell do app.
- Cache de dados da API: estratégia `freshness` para dados que mudam, `performance` para dados estáticos (municípios, processos).
- Background sync via `SyncService` (não depender do SW Sync API por compatibilidade).

---

## 🧩 7. Módulos e Features

### 7.1 Feature: Auth (`/login`)
- Tela limpa, sem bottom nav.
- Logo no topo.
- Campos: **Login** e **Senha** (consultar `/docs/iam.md` para o contrato).
- Ao submeter: chama `AuthService.login()` → armazena token → `initialSync()` → navega para `/hoje`.
- Exibir erro de credenciais inválidas (HTTP 401) de forma clara.
- Enquanto carrega o sync inicial, exibir tela de loading com progresso (ex: "Carregando equipe...", "Carregando municípios...").

### 7.2 Feature: Hoje (`/hoje`; `/dashboard` redireciona)
- Header: "Bom dia, [Nome do Encarregado] 👷" + nome da equipe.
- **Cards de resumo rápido:**
  - Solicitações pendentes (count de itens no outbox com status PENDENTE)
  - Execuções de hoje
  - Membros da equipe ativos
  - Status de sincronização (último sync bem-sucedido)
- **Atalhos rápidos** (grid 2x2 de botões grandes):
  - Nova Solicitação
  - Registrar Execução
  - Ver Equipe
  - Materiais Disponíveis
- **Feed de atividade recente** (últimas execuções/solicitações)
- **Indicador de itens com erro** de sync — card de alerta vermelho com link para a lista de pendências.

### 7.3 Feature: Solicitações (`/solicitacoes`)
Gerenciamento de solicitações de material para a equipe.

**Listagem:**
- Lista paginada de solicitações (local + sync status badge).
- Filtros: status (Pendente/Sincronizado/Erro/Todos), data.
- FAB (+) para nova solicitação.

**Criação (wizard multi-step):**
- Step 1: Selecionar processo/serviço (dados locais do IndexedDB).
- Step 2: Selecionar materiais e quantidades (estoque local).
- Step 3: Informações adicionais (observações, município de atendimento).
- Step 4: Revisão e confirmação.
- Ao confirmar: grava no IndexedDB + enfileira no outbox.

**Detalhe de solicitação com erro:**
- Exibir o erro retornado pela API (campo `erroDetalhes`).
- Permitir **edição e reenvio**.
- Botão "Descartar" para cancelar a solicitação com erro.

**Consultar `/docs/logistica.md`** para os contratos de endpoint de solicitações de material.

### 7.4 Feature: Campo (`/campo`)
Registro de execuções operacionais e eventos de campo.

**Listagem:**
- Execuções do dia atual em destaque.
- Histórico dos últimos 7 dias.
- Status badge de sync em cada item.

**Abertura do turno (`/turno/abrir`):**
- O líder (responsável da equipe) confere o veículo e as pessoas antes de começar e pode trocar a placa e incluir/tirar parceiros. As mudanças vão junto com `POST /api/v1/turnos/abrir` (`idVeiculo`, `idsColaboradores`).
- Composição, opções e meta do ciclo vêm de `GET /api/v1/turnos/minha-equipe/composicao` e ficam salvas no aparelho.

**Lançar execução (etapa única, sem "iniciar/finalizar"):**
- Passo 1: número da nota + localização coletada automaticamente pelo GPS (funciona offline). Não existe município.
- Passo 2: serviços (ações). Passo 3: materiais — "Meu saldo" ou "Outros materiais".
- Material fora do saldo pode ser aplicado: o saldo da equipe apenas fica negativo e o app avisa o encarregado para informar o gestor. Não existe pendência para tratar.
- Retirada: o material retirado em campo vai no veículo (entra como sucata no estoque da equipe) e é devolvido quando a equipe puder.
- No desktop, ao entregar material para a equipe, o almoxarifado vê um aviso nos materiais com saldo negativo nessa equipe (informativo, não trava a entrega).
- Passo 4: conferir e lançar. A execução vai para o outbox e é enviada quando houver conexão.

**Meta do ciclo:** a meta é cadastrada no GEO por janela — ciclo comercial (dia 26 a 25 do mês seguinte, nomeado pelo mês em que termina) para as equipes do processo comercial, ou mês civil para as demais. A composição (`metaDoCiclo`) traz a janela, o valor, a meta diária e o faturamento que o servidor já recebeu. A tela Hoje mostra, além da meta do dia, o cartão do ciclo: realizado (servidor + lançamentos ainda só no aparelho), percentual, quanto falta, quanto fazer por dia útil restante e se a equipe está no ritmo. Passado o fim do ciclo sem sincronizar, o cartão pede sincronização em vez de mostrar números velhos.

**Consultar `/docs/campo.md` ou o endpoint equivalente** na documentação da API.

### 7.5 Feature: Perfil (`/perfil`)
- Dados do encarregado logado (carregados do cache local).
- Nome da equipe e membros (listagem resumida).
- Veículos vinculados.
- **Configurações do app:**
  - Tema (Dark/Light)
  - Forçar sincronização manual (botão "Sincronizar agora")
  - Ver itens pendentes de sync
- **Logout** (limpa token em memória, opcionalmente limpa IndexedDB).

---

## 🔄 8. Serviços Core

### AuthService
```typescript
login(credentials): Observable<void>
logout(): void
readonly currentUser: Signal<UsuarioLogado | null>
readonly isAuthenticated: Signal<boolean>
```

### TokenService
```typescript
readonly token: Signal<string | null>
setToken(token: string): void
clearToken(): void
getDecodedPayload(): JwtPayload | null  ← use biblioteca jwt-decode
```

### SyncService
```typescript
initialSync(): Promise<void>          ← Chamado após login
syncOutbox(): Promise<SyncResult>     ← Processa fila de pendências
forceFullSync(): Promise<void>        ← Botão "Sincronizar agora"
readonly lastSyncAt: Signal<Date | null>
readonly isSyncing: Signal<boolean>
```

### OutboxService
```typescript
enqueue(item: OutboxItem): Promise<void>
getPendingItems(): Promise<OutboxItem[]>
getErrorItems(): Promise<OutboxItem[]>
updateStatus(id: string, status, erroDetalhes?): Promise<void>
retry(id: string): Promise<void>
discard(id: string): Promise<void>
```

### ConnectivityService
```typescript
readonly isOnline: Signal<boolean>
// Ao ficar online: emite evento para SyncService
```

### DbService
Facade sobre o Dexie AppDatabase. Expõe métodos tipados para cada tabela.

---

## ⚠️ 9. Tratamento de Erros

### Erros de Negócio da API (4xx — RFC 7807)
O backend retorna erros no formato Problem Details:
```json
{
  "type": "...",
  "title": "Recurso não encontrado",
  "status": 404,
  "detail": "Colaborador com ID X não existe.",
  "instance": "/v1/rh/colaboradores/X"
}
```
- O `error.interceptor.ts` deve capturar esses erros e transformá-los em objetos tipados `ApiError`.
- Para erros de validação (422), extraia a lista de campos com erro e exiba inline nos formulários.
- Para operações offline (outbox), persista o `detail` como `erroDetalhes` no registro.

### Erros de Conectividade
- Se `HttpClient` lançar `0` status ou `TimeoutError` → o `offline.interceptor.ts` deve interceptar e redirecionar a operação para o `OutboxService` em vez de propagar o erro para o usuário.

### UX de Erro
- Nunca exibir stack traces ou mensagens técnicas ao usuário.
- Mensagens de erro devem ser em português, claras e orientadas à ação ("Quantidade inválida. Informe um valor entre 1 e 999.").
- Erros globais não tratados → toast/snackbar no rodapé da tela.

---

## 📋 10. Convenções de Código

### Nomenclatura
- **Componentes:** `kebab-case` para seletores (`app-bottom-nav`), `PascalCase` para classes.
- **Signals:** sufixo sem `$` (use `isLoading`, não `isLoading$`). Use `$` apenas para Observables RxJS.
- **Interfaces de domínio local:** sufixo `Local` (ex: `ColaboradorLocal`, `MunicipioLocal`).
- **DTOs de API:** sufixo `Dto` (ex: `LoginRequestDto`, `ColaboradorResponseDto`).

### Padrões de Componente
```typescript
@Component({
  selector: 'app-nome',
  standalone: true,
  imports: [...],
  template: `...`,
  changeDetection: ChangeDetectionStrategy.OnPush, // SEMPRE
})
export class NomeComponent {
  // Signals primeiro
  // Injeções via inject()
  // Lifecycle hooks
  // Métodos públicos
  // Métodos privados
}
```

### Injeção de Dependência
- Use `inject()` em vez de injeção por construtor (padrão Angular moderno).

### Roteamento
```typescript
// app.routes.ts
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent) },
  {
    path: '',
    canActivate: [authGuard],
    component: AppShellComponent, // Contém bottom nav + router-outlet
    children: [
      { path: 'dashboard', loadComponent: ... },
      { path: 'solicitacoes', loadChildren: ... },
      { path: 'campo', loadChildren: ... },
      { path: 'perfil', loadComponent: ... },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
```

---

## 🧪 11. Qualidade e Testes

- Unitários: `npm test` (Vitest em Chromium headless; os testes usam IndexedDB, Web Locks e Blob reais). Um arquivo:
  `npx ng test --watch=false --include <caminho>.spec.ts`.
- e2e: `npx playwright test e2e/characterization e2e/piloto e2e/fase4 e2e/sw e2e/a11y --project=android` (build antes: `npm run build`).
- Visual: `npx playwright test e2e/visual` (referências em `e2e/visual/telas.spec.ts-snapshots`).
- Há 9 falhas de e2e conhecidas e anteriores ao redesign (navegação e turno de caracterização desatualizados; rolagem em
  `retomada.spec.ts:72`); não as trate como regressão nova.
- Build de produção: `npm run build`. Verifique o tamanho do bundle ao adicionar dependência.

---

## 🚫 12. O Que NUNCA Fazer

- ❌ Usar `NgModule` — apenas Standalone Components.
- ❌ Armazenar JWT em `localStorage`.
- ❌ Colocar lógica de negócio em componentes — use services.
- ❌ Fazer chamadas HTTP diretamente em componentes — use services.
- ❌ Usar `any` em TypeScript — tipar tudo corretamente.
- ❌ Ignorar erros de sync — todo item com erro deve ser visível e corrigível pelo usuário.
- ❌ Usar `setInterval` para polling — use eventos de conectividade e triggers explícitos.
- ❌ Exibir dados sensíveis em logs do console em produção.
- ❌ Quebrar a estrutura de diretórios definida na Seção 4.
- ❌ Introduzir dependências não listadas na Seção 3 sem justificativa documentada.

---

## 📌 13. Referências Rápidas

| Necessidade | Onde Buscar |
|---|---|
| Contratos de endpoint IAM/Auth | `/docs/` |
| Contratos RH (Colaboradores, Equipes, Veículos) | `/docs/` |
| Contratos Comercial (Contratos, Ações) | `/docs/api-docs-acoes.json` |
| Contratos Logística (Materiais, Estoque, Solicitações) | `/docs/logistica.md` |
| Contratos Campo (Execuções, Eventos) | `/docs/api-docs-execucoes-comerciais.json e /docs/api-docs-turnos.json` |
| Municípios e Bases Operacionais | `/docs/api-docs-bases-operacionais.json` |
| Regras de paginação da API | `PageResponse<T>` — qualquer arquivo `/docs/` |

> **Lembre-se:** Antes de implementar qualquer integração com a API, consulte o arquivo `/docs/` correspondente. Nunca assuma o contrato de um endpoint sem verificar a documentação.