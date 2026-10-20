# Matriz obrigatoria de casos de teste

Os testes automatizados complementam, mas **não substituem**, a descrição de objetivo, cenário, pré-condições e resultado esperado. Em 20/10/2026, foram **162/162 testes aprovados** na versão atual: 16 na Order API e 146 no Agent Service. O Docker local, as seis migrações SQL, a Swagger UI e o handoff no Telegram também foram validados. A versão final passou em instalação limpa com npm ci, builds e 162 testes.

## Order API: `apps/order-api/tests/orders.test.ts`

| ID | Objetivo | Cenario e pre-condicoes | Resultado esperado |
| --- | --- | --- | --- |
| OA-01 | Provar disponibilidade | GET `/health` com app iniciado | HTTP 200 e status `ok` |
| OA-02 | Exigir autenticacao | GET de pedido sem bearer valido | HTTP 401, nenhum detalhe do pedido |
| OA-03 | Consultar proprio pedido | Token ficticio usuario 1 e `PED-1001` | HTTP 200, status correto e sem `userId` na resposta |
| OA-04 | Garantir isolamento | Token usuario 1 tenta `PED-2001` (usuario 2) | HTTP 404, sem dados de outra conta |
| OA-05 | Validar entrada | Consultar `INVALIDO` | HTTP 400 |
| OA-06 | Cancelar apenas com prova | `PED-1001` em `processing`, autorizacao HMAC valida | HTTP 200 e transicao para `cancelled` |
| OA-07 | Bloquear pedido enviado | `PED-1002` em `shipped`, autorizacao valida | HTTP 409; status preservado |
| OA-08 | Bloquear outro usuario | Usuario 1 tenta cancelar `PED-2001` com prova valida | HTTP 404; status preservado |
| OA-09 | Preservar estado cancelado | Primeiro cancelamento valido, segunda tentativa | Primeira 200, segunda 409 |
| OA-10 | Impedir escrita direta | Bearer valido, mas sem `X-Cancel-Confirmation` | HTTP 403; pedido nao alterado |
| OA-11 | Vincular prova ao pedido | HMAC gerada para outro pedido | HTTP 403 |
| OA-12 | Exigir validade temporal | HMAC expirada | HTTP 403 |
| OA-13 | Detectar adulteracao | Alteracao de bytes da HMAC | HTTP 403 |
| OA-14 | Validar configuracao | Segredo HMAC abaixo do comprimento minimo | Inicializacao rejeitada |

## Observabilidade da Order API (2 testes adicionais)

| ID | Objetivo | Cenario e pre-condicoes | Resultado esperado |
| --- | --- | --- | --- |
| OB-OA-01 | Registrar consultas com privacidade | GET autorizado; capturar logs | Evento `order.lookup` tem severidade, status e duracao; nao contem ID do pedido nem token |
| OB-OA-02 | Registrar operacao recusada | POST de cancelamento sem prova assinada | HTTP 403 e evento `order.cancel` de severidade WARNING; sem ID do pedido |

## Agente, canais, memoria e integracoes

| ID | Objetivo | Cenario e pre-condicoes | Resultado esperado |
| --- | --- | --- | --- |
| AG-01 | Consulta fundamentada | Modelo escolhe `get_order` e API retorna `processing` | Comunica o estado confirmado pela Order API |
| AG-02 | Evitar troca de ID | Cliente informa `PED-1001`, modelo escolhe `PED-2001` | Nega o identificador divergente, nenhuma consulta indevida |
| AG-03 | Validar args de ferramenta | Modelo retorna JSON/ID invalido ou ferramenta desconhecida | Nao executa chamada proibida; mensagem segura |
| AG-04 | Nao atribuir cancelamento ao LLM | Cliente tenta impor cancelamento por instrucao | Fluxo exige confirmacao deterministica; LLM nao tem ferramenta de escrita |
| AG-05 | Falha segura de consulta | Order API indisponivel ou resposta invalida | Nao inventa status e orienta ajuda humana |
| AG-06 | Confirmacao positiva | Pedido proprio `processing`, pendencia criada, `sim` na mesma sessao | Consome pendencia e envia cancelamento assinado uma vez |
| AG-07 | Confirmacao negativa | Pendencia ativa, usuario responde `nao` | Remove pendencia, zero chamadas de escrita |
| AG-08 | Confirmacao inexistente | Mensagem `sim` sem pendencia | Nao cancela; pede identificacao do pedido |
| AG-09 | Reutilizacao de confirmacao | Duas mensagens `sim` apos mesma solicitacao | So primeira pode tentar cancelar |
| AG-10 | Expiracao e disputa | Pendencia expirada ou substituida antes do `claim` | Nao executa cancelamento |
| AG-11 | Isolamento das conversas | Telegram chat A pede cancelamento, chat B responde `sim` | Chat B nao aproveita pendencia de A |
| AG-12 | Memoria por tipo | Consultar pedido e produto; depois "qual status dele?" | Recupera ultimo pedido, nao produto |
| AG-13 | Memoria duravel | Referencia salva no Postgres, reiniciar processo | Mesma sessao recupera ID antes de expirar (validar manualmente) |
| AG-14 | Mock HTTP autenticado | POST `/messages` sem bearer ou com bearer incorreto | HTTP 401 e nenhuma chamada ao agente |
| AG-15 | Integridade da sessao HTTP | Corpo inclui `userId` ou `sessionKey` enviados pelo cliente | HTTP 400; nenhum spoofing |
| AG-16 | Limite do HTTP | Corpo maior que 8192 bytes | HTTP 413 |
| AG-17 | Telegram aberto com isolamento | Mensagem de chat privado, IDs `chat.id=from.id` | Atende e vincula sessao a ID de chat; bloqueia grupos e bots |
| AG-18 | Catalogo de terceiros | Produto valido da Fake Store | Consulta HTTP externa e apresenta dados sem convertê-los em instrucoes |
| AG-19 | Falhas Fake Store | Timeout, HTTP de erro ou resposta invalida | Mensagem segura; nunca inventa preco |
| AG-20 | Prompt injection em ferramentas | Cliente tenta ignorar instrucoes, forjar ID ou pedir tool de escrita | Somente ferramentas de leitura com argumentos e ID validos |
| AG-21 | Conteudo malicioso da Fake Store | Titulo/descricao com instrucoes manipuladoras | Texto externo nao redefine regras; descricao nao entra no prompt |
| AG-22 | OpenRouter com falha | Timeout, 429 ou 500 simulado | Nao inventa resultado e recomenda ajuda humana |
| AG-23 | Prova de cancelamento upstream | Order API responde 500, timeout, 403 ou resultado inconsistente | Agente nao anuncia cancelamento concluido |
| AG-24 | Observabilidade sem PII | Pedido normal ou erro; verificar JSON de log | Metadados de evento, status e tempo; sem prompt, token ou conteudo pessoal |

## Handoff humano conversacional (24 testes de agente + 5 de persistência aprovados)

| ID | Objetivo | Cenario e pre-condicoes | Resultado esperado |
| --- | --- | --- | --- |
| HO-01 | Triagem natural | Cliente diz "Queria conversar com alguém" | Pergunta motivo uma vez, sem confirmacao sim/nao |
| HO-02 | Registro apos descricao | Cliente explica "Minha entrega atrasou" | Grava categoria delivery e confirma registro, sem operator real |
| HO-03 | Motivo na primeira mensagem | Cliente informa que deseja atendente por entrega atrasada | Registra sem pergunta repetida |
| HO-04 | Privacidade do evento | Sessao Telegram e pedido ficticio mencionados | Log omite IDs/texto, inclui so categoria |
| HO-05 | Evitar duplicidade | Cliente responde sim apos registro | Nao gera segundo evento; retorna ao agente normal |
| HO-06 | Isolar confirmacoes | sim vem de outra sessao | Nao registra e nao consome triagem da primeira |
| HO-07 | Evitar cancelamento acidental | sim durante coleta de motivo | Solicita motivo; nao acessa Order API |
| HO-08 | Desistir | Cliente diz nao durante triagem | Descarta triagem sem gravar fila |
| HO-09 | Preservar privacidade | Cliente nao quer explicar motivo | Registra categoria other, sem texto |
| HO-10 | Troca para cancelamento | Cliente pede cancelar PED-1001 durante triagem | Descarta triagem e delega cancelamento para validacao/confirmacao |
| HO-11 | Troca para consulta | Cliente pede status durante triagem | Descarta triagem e consulta normalmente |
| HO-12 | Separar confirmacoes | Cliente solicita humano enquanto cancelamento pendente | Invalida confirmacao de cancelamento anterior |
| HO-13 | Oferta apos falha | Agente internamente sinaliza falha de consulta; cliente sim | Registra com fase acceptance, sem pedir motivo novamente |
| HO-14 | Recusar oferta | Cliente diz nao apos oferta | Nao grava encaminhamento |
| HO-15 | Expiracao/concorrrencia | Claim atomico nao encontra triagem valida | Nao afirma registro |
| HO-16 | Falha de persistencia | INSERT da fila falha | Nao afirma registro nem expõe SQL |
| HO-17 | Falha ao iniciar | Banco indisponivel no put | Informa falha e nao registra |
| HO-18 | Seguranca por categoria | Texto sobre cobranca/cartao | Somente categoria payment e gravada |
| HO-19 | Injection | Prompt malicioso menciona atendente | Nao cria encaminhamento indevido |
| HO-20 | Conteudo externo | Titulo Fake Store inclui frase de transferencia | Nao abre triagem por saida externa |
| HO-21 | Sessao confiavel | SessionKey vazia | Rejeita operacao |
| HO-22 | Variante natural | Quero falar com atendente; queria conversar com alguem | Interpreta intencao e pede motivo |
| HO-23 | HMAC em persistencia | Telegram sessionKey armazenada | Somente hash HMAC vai ao SQL |
| HO-24 | Etapa e expiracao | Pendencia reason/acceptance | SQL verifica fase e validade |
| HO-25 | Registro simulado | Motivo classificado | Tabela status pending_demo, sem texto e ID |
| HO-26 | Credencial forte | Segredo HMAC curto | Falha no construtor |

## Observabilidade das integracoes (5 testes adicionais)

| ID | Objetivo | Cenario e pre-condicoes | Resultado esperado |
| --- | --- | --- | --- |
| OB-AG-01 | Logar consulta a Order API sem segredos | GET autorizado simulado | Evento `order_api.lookup` com HTTP 200 e duracao, sem ID nem token |
| OB-AG-02 | Detectar resposta de outro pedido | Order API retorna ID distinto | `INVALID_API_RESPONSE` e evento `invalid_response` |
| OB-AG-03 | Logar Fake Store sem dados brutos | Produto de teste com titulo/descricao privados | Evento `fake_store.request` sem campos do catalogo |
| OB-AG-04 | Logar estrutura externa invalida | Fake Store retorna JSON sem campos obrigatorios | `fake_store.validation_failed`, sem payload bruto |
| OB-AG-05 | Logar indisponibilidade sem detalhes sensiveis | Fake Store lanca excecao de rede | `outcome=unavailable`, sem mensagem bruta da excecao |

**Suítes atuais:** `npm.cmd run test -w @contato-seguro/order-api` (16/16) e `npm.cmd run test -w @contato-seguro/agent-service` (146/146), ambas aprovadas em 20/10/2026. Os casos descritos nesta matriz representam cenários de negócio e segurança; não existe necessariamente correspondência um-para-um entre cada linha da matriz e um teste automatizado.

## Cenários manuais pelo Telegram e pela API

| ID | Objetivo | Cenário e pré-condições | Resultado esperado | Evidência disponível |
| --- | --- | --- | --- | --- |
| TG-01 | Consultar pedido | Telegram privado, `PED-1001` pertencente à conta fictícia | Estado fundamentado na Order API | **Observado**: pedido em processamento |
| TG-02 | Contexto de pedido | Após consultar `PED-1001`, perguntar `Ele já saiu pra entrega?` e `Tem previsão de quando chega?` | Reusar referência, reconsultar API, não inventar etapa logística/ETA | **Melhoria v3 aprovada pelo usuário**; transcrição literal pós-correção não arquivada |
| TG-03 | Consultar catálogo | Pedir produto 1 e preço em seguida | Dados complementares da Fake Store, sem moeda inventada | **Observado** em conversa e mock HTTP |
| TG-04 | Encaminhamento conversacional | `Quero falar com uma pessoa.` → `Meu pedido está atrasado` | Coletar motivo, gravar `pending_demo`, evento sanitizado e resposta natural | **Observado**: diálogo, `stored:true`, `forwarded:false`, categoria `delivery`, contagem SQL = 1 |
| TG-05 | Impedir cancelamento sem confirmação | POST para pedido próprio sem HMAC | HTTP 403, sem alteração de estado | **Observado** anteriormente na Order API |
| TG-06 | Cancelar após confirmação | Pedido descartável `PED-1004` em processamento no ambiente Supabase anterior | Somente após `sim` e confirmação da Order API: `cancelled` persistido | **Observado** anteriormente no Supabase; ambiente diferente do Docker atual |
| TG-07 | Confirmar esquema Swagger | Swagger local com API em execução | HTTP 200 na UI e `X-Cancel-Confirmation` obrigatório na definição OpenAPI | **Observado** por verificação automática |
| TG-08 | Persistência após restart | Consultar pedido no Telegram, reiniciar Agent Service e perguntar por pronome | Recuperar contexto dentro de 24 horas no mesmo chat | **Não comprovado manualmente** neste conjunto de evidências |

A transcrição literal de TG-04, os logs reais, a separação Supabase/Docker e as limitações de observação estão em [evidências de validação](evidencias-validacao.md).

**Amostra Google Cloud:** o projeto `contato-seguro-ai` recebeu cinco logs sanitizados via exportacao manual (`order.lookup`, `order_api.lookup`, `fake_store.request` e duas selecoes do LLM); os quatro graficos do dashboard exibiram esses eventos. A amostra **nao** comprova monitoramento continuo, latencia p95 ou disponibilidade.
