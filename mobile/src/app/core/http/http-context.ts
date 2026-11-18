import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Marca uma requisição como "silenciosa": o `errorInterceptor` não exibirá o
 * toast global de erro caso ela falhe.
 *
 * Usado por rotinas de background (sincronização, reconciliação de turno) que
 * já reportam o problema na própria UI — sem isso, um sync com várias etapas
 * negadas empilha um toast técnico para cada endpoint.
 *
 * Preferimos um `HttpContext` a um header customizado (`X-Silent-Error`) porque
 * o contexto não trafega na rede: não gera preflight CORS nem depende do
 * backend liberar o header em `Access-Control-Allow-Headers`.
 */
export const SILENT_ERROR = new HttpContextToken<boolean>(() => false);

/**
 * Cria (ou estende) um `HttpContext` marcado como silencioso.
 */
export function silentContext(context: HttpContext = new HttpContext()): HttpContext {
  return context.set(SILENT_ERROR, true);
}

/**
 * A requisição sai mesmo com o app em modo offline ("Trabalhar sem internet" ou dados
 * móveis desligados). Só para ação explícita da pessoa que precisa de rede, como o login:
 * bloquear aí prende o aparelho na tela de login, onde essas opções não existem.
 */
export const IGNORAR_MODO_OFFLINE = new HttpContextToken<boolean>(() => false);
