## ADDED Requirements

### Requirement: Guia de voz do GEO
O Design System SHALL publicar um guia de voz com: tratamento por "você", verbos diretos nos botões ("Salvar obra", não "Confirmar"), frases curtas, termos do domínio consistentes, e mensagens de erro que dizem o que aconteceu e o que fazer. A Bússola MUST falar no feminino e com o tom definido no guia.

#### Scenario: Botão de ação
- **WHEN** um formulário de nova obra é revisado
- **THEN** o botão principal diz "Salvar obra" e o secundário "Cancelar"

### Requirement: Mensagens de erro acionáveis
Toda mensagem de erro exibida ao usuário SHALL dizer o que aconteceu e o próximo passo, e MUST NOT expor códigos HTTP, nomes de tabela ou rotas internas.

#### Scenario: Falha ao salvar sem conexão
- **WHEN** o usuário salva um lançamento sem conexão
- **THEN** a mensagem diz "Salvo no aparelho. Vamos enviar assim que a conexão voltar." e não fala em erro

### Requirement: Textos sem marca de origem
Nenhum texto visível SHALL conter o nome do sistema de origem, de cliente, de concessionária específica ou de parceiro. Termos genéricos do domínio (por exemplo, "distribuidora") MUST ser usados quando o contexto exigir.

#### Scenario: Varredura de textos
- **WHEN** a verificação de textos roda sobre templates e mensagens
- **THEN** não encontra os termos bloqueados da lista de marcas proibidas
