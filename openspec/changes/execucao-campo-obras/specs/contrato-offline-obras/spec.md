## ADDED Requirements

### Requirement: Pacote da equipe
O backend SHALL expor o pacote offline da equipe do usuário (programações do dia e dos próximos 7 dias, obras com endereço e
coordenada, planejamento compacto, kits, modelos de APR e de fotos, versões dos PDFs) com download incremental por `desde`, e MUST
restringir o conteúdo à equipe do usuário autenticado.

#### Scenario: Atualização incremental
- **WHEN** o app pede o pacote informando `desde` da última sincronização
- **THEN** o backend devolve só o que mudou e a lista de programações removidas ou canceladas

#### Scenario: Outra equipe
- **WHEN** o usuário da equipe A tenta obter o pacote da equipe B
- **THEN** o backend responde 403

### Requirement: Comandos idempotentes de campo
APR, conclusão de APR, ocorrência, atividade, apontamento, chegada/saída e evidência SHALL aceitar um id gerado no aparelho; o
reenvio com o mesmo id MUST devolver o resultado já registrado sem duplicar, e o reuso do id com conteúdo diferente MUST ser
recusado.

#### Scenario: Reenvio após timeout
- **WHEN** o app reenvia o apontamento com o mesmo id depois de um timeout
- **THEN** o backend responde com o apontamento existente e não cria outro

### Requirement: Cadeia offline de liberação
O backend SHALL aceitar, na ordem de criação, APR, conclusão e apontamentos que referenciam a APR pelo id do aparelho, avaliando a
liberação pela data/hora de origem do aparelho dentro do dia do turno.

#### Scenario: Dia inteiro sem sinal
- **WHEN** o app envia à noite a APR concluída às 08:10 e o apontamento das 10:30 (do mesmo serviço ou de outro do dia)
- **THEN** o apontamento é aceito como liberado pela APR

### Requirement: Apontamento do ponto inteiro
O backend SHALL registrar, num único comando, o restante programado de todos os itens de um ponto na programação.

#### Scenario: Ponto com três itens
- **WHEN** o app envia "ponto inteiro" para o ponto 4 com três itens programados e um já parcial
- **THEN** são criados os apontamentos do restante de cada item, e o ponto fica concluído na programação

### Requirement: Dados de campo no registro
Todo registro de campo SHALL guardar data/hora do aparelho, data/hora de recebimento no servidor, latitude, longitude e precisão
quando informadas.

#### Scenario: Relógio divergente
- **WHEN** a hora do aparelho difere mais que o limite da hora do servidor
- **THEN** o registro guarda as duas e os relatórios usam a do servidor, marcando a divergência

### Requirement: Envio durável de Obras
O envio durável SHALL aceitar os tipos de operação de Obras e aplicá-los por adaptador no módulo de Obras, com diagnóstico e
reprocessamento no backoffice como os demais tipos.

#### Scenario: Falha na aplicação
- **WHEN** o adaptador recusa um apontamento por item fora da programação
- **THEN** o caso fica no backoffice com diagnóstico, e o app mostra conflito com o mesmo motivo

### Requirement: Cadastros para o campo
A obra SHALL ter endereço ou referência em texto, e a programação com desligamento SHALL ter horário previsto e número da manobra;
a programação de obra sem coordenada nem endereço MUST exibir aviso no web.

#### Scenario: Programar obra sem localização
- **WHEN** o supervisor programa uma obra sem coordenada e sem endereço
- **THEN** o web avisa que a equipe não terá "Como chegar" para essa obra

### Requirement: Perfil da equipe de Obras
O sistema SHALL ter um perfil de equipe de Obras com permissões de turno e execução de Obras, sem acesso a programação, planejamento
ou medição para escrita.

#### Scenario: Encarregado aponta
- **WHEN** o encarregado com o perfil de equipe de Obras envia um apontamento da própria equipe
- **THEN** o backend aceita
