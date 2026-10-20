# Hardening 02: prompts adversariais e falhas externas

Este incremento preserva a confirmação assinada e as regras de cancelamento existentes.

## Mudanças

- Uma consulta a pedido requer exatamente um identificador `PED-0000` escrito pelo cliente; IDs deduzidos ou escolhidos entre múltiplos são recusados. A resposta da Order API também deve retornar o mesmo ID consultado.
- Uma consulta a produto requer um identificador numérico explícito (`produto 1` ou `item 1`) que coincida com os argumentos do modelo e com a resposta da Fake Store.
- Campos da Fake Store são dados, não instruções. A descrição não é enviada ao LLM; caracteres de controle e direcionalidade Unicode são normalizados apenas na apresentação do título.
- Erro inesperado na consulta à Order API retorna mensagem segura em vez de escapar como exceção sem resposta.
- O provider OpenRouter registra eventos estruturados com modelo, contagem de chamadas, tokens (quando disponíveis), latência e código HTTP (quando disponível), sem gravar mensagens, títulos ou credenciais.
- `429`, timeout e falhas dos provedores retornam orientação de atendimento humano, sem resposta inventada e sem fallback automático para um modelo mais caro.

## Testes

`npm.cmd run build -w @contato-seguro/agent-service`
`npm.cmd run test -w @contato-seguro/agent-service`
`npm.cmd run test -w @contato-seguro/order-api`

A expectativa é 85 testes existentes + 15 novos = 100 testes, caso as suítes não sejam modificadas. Verifique no seu ambiente.

## Limites remanescentes

- Apenas dados fictícios; o Telegram aberto não autentica titularidade de cliente.
- A prova HMAC possui validade curta, mas ainda não tem anti-replay durável por nonce.
- `NODE_ENV=production` continua bloqueado até implementação de autenticação apropriada.
- A proteção de apresentação não garante que um nome de produto não contenha texto malicioso. A barreira decisiva é que os campos retornados pela Fake Store **não entram no contexto do LLM** e **não recebem autoridade de ferramenta**.
- A suíte de testes usa mocks e não prova robustez irrestrita contra prompt injection. É necessário manter cenários adversariais de regressão e testes end-to-end.
