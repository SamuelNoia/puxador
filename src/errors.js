// Traducao de erros de banco para mensagens uteis e validacoes de formulario.

/**
 * O Firebird e o unico banco que recebe caminho de arquivo em vez de nome de base.
 * Estes dois erros de digitacao sao os mais comuns:
 *   - colocar o IP junto do caminho -> "10.0.0.52:\dados\base.fdb"  (o erro vira "Unavailable database")
 *   - usar o alias do IBExpert     -> "eco Copy"
 */
export function validarBaseFirebird(base) {
  const s = String(base || '').trim();
  if (!s) return null;

  const hostNoCaminho = /^([^\\/]{2,}):[\\/]/.exec(s);
  if (hostNoCaminho && !/^[A-Za-z]$/.test(hostNoCaminho[1])) {
    return 'O caminho do banco não deve incluir o servidor. '
      + 'Coloque o IP apenas no campo "Servidor" e aqui só o caminho do arquivo '
      + '(ex.: C:\\ecosis\\dados\\ECODADOS.ECO).';
  }

  const temSeparador = /[\\/]/.test(s);
  const temExtensao = /\.[A-Za-z0-9]{2,5}$/.test(s);
  if (!temSeparador && !temExtensao) {
    return 'Isso parece um alias do IBExpert. O Firebird precisa do caminho completo do arquivo '
      + 'no servidor (ex.: C:\\ecosis\\dados\\ECODADOS.ECO).';
  }

  return null;
}

const PADROES = [
  [/Unavailable database/i, () => 'Banco indisponível: o caminho do arquivo no servidor está errado. '
    + 'Use o caminho completo, com a letra do drive (ex.: C:\\ecosis\\dados\\ECODADOS.ECO) — sem IP e sem alias.'],
  [/I\/O error.*(open|file)/i, (m) => `Não foi possível abrir o arquivo no servidor. Confira o caminho (${m.slice(0, 120)}).`],
  [/cannot transliterate/i, () => 'O charset da conexão não combina com o do banco. '
    + 'Nas opções avançadas, teste "WIN1252" ou "NONE".'],
  [/user name and password|login|password|authentication/i, (k) => k === 'firebird'
    ? 'Usuário ou senha recusados. No Firebird o padrão é SYSDBA / masterkey (atenção ao Caps Lock).'
    : 'Usuário ou senha recusados pelo banco.'],
  [/ECONNREFUSED/i, (k, extra) => `O servidor recusou a conexão em ${extra || 'host:porta'}. `
    + 'Confira o IP, a porta e se o serviço do banco está rodando.'],
  [/ENOTFOUND|EAI_AGAIN|getaddrinfo/i, () => 'Servidor não encontrado. Confira o IP/host digitado.'],
  [/ETIMEDOUT|timeout|timed out/i, () => 'Tempo esgotado ao falar com o banco. Verifique firewall e rede.'],
  [/ECONNRESET|socket hang up/i, () => 'A conexão foi encerrada pelo servidor. Verifique firewall/VPN.'],
  [/database .* not found|does not exist/i, (k) => k === 'firebird'
    ? 'Banco não encontrado: confira o caminho do arquivo .fdb/.eco no servidor.'
    : 'Base de dados não encontrada. Confira o nome da base.'],
  [/ACCESS_DENIED|denied/i, () => 'Acesso negado pelo banco. Confira as permissões do usuário.'],
];

/** Converte o erro do driver em mensagem de tela. */
export function mensagemAmigavel(kind, err, contexto = '') {
  const bruto = String(err?.message || err || 'Erro desconhecido');
  for (const [regex, montar] of PADROES) {
    if (regex.test(bruto)) return montar(bruto, kind, contexto);
  }
  return bruto.replace(/\s+/g, ' ').slice(0, 300);
}
