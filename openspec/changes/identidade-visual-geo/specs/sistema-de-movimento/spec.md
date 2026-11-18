## ADDED Requirements

### Requirement: Tokens de movimento
O Design System SHALL definir tokens de duração (instantâneo, rápido, base, lento) e de curva (saída, entrada, ênfase), e toda transição ou animação da interface MUST usá-los. Saídas MUST ser mais curtas que entradas. Nenhuma animação de interface (exceto indicadores de progresso contínuos) MUST passar de 400 ms.

#### Scenario: Animação fora dos tokens
- **WHEN** o `ds:check` encontra uma `transition` ou `animation` com duração ou curva literal fora dos arquivos de tokens
- **THEN** a verificação falha e aponta o arquivo e a linha

### Requirement: Movimento com função
Cada animação SHALL comunicar origem, mudança de estado ou continuidade (de onde algo veio, o que mudou, para onde foi). Elementos decorativos em loop MUST NOT existir fora de indicadores de carregamento e da Bússola trabalhando.

#### Scenario: Drawer abre da origem
- **WHEN** o usuário abre um formulário lateral
- **THEN** o painel entra deslizando do lado em que fica, com fundo escurecendo junto, e sai mais rápido pelo mesmo lado

#### Scenario: Valor que mudou
- **WHEN** um indicador do painel muda de valor por atualização em tempo real
- **THEN** o novo valor transiciona e recebe um realce breve, sem piscar a tela inteira

### Requirement: Padrões de movimento do GEO
O sistema SHALL ter padrões documentados no catálogo para: navegação entre telas (transição curta de continuidade), entrada de conteúdo após carregamento (sem animar linha por linha em listas longas), abertura e fechamento de drawer, diálogo, menu e popover, feedback de toque em botões (sem ripple), expandir/recolher menu e seções, mudança de valor, reordenação em kanban e estados de sincronização (salvo no dispositivo, enfileirado, sincronizando, sincronizado, conflito).

#### Scenario: Sem ripple
- **WHEN** o usuário clica em qualquer botão
- **THEN** o feedback é a resposta de pressão do GEO e nenhuma onda de ripple aparece

#### Scenario: Lista longa
- **WHEN** uma tabela de 50 linhas termina de carregar
- **THEN** o conteúdo aparece de uma vez com uma transição única, e não linha por linha

#### Scenario: Sincronizando
- **WHEN** um item enfileirado começa a sincronizar
- **THEN** o indicador de sincronização mostra movimento contínuo até o fim e uma confirmação breve ao concluir

### Requirement: Movimento da Bússola
A Bússola SHALL ter movimento próprio: agulha que oscila enquanto ela trabalha, entrada da resposta em blocos à medida que chega e pequena reação ao concluir. Esse movimento MUST parar quando ela termina ou é interrompida.

#### Scenario: Bússola trabalhando
- **WHEN** a Bússola está executando uma consulta
- **THEN** a agulha do avatar oscila e o rótulo da etapa atual aparece ao lado

#### Scenario: Bússola interrompida
- **WHEN** o usuário interrompe a resposta
- **THEN** a agulha para na posição de repouso imediatamente

### Requirement: Reduzir movimento
O GEO SHALL respeitar a preferência "reduzir movimento" do sistema operacional e oferecer a mesma opção nas preferências do usuário. Com ela ativa, deslocamentos, escalas e loops MUST ser substituídos por troca de opacidade curta ou nenhuma animação, sem perder informação de estado.

#### Scenario: Preferência do sistema
- **WHEN** o sistema operacional está com "reduzir movimento" ativo e o usuário abre um drawer
- **THEN** o drawer aparece sem deslizar, só com uma troca de opacidade curta

### Requirement: Desempenho do movimento
Animações SHALL alterar apenas `transform`, `opacity` e propriedades de cor, e MUST manter 60 quadros por segundo nas telas de referência num celular Android intermediário. Nenhuma animação MUST atrasar a interação: o usuário pode clicar ou digitar durante uma transição.

#### Scenario: Interação durante transição
- **WHEN** o usuário clica num item do menu enquanto a tela anterior ainda está saindo
- **THEN** a navegação acontece imediatamente e a transição em andamento é interrompida
