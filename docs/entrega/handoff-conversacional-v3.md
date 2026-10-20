# Handoff conversacional: registro em fila interna simulada (Camila v3)

## Regra de experiencia

Uma solicitacao de ajuda humana **nao e cancelamento** e nao precisa de uma confirmacao sim/nao. A Camila coleta o motivo com uma pergunta curta, quando necessario, e registra o encaminhamento. Quando o motivo aparece na primeira mensagem, nenhuma pergunta adicional e feita.

Exemplo:

- Cliente: "Quero falar com uma pessoa."
- Camila: "Claro! Me conta rapidinho o que aconteceu para eu encaminhar melhor?"
- Cliente: "Meu pedido está atrasado"
- Camila: "Entendi, é sobre a entrega. Deixei sua solicitação registrada para atendimento humano."

**Atencao:** nenhuma pessoa recebe ou assume a conversa. O PostgreSQL registra uma solicitacao de demonstracao com status `pending_demo`. O `/start` informa que os pedidos são fictícios; este documento esclarece que o encaminhamento é simulado. Essa explicação não é repetida em cada resposta. A Camila nao afirma que um atendente pegou o caso.

## Falhas e limites

- Quando uma falha interna verificada faz a Camila oferecer ajuda humana, `sim` registra a solicitacao demonstrativa, sem uma segunda pergunta.
- Se a triagem aguarda o motivo, `sim` **nao** registra e **nunca** autoriza um cancelamento. Pede o motivo.
- Uma solicitacao explicita de atendimento humano invalida qualquer confirmacao de cancelamento pendente. Ao iniciar novo cancelamento, a triagem de handoff e descartada.
- Se o banco falhar, Camila nao afirma que registrou. Respostas externas ou prompt injection nao iniciam handoff.
- TTL da triagem: dez minutos, com operacao atomica de consumo. A fila demonstrativa permanece no banco ate exclusao controlada; nao existe operador conectado ou integracao de CRM.
- Persistencia de triagem usa hash HMAC da sessao; o registro final guarda apenas o mesmo hash, categoria do problema, status e timestamps. Sem texto bruto, numero do pedido ou dados pessoais.

## Migracoes

- `infra/db/005_agent_pending_handoffs.sql`: pendencias de triagem por sessao com hash HMAC.
- `infra/db/006_agent_handoff_requests.sql`: coluna de etapa `reason|acceptance` e registros na fila `agent_handoff_requests`.

Em Docker Compose o `db-migrate` executa as migracoes `001` a `006` no PostgreSQL local. Para executavel fora do Docker apontado ao Supabase, aplique `005` e `006` no SQL Editor do projeto desejado. **Nao aplicar a outras bases nem copiar chaves para logs.**

## Testes

```powershell
npm.cmd run build -w @contato-seguro/agent-service
npm.cmd run test -w @contato-seguro/agent-service
npm.cmd run test -w @contato-seguro/order-api
git diff --check

docker compose up -d postgres
docker compose run --rm db-migrate
docker compose up --build -d
```

Conversa a testar: `Queria conversar com alguém` -> `Minha entrega atrasou` (deve registrar uma vez); `Quero um atendente porque meu pagamento deu erro` (deve registrar diretamente); indisponibilidade de API -> oferta humana -> `sim`; e iniciar cancelamento de um pedido ficticio descartavel apos desistir da triagem (nao deve ser confundido com handoff).

Ver logs: `docker compose logs --since=5m agent-service | Select-String 'handoff.requested'`. O evento possui `stored=true`, `forwarded=false`, `mode=demo` e `reasonCategory`, **sem PII**.

**Validação realizada em 20/10/2026:** 24/24 testes de `handoff-agent.test.ts`, cinco/cinco testes de `pending-handoffs.test.ts` e **162/162 testes no total dos dois serviços**. O fluxo conversacional foi observado no Telegram e gerou `handoff.requested` com `stored:true`, `forwarded:false`, `reasonCategory:"delivery"`; a tabela `agent_handoff_requests` no PostgreSQL local apresentou um registro. A versão consolidada passou em instalação limpa; o handoff foi validado anteriormente no Docker e Telegram. Consulte [evidências de validação](evidencias-validacao.md).
