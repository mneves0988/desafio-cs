# Camila: continuidade contextual e persistência (v3)

## Diagnóstico

O problema observado na conversa não era a falta de banco: frases como **"Ele já saiu pra entrega?"** e **"Tem previsão de quando chega?"** não eram reconhecidas pelo classificador restrito do `ContextualConversationAgent`. O agente retornava uma mensagem genérica, mesmo havendo um pedido recente armazenado.

## O que já existe

- O `PostgresSessionContextStore` persiste a última **referência verificada** de pedido ou produto em `public.agent_session_context` (migração `004_agent_session_context.sql`).
- A referência expira em 24 horas, é separada por `session_key` e `context_kind`, e não guarda o texto da conversa.
- O Telegram usa sessão associada ao chat privado. Em execução com Node local configurado para Supabase, `DATABASE_URL` aponta ao PostgreSQL do Supabase. **No Docker Compose, `DATABASE_URL` é substituído pela URL do PostgreSQL local**, cujo volume persiste entre reinícios.
- Isso não é um histórico conversacional completo. O modelo não recebe um transcript nem grava cada mensagem. O contexto mínimo é intencional e protege privacidade e segurança.

## Alterações v3

1. Interpreta expressões de acompanhamento de envio e previsão sem repetir o ID em todas as respostas.
2. Para saber se saiu para entrega, **reconsulta a Order API** e não confunde `shipped` (enviado) com a etapa logística específica "saiu para entrega".
3. Para previsão de entrega, não inventa datas. Reconsulta o pedido para manter o fluxo normal de validação/limpeza de pendências, mas comunica que a API não oferece ETA.
4. Isola referências de pedido e produto por sessão. Jamais resolve um pronome como autorização para cancelar.
5. Melhora a saudação com nome no Telegram, sem alterar as respostas de negócios confirmadas.

## Testes recomendados no Telegram

1. `Consegue ver meu pedido PED-1001?` → status verificado.
2. `Ele já saiu pra entrega?` → responde de acordo com o estado real, sem afirmar etapa logística indisponível.
3. `Tem previsão de quando chega?` → informa que não há previsão confiável.
4. `Qual o preço do produto 1?` → produto verificado.
5. `Quanto ele custa?` → responde com o preço da API, sem repetir o ID.
6. Reinicie apenas o Agent Service e pergunte `Ele já saiu pra entrega?` no mesmo chat. Com o PostgreSQL persistente e dentro de 24 horas, a referência deverá continuar disponível.

## Inspecionar as referências persistidas (sem expor sessões)

**Supabase SQL Editor (somente se o processo está conectado ao Supabase):**

```sql
SELECT context_kind, reference_id, updated_at, expires_at
FROM public.agent_session_context
WHERE expires_at > NOW()
ORDER BY updated_at DESC
LIMIT 10;
```

**Docker, se o bot estiver rodando com banco local:**

```powershell
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT context_kind, reference_id, updated_at, expires_at FROM public.agent_session_context ORDER BY updated_at DESC LIMIT 10;"'
```

O contexto não prova a identidade real do cliente. Não usar pedidos reais ou expor a conta fictícia em um serviço público.

## Limite conhecido

As frases cobertas pelo classificador seguem um conjunto verificável de intenções, não um histórico conversacional ilimitado. Perguntas completamente novas ou muito ambíguas podem exigir o código do pedido novamente. A implantação de uma memória de mensagens completa ou de um classificador adicional por LLM exigiria outra revisão de privacidade, prompts e testes. A entrega do desafio não precisa disso.
