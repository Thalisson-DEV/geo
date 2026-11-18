/**
 * Avaliação do aplicativo pelos próprios usuários (web e app de campo).
 *
 * <p>Pesquisa temporária, organizada em campanhas com início e fim. O convite e a memória
 * de quem já respondeu, adiou ou recusou ficam no servidor, para que o convite não volte
 * em outro aparelho. A resposta anônima é gravada sem vínculo algum com o usuário — nem
 * coluna de autor, nem auditoria, nem hora exata.</p>
 */
@ApplicationModule(displayName = "avaliacao")
package com.nexo.app.modules.avaliacao;

import org.springframework.modulith.ApplicationModule;
