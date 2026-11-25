## ADDED Requirements

### Requirement: Vínculo opcional do kit com a estrutura
O kit construtivo SHALL poder apontar para uma estrutura do catálogo, e para no máximo uma. O vínculo MUST ser opcional: um kit sem vínculo continua funcionando como hoje no planejamento, na programação, na execução e na medição. A estrutura escolhida MUST ser compatível com as classes de tensão do kit; quando o kit não tem classe de tensão, qualquer estrutura vale.

#### Scenario: Ligar o kit
- **WHEN** o administrador liga o kit `N1` do contrato à estrutura N1 da norma de 13,8 kV
- **THEN** o kit passa a mostrar a estrutura, com o desenho em miniatura e a conformidade

#### Scenario: Tensão incompatível
- **WHEN** o kit é de 15 kV e alguém tenta ligá-lo à N1 da norma de 23,1/34,5 kV
- **THEN** o sistema recusa com "A estrutura N1 desta norma não atende 15 kV."

#### Scenario: Kit sem vínculo
- **WHEN** o kit `LANC-CABO` não tem estrutura
- **THEN** ele é aplicado, programado e medido como antes, e só mostra "Sem estrutura do catálogo" no cadastro

### Requirement: Sugestão automática do vínculo
O sistema SHALL sugerir a estrutura de cada kit sem vínculo pelo código do kit, depois de normalizado: sem caixa, espaços, hífens e pontos, sem o sufixo de poste ou de variação (`N1-11/300` → `N1`, `B3.B3` → `B3B3`) e considerando os apelidos. A sugestão só vale entre estruturas vigentes e compatíveis com a tensão do kit. Uma ação em lote SHALL mostrar todas as sugestões para aceitar ou recusar uma a uma ou todas de uma vez. O sistema MUST NOT ligar sem confirmação.

#### Scenario: Sugestões em lote
- **WHEN** o contrato tem 80 kits sem vínculo e o administrador abre "Sugerir estruturas"
- **THEN** o sistema mostra, por kit, a estrutura sugerida e o motivo ("código igual", "apelido", "código sem sufixo"), com os kits sem sugestão no fim

#### Scenario: Duas estruturas possíveis
- **WHEN** o kit `N1` não tem classe de tensão e há uma N1 em cada norma vigente
- **THEN** a sugestão mostra as duas opções e não escolhe sozinha

### Requirement: Comparação dos materiais do kit com a norma
Para cada kit ligado, o sistema SHALL comparar os itens de material do kit (só os de operação INSTALAR) com a lista de materiais da estrutura e classificar cada material:
- CONFERE: mesmo código e mesma quantidade;
- QUANTIDADE_DIFERENTE: mesmo código, outra quantidade, mostrando kit × norma;
- FALTA_NO_KIT: está na norma e não está no kit;
- SOBRA_NO_KIT: está no kit e não está na norma;
- DEPENDE_DO_POSTE: a linha da norma depende de tabela ou da fixação;
- SEM_CADASTRO: o código da norma não tem material no estoque.

A comparação usa o código do material do estoque igual ao código da norma. Itens de serviço MUST NOT entrar nessa comparação. Quando o kit traz um poste no próprio código ou num item de poste, a fixação desse poste MUST entrar na comparação; sem poste conhecido, a fixação fica como DEPENDE_DO_POSTE.

#### Scenario: Kit confere com a norma
- **WHEN** o kit `N1` tem exatamente os materiais e as quantidades fixas da N1
- **THEN** a conformidade fica "Confere com a norma" e o detalhe lista tudo como CONFERE, com a fixação como DEPENDE_DO_POSTE

#### Scenario: Faltando isolador
- **WHEN** o kit `N4` tem 3 isoladores de ancoragem e a norma pede 6
- **THEN** o detalhe mostra "Isolador ancoragem polimérico 15 kV · kit 3 · norma 6" como QUANTIDADE_DIFERENTE e o resumo mostra "1 divergência"

#### Scenario: Material a mais
- **WHEN** o kit `U1` tem um conector perfurante que a norma da U1 não lista
- **THEN** o material aparece como SOBRA_NO_KIT, sem impedir o uso do kit

#### Scenario: Kit com poste no código
- **WHEN** o kit `N3-11/600` está ligado à N3
- **THEN** a comparação inclui os parafusos da fixação de 11 m/600 daN e os confere com o kit

### Requirement: Conformidade só avisa
A conformidade SHALL ser informativa: nenhuma divergência MUST impedir salvar o kit, aplicá-lo no planejamento, programar, executar ou medir. O sistema SHALL guardar o resultado da conformidade no kit (situação, número de divergências, data do cálculo e revisão da norma usada), para filtrar e ordenar sem recalcular a cada consulta.

#### Scenario: Aplicar kit divergente
- **WHEN** o planejador aplica num ponto o kit `N4`, que tem 2 divergências
- **THEN** o kit é aplicado normalmente e o ponto mostra o aviso "Kit N4 com 2 divergências da norma", com o link para o detalhe

### Requirement: Recalcular a conformidade
A conformidade SHALL ser recalculada quando muda um item de material do kit, quando muda o vínculo, quando muda a lista de materiais ou a fixação da estrutura ligada, quando uma revisão nova da norma é publicada e quando o material passa a ter, ou deixa de ter, cadastro no estoque. O recálculo de muitos kits MUST rodar em segundo plano.

#### Scenario: Norma corrigida
- **WHEN** o administrador corrige a quantidade de arruelas da N4 no catálogo
- **THEN** os kits ligados à N4 são recalculados e o kit `N4` deixa de mostrar a divergência das arruelas

### Requirement: Conformidade visível no cadastro de kits e no planejamento
A lista de kits SHALL ter a coluna e o filtro "Norma": Confere, Com divergências, Sem estrutura, Estrutura fora da norma vigente. O detalhe do kit SHALL mostrar a comparação item a item, com a ação "Ajustar o kit à norma", que propõe as mudanças (incluir o que falta, corrigir as quantidades, retirar a sobra) para a pessoa revisar e confirmar uma a uma. No planejamento, o ponto SHALL mostrar o aviso discreto dos kits com divergência.

#### Scenario: Ajustar à norma
- **WHEN** o administrador usa "Ajustar o kit à norma" no kit `N4`, que tem uma QUANTIDADE_DIFERENTE e uma FALTA_NO_KIT
- **THEN** o sistema propõe mudar o isolador de 3 para 6 e incluir o material que falta. Só o que a pessoa confirmar é gravado, e os itens de material sem cadastro no estoque ficam de fora com o aviso "cadastre o material antes"

#### Scenario: Filtrar kits divergentes
- **WHEN** o administrador filtra "Com divergências" na lista de kits
- **THEN** a lista mostra só os kits ligados com pelo menos uma divergência, ordenados pelo número de divergências

### Requirement: Kit aplicado guarda a revisão
Ao aplicar um kit ligado num ponto, o kit aplicado SHALL guardar a estrutura e a revisão da norma do momento da aplicação, como já guarda o código e a descrição do kit, para que o guia no app abra a estrutura certa mesmo depois de uma revisão nova da norma.

#### Scenario: Revisão nova depois da aplicação
- **WHEN** o kit N1 foi aplicado com a revisão 03 e depois a revisão 04 foi publicada
- **THEN** no app, "Ver estrutura" abre a N1 da revisão vigente e mostra "O planejamento usou a revisão 03", com o acesso à revisão 03
