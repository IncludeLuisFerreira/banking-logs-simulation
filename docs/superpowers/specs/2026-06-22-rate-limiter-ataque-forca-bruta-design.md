# Especificação: Rate Limiter para Detecção de Ataque de Força Bruta

## Objetivo

Implementar um sistema de rate limiting na rota de login que bloqueie IPs por 60 segundos após 5 tentativas de login inválidas, permitindo simular um ataque de força bruta contra a aplicação hospedada em um cloud provider.

## Escopo

- Middleware de rate limiter no backend Node.js
- Script autônomo de ataque para testar de uma máquina separada
- Sem mudanças no frontend, Docker, ou observabilidade stack

## Arquitetura

```
Atacante ──POST /auth/login──► rateLimiter.consume(ip) ──OK──► handler login
                                      │                         │
                                      │ (bloqueado)             │ (sucesso)
                                      ▼                         ▼
                                   429 Too Many Requests    rateLimiter.delete(ip)
                                                           (reseta contador)
```

## Componentes

### 1. Dependência: `rate-limiter-flexible`

Adicionar ao `app/package.json`:
- Pacote: `rate-limiter-flexible` (~2.5.x)

### 2. Middleware: `app/src/middleware/rateLimiter.js`

- Usa `RateLimiterMemory` (sem Redis, em memória)
- Configuração:
  - `points: 5` — máximo de tentativas
  - `duration: 60` — janela de 60 segundos
  - `blockDuration: 60` — bloqueio de 60s após exceder o limite
- Exporta:
  - `loginLimiter` — middleware Express que chama `rateLimiter.consume(req.ip)`
  - `rateLimiter` — instância do RateLimiterMemory (para acesso externo)
- Se `consume()` lançar erro → responde com status 429 + header `Retry-After` + JSON `{ erro, retryAfterSeconds }`
- Loga `console.warn` com o IP bloqueado (capturado pelo Promtail → Loki)

### 3. Rota de Login: `app/app.js`

```javascript
app.post('/auth/login', loginLimiter, (req, res) => {
  try {
    const { username, password } = req.body;
    const resultado = authService.login(username, password);
    rateLimiter.delete(req.ip); // sucesso → reseta contador do IP
    res.json({ token: resultado.token, username: resultado.usuario.username });
  } catch (erro) {
    const status = erro.status || 500;
    res.status(status).json({ erro: erro.message });
  }
});
```

- `loginLimiter` roda **antes** do handler — já barra IPs bloqueados sem processar nada
- Se login for bem-sucedido: `rateLimiter.delete(ip)` zera o contador (usuário legítimo não acumula tentativas)
- Se login falhar: o ponto já foi consumido pelo middleware, contador sobe

### 4. Script de Ataque: `scripts/attack.js`

- Script Node.js puro (usa `http`/`https` nativo, sem dependências)
- Uso: `node scripts/attack.js <url> [username]`
  - Exemplo: `node scripts/attack.js https://meuapp.com admin`
  - Default de username: `admin`
- URLs de exemplo: `http://localhost:3000` (dev) ou `https://app-producao.vercel.app` (produção)
- Envia 20 requisições POST para `/auth/login` com senhas aleatórias
- Exibe para cada tentativa: número, status code, corpo da resposta
- Quando recebe 429, exibe mensagem de bloqueio e o tempo de `retryAfterSeconds`
- Ao final, exibe resumo: quantas tentativas, quantos 401/429/200

### 5. Logs e Observabilidade

- `console.warn` no bloqueio é automaticamente capturado pelo Promtail → Loki
- Sem métricas Prometheus adicionais (fora do escopo atual)

### 6. Limitações Conhecidas

- `RateLimiterMemory` é volátil: se o container reiniciar, contadores são perdidos
- Não funciona com múltiplas réplicas do app sem Redis
- Para produção real com múltiplas instâncias, migrar para `RateLimiterRedis`

## Estrutura de Arquivos

```
app/
├── package.json              (+ rate-limiter-flexible)
└── src/
    └── middleware/
        └── rateLimiter.js    (NOVO)

scripts/
└── attack.js                 (NOVO)
```

## Casos de Teste

| Cenário | Entrada | Resultado Esperado |
|---------|---------|-------------------|
| 1 tentativa inválida | POST /auth login com senha errada | 401, contador = 1 |
| 5 tentativas inválidas seguidas | 5x POST com senha errada | 5a tentativa → 429, bloqueado |
| Tentativa no meio do bloqueio | POST após 429 | 429 com Retry-After |
| Login bem-sucedido | POST com admin:admin123 | 200, contador resetado |
| Login após reset | POST com senha errada | 401 (não bloqueado) |
