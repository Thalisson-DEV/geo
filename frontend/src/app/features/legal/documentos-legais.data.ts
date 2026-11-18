/**
 * Textos da Política de Privacidade e dos Termos de Uso do GEO.
 *
 * Os trechos entre colchetes, como [RAZÃO SOCIAL DO FORNECEDOR], são dados que o fornecedor
 * ainda precisa preencher; a tela os destaca para que nenhum fique esquecido. Produto white
 * label: nenhum nome de empresa entra aqui além dos marcadores.
 *
 * Ao mudar o conteúdo, atualize `versao` e `vigencia` do documento.
 */

export type DocumentoLegalId = 'privacidade' | 'termos';

export interface SecaoLegal {
  id: string;
  titulo: string;
  paragrafos?: string[];
  itens?: string[];
  /** Parágrafos depois da lista. */
  fechamento?: string[];
}

export interface DocumentoLegal {
  id: DocumentoLegalId;
  titulo: string;
  resumo: string;
  versao: string;
  vigencia: string;
  secoes: SecaoLegal[];
}

const FORNECEDOR = '[RAZÃO SOCIAL DO FORNECEDOR], inscrita no CNPJ sob o nº [CNPJ], com sede em [ENDEREÇO]';

export const POLITICA_PRIVACIDADE: DocumentoLegal = {
  id: 'privacidade',
  titulo: 'Política de Privacidade',
  resumo:
    'Como o GEO trata os dados pessoais das empresas contratantes, dos seus usuários e dos colaboradores cadastrados, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).',
  versao: '1.0',
  vigencia: '[DATA DE VIGÊNCIA]',
  secoes: [
    {
      id: 'quem-somos',
      titulo: 'Quem somos e qual é o nosso papel',
      paragrafos: [
        `O GEO (Gestão de Equipes e Operações) é um software oferecido como serviço por ${FORNECEDOR} ("Fornecedor").`,
        'A empresa que contrata o GEO ("Contratante") decide quais dados inserir no sistema e para quê. Por isso, em relação a esses dados, a Contratante é a controladora e o Fornecedor atua como operador, tratando os dados somente conforme as instruções da Contratante e este documento (art. 5º, VI e VII, da LGPD).',
        'O Fornecedor é controlador apenas dos dados necessários para a relação comercial com a Contratante, como os contatos dos responsáveis pelo contrato e pelo faturamento.'
      ]
    },
    {
      id: 'dados',
      titulo: 'Quais dados tratamos',
      paragrafos: ['Conforme os módulos contratados e o uso feito pela Contratante, o GEO pode tratar:'],
      itens: [
        'Dados de usuários: nome, login, e-mail, perfil de acesso, preferências e registros de acesso (data, hora e endereço IP).',
        'Dados de colaboradores cadastrados pela Contratante: nome, CPF, função, equipe, base operacional, dados da CNH e informações de descontos em folha.',
        'Dados de segurança do trabalho: inspeções, desvios e eventos de segurança, que podem incluir informações sobre lesões. Esses são dados pessoais sensíveis (art. 5º, II) e recebem acesso ainda mais restrito.',
        'Registros operacionais: obras, programações, apontamentos, movimentações de material, veículos, abastecimentos e manutenções.',
        'Fotos e documentos anexados, como book de obra, evidências de inspeção e checklists de veículos.',
        'Localização de veículos e de aparelhos de campo, quando a Contratante habilita a telemetria.',
        'Conversas com a Bússola, a assistente de inteligência artificial do GEO, e os arquivos anexados a elas.',
        'Dados de fornecedores da Contratante, incluindo dados bancários para pagamento.'
      ]
    },
    {
      id: 'finalidades',
      titulo: 'Para que usamos os dados',
      itens: [
        'Prestar o serviço contratado: operar o GEO, guardar os registros e gerar relatórios e painéis.',
        'Controlar o acesso de cada usuário conforme o perfil definido pela Contratante.',
        'Manter a segurança do sistema, investigar incidentes e prevenir fraudes e acessos indevidos.',
        'Prestar suporte pelo módulo de Chamados e melhorar o funcionamento do sistema.',
        'Cumprir obrigações legais e regulatórias, como a guarda dos registros de acesso exigida pelo Marco Civil da Internet (Lei nº 12.965/2014).'
      ],
      fechamento: [
        'Cabe à Contratante, como controladora, definir a base legal de cada tratamento que realiza no GEO, como a execução de contrato de trabalho, o cumprimento de obrigação legal (inclusive as normas de saúde e segurança do trabalho) e o legítimo interesse.',
        'O Fornecedor não vende dados pessoais nem os usa para publicidade.'
      ]
    },
    {
      id: 'ia',
      titulo: 'Inteligência artificial (Bússola)',
      paragrafos: [
        'A Bússola responde a perguntas, analisa painéis e lê documentos usando somente os dados que o usuário já tem permissão para ver. Ela só grava ou altera um registro depois que o usuário confirma.',
        'Para gerar as respostas, o conteúdo da conversa e os dados consultados são enviados a [PROVEDOR DE IA], contratado pelo Fornecedor como suboperador, sob obrigação contratual de confidencialidade e de não usar esses dados para treinar modelos.',
        'As respostas da Bússola podem conter imprecisões. Decisões importantes devem ser conferidas nos módulos de origem.'
      ]
    },
    {
      id: 'compartilhamento',
      titulo: 'Com quem compartilhamos',
      paragrafos: [
        'Os dados são compartilhados apenas com prestadores de serviço necessários ao funcionamento do GEO (suboperadores), sob contrato e com as mesmas obrigações de proteção:'
      ],
      itens: [
        'Hospedagem, banco de dados e armazenamento de arquivos: [PROVEDOR DE HOSPEDAGEM].',
        'Processamento da Bússola: [PROVEDOR DE IA].',
        'Envio de e-mails e notificações: [PROVEDOR DE E-MAIL].',
        'Telemetria de veículos, quando contratada pela Contratante: o provedor de rastreamento indicado por ela.'
      ],
      fechamento: [
        'Dados também podem ser fornecidos a autoridades públicas quando houver obrigação legal ou ordem judicial.',
        'Quando um suboperador mantém servidores fora do Brasil, a transferência internacional segue o art. 33 da LGPD, com cláusulas contratuais que garantem nível de proteção adequado.'
      ]
    },
    {
      id: 'seguranca',
      titulo: 'Como protegemos os dados',
      itens: [
        'Comunicação criptografada (HTTPS) entre o aplicativo e o servidor.',
        'CPF, dados bancários e outros campos sensíveis cifrados no banco de dados com AES-256.',
        'Senhas guardadas apenas como hash, nunca em texto.',
        'Sessão renovada por cookie seguro, inacessível a scripts da página, e limite de tentativas de login.',
        'Acesso por perfil: cada usuário vê e faz só o que o perfil definido pela Contratante permite.',
        'Histórico das alterações relevantes, com autor, data e motivo, e registro das ações feitas pela Bússola.',
        'Cuidado para não expor dados pessoais nos endereços de página, onde ficariam nos históricos de navegação.'
      ],
      fechamento: [
        'Nenhuma medida elimina todos os riscos. Se ocorrer um incidente de segurança que possa causar risco ou dano relevante aos titulares, o Fornecedor avisará a Contratante em até [PRAZO, ex.: 48 horas] e a apoiará na comunicação à ANPD e aos titulares (art. 48).'
      ]
    },
    {
      id: 'retencao',
      titulo: 'Por quanto tempo guardamos',
      itens: [
        'Dados inseridos pela Contratante: enquanto durar o contrato.',
        'Registros de acesso: no mínimo 6 meses, como exige o Marco Civil da Internet.',
        'Posições de telemetria: apagadas automaticamente após o prazo de retenção configurado (padrão de 180 dias).',
        'Ao fim do contrato: a Contratante pode exportar seus dados em até [PRAZO, ex.: 30 dias]; depois disso, eles são eliminados em até [PRAZO, ex.: 90 dias], salvo o que a lei obrigar a manter.'
      ]
    },
    {
      id: 'direitos',
      titulo: 'Direitos dos titulares',
      paragrafos: [
        'O titular pode pedir confirmação do tratamento, acesso, correção, anonimização, bloqueio ou eliminação de dados desnecessários, portabilidade, informações sobre compartilhamento e a revisão de decisões automatizadas, entre outros direitos do art. 18 da LGPD.',
        'Como a Contratante é a controladora dos dados inseridos no GEO, colaboradores e usuários devem fazer esses pedidos primeiro à própria empresa. O Fornecedor apoia a Contratante no atendimento, nos prazos da lei.',
        'Pedidos sobre os dados de que o Fornecedor é controlador podem ser feitos diretamente ao encarregado, no contato abaixo.'
      ]
    },
    {
      id: 'cookies',
      titulo: 'Cookies e armazenamento no aparelho',
      paragrafos: [
        'O GEO usa apenas o necessário para funcionar: um cookie de sessão, para manter o login, e o armazenamento local do navegador, para guardar preferências e permitir o uso sem internet, com os registros feitos offline aguardando a sincronização.',
        'O GEO não usa cookies de publicidade nem de rastreamento de terceiros. Ao sair do sistema, a sessão é encerrada; os dados guardados no aparelho podem ser removidos limpando os dados do navegador.'
      ]
    },
    {
      id: 'encarregado',
      titulo: 'Encarregado de dados (DPO)',
      paragrafos: [
        'Encarregado do Fornecedor: [NOME DO ENCARREGADO].',
        'Contato: [E-MAIL DO ENCARREGADO].',
        'Dúvidas sobre esta política também podem ser abertas pelo módulo de Chamados do GEO.'
      ]
    },
    {
      id: 'alteracoes',
      titulo: 'Alterações desta política',
      paragrafos: [
        'Esta política pode ser atualizada para refletir mudanças no GEO ou na legislação. A versão e a data de vigência ficam no topo desta página. Mudanças relevantes serão avisadas às Contratantes com antecedência.'
      ]
    }
  ]
};

export const TERMOS_USO: DocumentoLegal = {
  id: 'termos',
  titulo: 'Termos de Uso',
  resumo:
    'As regras para usar o GEO. Valem para a empresa contratante e para todos os usuários que ela cadastrar.',
  versao: '1.0',
  vigencia: '[DATA DE VIGÊNCIA]',
  secoes: [
    {
      id: 'aceitacao',
      titulo: 'Aceitação',
      paragrafos: [
        `Estes Termos regulam o uso do GEO, software oferecido por ${FORNECEDOR} ("Fornecedor"). Ao acessar o GEO, o usuário declara que leu e concorda com estes Termos e com a Política de Privacidade.`,
        'O contrato comercial firmado entre o Fornecedor e a empresa contratante ("Contratante") prevalece sobre estes Termos no que for diferente.'
      ]
    },
    {
      id: 'servico',
      titulo: 'O serviço',
      paragrafos: [
        'O GEO é um sistema de gestão de operações de campo oferecido pela internet (software como serviço). Os módulos disponíveis para cada Contratante são os previstos no contrato.',
        'A Contratante recebe uma licença de uso não exclusiva, intransferível e válida enquanto o contrato estiver em vigor. O GEO não é vendido nem transferido: o software, o código-fonte, a marca e a documentação continuam sendo do Fornecedor.'
      ]
    },
    {
      id: 'contas',
      titulo: 'Contas e acesso',
      itens: [
        'Os usuários são cadastrados pela Contratante, que define o perfil de acesso de cada um e responde pelo uso feito pelos seus usuários.',
        'Login e senha são pessoais e intransferíveis. O usuário deve guardá-los em sigilo e avisar a Contratante se suspeitar de uso indevido.',
        'A Contratante deve desativar o acesso de quem deixar de trabalhar com ela.'
      ]
    },
    {
      id: 'uso',
      titulo: 'Uso permitido',
      paragrafos: ['É proibido:'],
      itens: [
        'Tentar acessar dados, telas ou funções fora do próprio perfil.',
        'Copiar, modificar, descompilar ou tentar obter o código-fonte do GEO.',
        'Revender, sublicenciar ou disponibilizar o GEO a terceiros sem autorização.',
        'Inserir conteúdo ilícito, falso ou que viole direitos de terceiros.',
        'Sobrecarregar o sistema de forma intencional, por exemplo com acessos automatizados não autorizados.'
      ],
      fechamento: ['O descumprimento pode levar à suspensão do acesso do usuário.']
    },
    {
      id: 'dados',
      titulo: 'Dados da Contratante',
      paragrafos: [
        'Os dados inseridos no GEO pertencem à Contratante. Ela é responsável por sua exatidão e por ter base legal para tratar os dados pessoais que cadastra.',
        'O Fornecedor trata esses dados apenas para prestar o serviço, conforme a Política de Privacidade, e permite que a Contratante os exporte ao fim do contrato.'
      ]
    },
    {
      id: 'ia',
      titulo: 'Bússola, a assistente de IA',
      itens: [
        'A Bússola usa apenas os dados que o usuário pode ver e só grava ou altera registros depois da confirmação do usuário.',
        'As respostas são geradas por inteligência artificial e podem conter erros. O usuário deve conferir as informações antes de tomar decisões e responde pelas ações que confirmar.'
      ]
    },
    {
      id: 'offline',
      titulo: 'Uso sem internet',
      paragrafos: [
        'Parte das funções funciona sem conexão: o registro fica salvo no aparelho e é enviado ao servidor quando a conexão volta. Até a sincronização, o registro existe apenas no aparelho. O usuário não deve sair do sistema nem limpar os dados do navegador enquanto houver registros aguardando envio.'
      ]
    },
    {
      id: 'suporte',
      titulo: 'Disponibilidade e suporte',
      itens: [
        'O Fornecedor se empenha para manter o GEO disponível, mas podem ocorrer interrupções por manutenção, atualização ou falhas de terceiros. Manutenções programadas serão avisadas com antecedência sempre que possível.',
        'O suporte é prestado pelo módulo de Chamados, nas condições do contrato.',
        'Níveis de serviço específicos, quando houver, são os previstos no contrato.'
      ]
    },
    {
      id: 'evolucao',
      titulo: 'Atualizações e evolução',
      paragrafos: [
        'O GEO recebe atualizações periódicas com correções e melhorias, sem custo adicional para a Contratante.',
        'Funcionalidades pedidas especificamente pela Contratante são orçadas à parte, com valor e prazo definidos antes do início, e só são feitas com aprovação dela.'
      ]
    },
    {
      id: 'responsabilidade',
      titulo: 'Limitação de responsabilidade',
      paragrafos: [
        'O Fornecedor não responde por decisões tomadas com base nas informações do sistema, por dados inseridos de forma incorreta, por uso fora destes Termos nem por falhas de internet, de aparelhos ou de serviços de terceiros fora do seu controle.',
        'Quando houver responsabilidade do Fornecedor, ela fica limitada a [LIMITE, ex.: o valor pago pela Contratante nos 12 meses anteriores ao fato], salvo dolo ou o que a lei não permitir limitar.'
      ]
    },
    {
      id: 'encerramento',
      titulo: 'Suspensão e encerramento',
      paragrafos: [
        'O acesso pode ser suspenso em caso de violação destes Termos ou de inadimplência, nas condições do contrato.',
        'Ao fim do contrato, o acesso é encerrado e os dados seguem o que diz a Política de Privacidade sobre exportação e eliminação.'
      ]
    },
    {
      id: 'alteracoes',
      titulo: 'Alterações destes Termos',
      paragrafos: [
        'Estes Termos podem ser atualizados. A versão e a data de vigência ficam no topo desta página, e mudanças relevantes serão avisadas às Contratantes com antecedência.'
      ]
    },
    {
      id: 'foro',
      titulo: 'Lei aplicável e foro',
      paragrafos: [
        'Estes Termos seguem as leis brasileiras. Fica eleito o foro da comarca de [COMARCA] para resolver qualquer questão sobre eles.',
        'Contato: [E-MAIL DE CONTATO] ou o módulo de Chamados do GEO.'
      ]
    }
  ]
};

export const DOCUMENTOS_LEGAIS: Record<DocumentoLegalId, DocumentoLegal> = {
  privacidade: POLITICA_PRIVACIDADE,
  termos: TERMOS_USO
};

/** Separa o texto em trechos comuns e marcadores a preencher ([ASSIM]). */
export function trechosLegais(texto: string): { texto: string; pendente: boolean }[] {
  return texto
    .split(/(\[[^\]]+\])/)
    .filter(parte => parte.length > 0)
    .map(parte => ({ texto: parte, pendente: /^\[[^\]]+\]$/.test(parte) }));
}
