## ADDED Requirements

### Requirement: Turno de Obras no app
O app SHALL permitir ao encarregado abrir e fechar o turno da equipe de Obras offline, usando o mesmo Turno da etapa 1, com
veículo e composição (titular/substituto) pré-preenchidos a partir do último turno.

#### Scenario: Abrir turno sem sinal
- **WHEN** o encarregado confirma a composição sugerida e abre o turno sem conexão
- **THEN** o turno fica salvo no aparelho e é sincronizado ao voltar a conexão com o horário real da abertura

### Requirement: APR guiada
O app SHALL registrar a APR por serviço em passos curtos, pré-preenchida com obra, serviço, data, responsável e participantes do
turno, sugerindo riscos e medidas a partir das condições da programação (linha viva, desligamento) e dos pontos (poda,
aterramento); verificação respondida "Não" MUST impedir a conclusão, e os participantes SHALL assinar na tela do aparelho.

#### Scenario: APR com desligamento
- **WHEN** o encarregado abre a APR de um serviço programado com desligamento
- **THEN** os riscos de choque e arco elétrico e as medidas de desenergização, bloqueio e aterramento já vêm marcados para conferir

#### Scenario: Verificação negativa
- **WHEN** a verificação "Área sinalizada" está como "Não"
- **THEN** o app não conclui a APR e mostra o que falta

### Requirement: Sem condição de executar
O app SHALL registrar, num atalho, que não há condição de executar o serviço, com tipo, motivo e foto opcional, dispensando a APR e
bloqueando apontamentos do serviço até uma APR concluída depois.

#### Scenario: Chuva forte
- **WHEN** o encarregado registra "Sem condição de executar" por clima na obra 1234
- **THEN** a ocorrência impeditiva é salva e o Hoje passa para o próximo serviço do dia

### Requirement: Ocorrências no app
O app SHALL registrar ocorrências tipadas (segurança, clima, material, equipamento, acesso, desligamento, terceiros, outros) com
fotos e ditado por voz na descrição quando o aparelho permitir.

#### Scenario: Ocorrência de acesso
- **WHEN** o encarregado registra ocorrência de acesso com duas fotos sem sinal
- **THEN** a ocorrência e as fotos ficam no aparelho e são enviadas juntas ao voltar a conexão

### Requirement: Relatório diário montado
Ao fechar o turno, o app SHALL apresentar o relatório diário pré-preenchido com obras atendidas, pontos feitos, ocorrências, fotos
pendentes e envios pendentes, para o encarregado revisar e completar.

#### Scenario: Fechar com pendência de foto
- **WHEN** o encarregado fecha o turno com duas fotos exigidas faltando
- **THEN** o relatório lista as pendências e permite fechar, mantendo-as visíveis para a equipe e para o web

### Requirement: Obra não programada
O app SHALL registrar atividade em obra não programada buscando a obra pelo número entre as obras disponíveis e informando o motivo.

#### Scenario: Atividade fora da agenda
- **WHEN** a equipe atua na obra 1277970 sem programação
- **THEN** a atividade é registrada como obra não programada no turno

### Requirement: Material previsto, sem pedido no app
O app SHALL mostrar, para cada serviço do dia, o material previsto pela programação dos pontos (ou pela solicitação manual
feita no web) e o que falta no estoque da equipe; o app MUST NOT oferecer pedido de material à equipe de campo.

#### Scenario: Falta material no caminhão
- **WHEN** a programação do dia prevê 4 cruzetas e o caminhão tem 2
- **THEN** a ficha da obra mostra "faltam 2 cruzetas" e a equipe pode registrar ocorrência de material, sem pedir pelo app

### Requirement: As Built e equipamentos no campo
O app SHALL preencher a ficha As Built do ponto a partir do que foi marcado como feito e registrar equipamentos com leitura de série
ou QR pela câmera.

#### Scenario: Religador instalado
- **WHEN** o encarregado lê o QR do religador instalado no ponto 7
- **THEN** a série entra no equipamento do ponto e a ficha As Built mostra o item
