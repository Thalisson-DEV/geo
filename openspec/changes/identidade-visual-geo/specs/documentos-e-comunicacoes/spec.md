## ADDED Requirements

### Requirement: Cabeçalho único de documentos
Relatórios em tela, impressões e PDFs gerados no navegador ou no servidor SHALL usar um único cabeçalho e rodapé: nome e logo da empresa contratante, título, metadados do documento e rodapé "Emitido pelo GEO em <data> às <hora> · <usuário>" com paginação.

#### Scenario: Relatório impresso
- **WHEN** o usuário imprime o relatório de uma obra
- **THEN** o documento sai com o cabeçalho único, o rodapé de emissão e nenhum texto "Logo Cliente", "Sistema C.E.S" ou nome fixo de empresa

### Requirement: Empresa contratante configurável
O administrador SHALL poder cadastrar o nome e o logo da empresa contratante. Documentos, e-mails e mensagens MUST usar esse cadastro e, enquanto ele não existir, MUST mostrar só a marca GEO, sem espaço vazio de logo.

#### Scenario: Sem empresa cadastrada
- **WHEN** nenhuma empresa contratante foi configurada e um PDF é gerado
- **THEN** o cabeçalho mostra só o logo do GEO e o título do documento

#### Scenario: Empresa cadastrada
- **WHEN** o administrador cadastra nome e logo da empresa
- **THEN** os próximos PDFs e e-mails mostram esse nome e esse logo no cabeçalho

### Requirement: E-mails e mensagens com a marca GEO
E-mails transacionais e de automação SHALL usar o modelo visual GEO (logo, cores, tipografia de fallback segura para e-mail, rodapé padrão). Mensagens prontas para WhatsApp MUST terminar com a assinatura da empresa contratante ou, sem cadastro, "GEO".

#### Scenario: Aviso ao posto
- **WHEN** um abastecimento é liberado e a mensagem para o posto é gerada
- **THEN** o texto termina com o nome da empresa contratante, ou "GEO" se ela não estiver cadastrada

### Requirement: Exportações com identidade neutra
Planilhas exportadas SHALL trazer, na primeira linha ou nas propriedades do arquivo, o título, o recorte aplicado e "Gerado pelo GEO em <data>", sem nome do sistema de origem.

#### Scenario: Exportar listagem
- **WHEN** o usuário exporta a listagem de obras filtrada
- **THEN** o arquivo informa os filtros aplicados e "Gerado pelo GEO" com a data
