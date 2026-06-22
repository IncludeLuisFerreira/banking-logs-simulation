#!/usr/bin/env node
// scripts/attack.js — Script de simulação de ataque de força bruta
// Uso: node scripts/attack.js <url> [username]

const http = require('http');
const https = require('https');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Uso: node scripts/attack.js <url> [username]');
  console.error('Exemplo: node scripts/attack.js http://localhost:3000 admin');
  process.exit(1);
}

const baseUrl = args[0].replace(/\/+$/, '');
const username = args[1] || 'admin';
const totalTentativas = 20;

function gerarSenha() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let senha = '';
  for (let i = 0; i < 8; i++) {
    senha += chars[Math.floor(Math.random() * chars.length)];
  }
  return senha;
}

function fazerRequisicao(tentativa) {
  return new Promise((resolve) => {
    const urlObj = new URL(`${baseUrl}/auth/login`);
    const data = JSON.stringify({ username, password: gerarSenha() });
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = lib.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          body = JSON.parse(body);
        } catch (_) {}
        resolve({ status: res.statusCode, body, tentativa });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, body: { erro: err.message }, tentativa });
    });

    req.write(data);
    req.end();
  });
}

(async () => {
  console.log(`=== Ataque de Força Bruta ===`);
  console.log(`Alvo: ${baseUrl}`);
  console.log(`Usuário: ${username}`);
  console.log(`Tentativas: ${totalTentativas}`);
  console.log('');

  let total401 = 0;
  let total429 = 0;
  let total200 = 0;
  let bloqueado = false;

  for (let i = 1; i <= totalTentativas; i++) {
    const resultado = await fazerRequisicao(i);

    if (resultado.status === 429) {
      total429++;
      bloqueado = true;
      console.log(`[${i}] BLOQUEADO (429) — ${resultado.body.erro || ''} — retryAfter: ${resultado.body.retryAfterSeconds || '?'}s`);
      break;
    } else if (resultado.status === 401) {
      total401++;
      console.log(`[${i}] INVÁLIDO (401) — ${resultado.body.erro || ''}`);
    } else if (resultado.status === 200) {
      total200++;
      console.log(`[${i}] SUCESSO (200) — token: ${(resultado.body.token || '').substring(0, 20)}...`);
    } else {
      console.log(`[${i}] ERRO (${resultado.status}) — ${JSON.stringify(resultado.body)}`);
    }
  }

  console.log('');
  console.log('=== Resumo ===');
  console.log(`Tentativas: ${total401 + total429 + total200}`);
  console.log(`401 (inválido): ${total401}`);
  console.log(`429 (bloqueado): ${total429}`);
  console.log(`200 (sucesso): ${total200}`);
  if (bloqueado) {
    console.log(`Status: BLOQUEADO — aguarde 60s para nova tentativa`);
  } else {
    console.log(`Status: NÃO BLOQUEADO`);
  }
})();
