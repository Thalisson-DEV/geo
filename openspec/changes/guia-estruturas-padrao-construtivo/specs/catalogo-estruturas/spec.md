## ADDED Requirements

### Requirement: Norma técnica com revisões
O sistema SHALL manter cada norma técnica com o emissor (cadastro da configuração do padrão construtivo), código, título, revisão, data de homologação, classes de tensão atendidas, o PDF original e uma situação (RASCUNHO, VIGENTE, SUBSTITUIDA). Para o mesmo emissor e código de norma, MUST existir no máximo uma revisão VIGENTE. Publicar uma revisão nova SHALL marcar a anterior como SUBSTITUIDA sem apagá-la.

#### Scenario: Publicar revisão nova
- **WHEN** a norma de MT 13,8 kV + BT está vigente na revisão 03 e a revisão 04 é publicada
- **THEN** a revisão 04 fica VIGENTE, a 03 fica SUBSTITUIDA e continua aberta para consulta, com o aviso "Revisão substituída pela 04"

#### Scenario: Duas revisões vigentes
- **WHEN** alguém tenta deixar vigentes ao mesmo tempo duas revisões do mesmo código de norma
- **THEN** o sistema recusa com o erro "Já existe uma revisão vigente desta norma." e nada muda

#### Scenario: Norma sem PDF
- **WHEN** uma norma é cadastrada à mão, sem o arquivo
- **THEN** o cadastro é aceito, mas a norma não pode ser publicada como VIGENTE até receber o PDF ou a confirmação explícita "sem documento-fonte"

### Requirement: Estrutura padrão
Cada estrutura SHALL pertencer a uma revisão de norma e ter código, nome, família, função, classes de tensão, número de fases, a página e a referência do desenho na norma ("Desenho 70") e uma situação ativa ou desativada. O código MUST ser único dentro da revisão, comparado sem diferença de caixa, espaço ou hífen (`N3-N3` = `n3 n3`). Como cada emissor tem sua nomenclatura, o sistema MUST NOT presumir significado fixo para as letras do código; a família e a função vêm do cadastro. Uma estrutura SHALL poder ter códigos alternativos (apelidos) usados na busca e no casamento com os kits.

#### Scenario: Código repetido na revisão
- **WHEN** a revisão 04 já tem a estrutura `B3-B3` e alguém cadastra `b3 b3`
- **THEN** o sistema recusa com o erro "A estrutura B3-B3 já existe nesta revisão."

#### Scenario: Mesma estrutura em normas diferentes
- **WHEN** a norma de 13,8 kV e a de 23,1/34,5 kV têm, cada uma, a estrutura `N1`
- **THEN** as duas convivem, cada uma com seus materiais, e a busca mostra as duas com a norma e a tensão ao lado

#### Scenario: Busca por apelido
- **WHEN** a estrutura `S1I-S3I TAN` tem o apelido `SI1-S3I` e a busca é por `si1-s3i`
- **THEN** a estrutura aparece no resultado

### Requirement: Família e função configuráveis
A família e a função da estrutura SHALL vir de listas configuráveis (cadastro com sementes) e não de valores fixos no código. As sementes MUST incluir:
- famílias: monofásica, monofásica sem cruzeta, bifásica sem cruzeta, beco bifásica, trifásica normal, trifásica beco, trifásica T, trifásica sem cruzeta, baixa tensão multiplexada, estaiamento, chaves e equipamentos, aterramento;
- funções: passagem/tangente, ângulo, ancoragem, fim de linha, derivação, seccionamento, transição, equipamento.

#### Scenario: Família nova
- **WHEN** o administrador cria a família "Rede compacta"
- **THEN** ela passa a valer nos filtros do guia e no cadastro de estruturas, sem nenhuma mudança de código

### Requirement: Lista de materiais da estrutura
A estrutura SHALL ter uma lista de materiais, em que cada linha traz o item do desenho (A-02, I-05, F-36…), o código do material na norma, a descrição, a quantidade e a unidade. Uma linha MUST poder ser "dependente de tabela" (o código varia conforme o poste, o cabo ou o laço), com a referência da tabela da norma ("Tabela 30") no lugar do código. A quantidade MUST ser positiva. Quando o código, normalizado pelas regras de código da configuração, casa com um material cadastrado no estoque, a linha SHALL mostrar esse material.

#### Scenario: Linha comum
- **WHEN** a estrutura N1 traz "I-05 · 123140003 · Isolador pilar 15 kV · 3"
- **THEN** o detalhe da estrutura mostra a linha com o material do estoque de mesmo código, quando ele existe

#### Scenario: Linha dependente de tabela
- **WHEN** a linha do poste traz "P-02 · Tabela 30 · Poste de concreto seção DT · 1"
- **THEN** a linha aparece como "conforme o poste do ponto (Tabela 30)" e não conta como material sem cadastro

#### Scenario: Código sem material no estoque
- **WHEN** o código 134280005 não existe no cadastro de materiais
- **THEN** a linha mostra o aviso "Sem cadastro no estoque" e o cadastro da estrutura continua válido

### Requirement: Fixação conforme o poste
A estrutura SHALL ter uma tabela de fixação: para cada combinação de comprimento (m) e resistência nominal (daN) do poste, a quantidade de cada parafuso ou ferragem. Combinações sem quantidade MUST ser tratadas como "não se aplica", diferente de zero. O sistema SHALL calcular a lista completa de materiais da estrutura para um poste informado, somando a lista fixa e a fixação daquele poste.

#### Scenario: Poste 11 m / 300 daN na N1
- **WHEN** a fixação da N1 diz 2 parafusos de cabeça quadrada de 250 mm para o poste 11 m/300 daN e alguém pede a lista para esse poste
- **THEN** a lista calculada traz os materiais fixos da N1 mais 2 parafusos de 250 mm

#### Scenario: Poste fora da tabela
- **WHEN** a lista é pedida para um poste 9 m/150 daN numa estrutura cuja fixação só cobre postes de 11 e 12/13 m
- **THEN** o sistema devolve os materiais fixos e o aviso "A norma não traz fixação para poste 9 m/150 daN nesta estrutura", sem inventar a quantidade

### Requirement: Mídias da estrutura
A estrutura SHALL aceitar mídias de três tipos (DESENHO, FOTO_REFERENCIA, DETALHE), cada uma com legenda, ordem, origem (norma, cartilha, upload) e, para fotos, a classificação CORRETO ou ERRO_COMUM. O arquivo MUST ser guardado no armazenamento de objetos com miniatura e tamanho máximo de 15 MB (PNG, JPEG ou WebP). Uma estrutura SHALL ter no máximo um desenho principal.

#### Scenario: Foto de erro comum
- **WHEN** o administrador envia a foto de uma N1 sem coxim e a marca como ERRO_COMUM com a legenda "Sem coxim elastomérico: reprova a obra"
- **THEN** o guia mostra a foto numa faixa "Erros comuns", separada das fotos corretas

#### Scenario: Arquivo grande demais
- **WHEN** alguém envia uma imagem de 22 MB
- **THEN** o sistema recusa com "A imagem deve ter até 15 MB." e nada é guardado

### Requirement: Recomendações de montagem
A estrutura SHALL ter recomendações de montagem em texto curto, ordenadas, cada uma com uma gravidade (INFORMATIVA, ATENCAO, REPROVA_OBRA) e uma origem (norma com a seção, cartilha ou cadastro). Recomendações gerais SHALL poder valer para uma família inteira ou para todas as estruturas de uma norma (por exemplo "todas as amarrações de BT e MT com alças ou laços pré-formados").

#### Scenario: Recomendação que reprova
- **WHEN** a N1 tem a recomendação "Aplicar coxim elastomérico" com gravidade REPROVA_OBRA
- **THEN** o guia mostra essa recomendação no topo, com destaque de erro, antes das demais

#### Scenario: Recomendação da família
- **WHEN** a recomendação "Todo transformador protegido com para-raios de BT" vale para a família "chaves e equipamentos"
- **THEN** ela aparece em todas as estruturas da família, marcada como "da família"

### Requirement: Edição de norma vigente
Editar materiais, fixação ou recomendações de uma estrutura de revisão VIGENTE SHALL ficar registrado na auditoria com o valor anterior e o novo, e MUST exigir uma justificativa. Revisões SUBSTITUIDAS MUST ser somente leitura.

#### Scenario: Corrigir quantidade vigente
- **WHEN** o administrador muda a quantidade de arruelas da N4 de 12 para 10 na revisão vigente, com a justificativa "Erro de leitura do quadro 54"
- **THEN** a mudança é gravada, a auditoria mostra 12 → 10 com a justificativa e os kits ligados à N4 recalculam a conformidade

#### Scenario: Revisão substituída
- **WHEN** alguém tenta editar uma estrutura da revisão 03, que já foi substituída
- **THEN** o sistema recusa com "Esta revisão foi substituída e é somente leitura."

### Requirement: Desativação sem perder histórico
Estruturas e normas SHALL ser desativadas por soft delete, nunca apagadas. Uma estrutura desativada MUST sumir da busca do guia e das sugestões de vínculo, mas continuar visível nos kits e nas obras que já a usam, com a marca "desativada".

#### Scenario: Estrutura desativada com kit ligado
- **WHEN** a estrutura `P1A-PR` é desativada e o kit `P1A-PR` continua ligado a ela
- **THEN** o kit mostra "Estrutura desativada no catálogo" e não aparece mais como sugestão para kits novos

### Requirement: Permissões do catálogo
A consulta do guia SHALL exigir `obras:estrutura:read`. Cadastrar e editar SHALL exigir `obras:estrutura:write`. Importar e publicar revisões SHALL exigir `obras:estrutura:import`. O encarregado do app de campo MUST receber `obras:estrutura:read` no perfil semeado de campo.

#### Scenario: Sem permissão de escrita
- **WHEN** um usuário só com `obras:estrutura:read` tenta salvar uma estrutura
- **THEN** a API responde 403 em Problem Details e o web não mostra os botões de edição
