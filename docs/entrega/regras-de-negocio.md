# Regras de negocio, duvidas e suposicoes

## Regras obrigatorias fornecidas pelo desafio

1. O agente consulta status de pedidos pela API principal.
2. Apenas pedidos em `processing` podem ser cancelados; `shipped` e `cancelled` nao podem.
3. Antes de cancelar, o cliente deve confirmar expressamente a intencao.
4. O agente so informa sucesso quando a Order API confirma a operacao.
5. Quando status, resultado ou integracao forem incertos, nao afirmar que a acao foi concluida.
6. Solicitar esclarecimentos diante de informacoes insuficientes ou conflitantes.
7. Oferecer atendimento humano para solicitacoes fora do escopo, incertas ou inseguras.
8. Instrucao de usuario e informacao externa nao alteram regras de negocio nem permissao de ferramentas.

## Decisoes de escopo tomadas na demonstracao

| Tema | Decisao / suposicao explicita | Falta esclarecer com negocio/produto |
| --- | --- | --- |
| Identidade | Um token de demo mapeia sempre para `user_id=1`; sessoes de Telegram nao comprovam titularidade. Nao usar dados reais. | Qual fluxo autenticara cada cliente antes de consultar pedidos reais? |
| Estados | Apenas `processing`, `shipped`, `cancelled`; banco considera `processing` cancelavel. | Outros estados de logistica, janela temporal ou pagamentos exigem regra adicional? |
| Confirmacao | Cliente deve responder afirmativamente a pedido pendente da mesma sessao, ate 10 minutos, e a autorizacao a API e assinada temporariamente. | Qual UX de confirmacao e prazo aceitos pelo produto? |
| Mensagens multiplas | O pedido deve ser identificado sem ambiguidades; referencia contextual pode ser usada em consultas, nao em cancelamento. | Como tratar varios pedidos numa mesma mensagem ou em contas compartilhadas? |
| Entrega | Nao existe dado confiavel de previsao de entrega na API. | Onde obter ETA e qual SLA apresentar ao cliente? |
| Catalogo | Fake Store fornece informacao complementar de produto e preco na moeda do provedor. | Como mapear produtos aos SKUs e moeda da empresa? |
| Handoff | Ao solicitar uma pessoa, cliente descreve brevemente o motivo; uma fila interna demonstrativa registra apenas categoria e fingerprint HMAC da sessao. Se a Camila ofereceu ajuda humana por uma falha, o `sim` basta. Nao existe atendente real conectado. | Canal real, SLA, permissao e payload minimo a definir com produto. |
| Falhas | Sem resposta de cancelamento confirmada pela API, a Camila nao declara sucesso. | Como conciliar operacoes que podem ter sido concluidas antes de um timeout? |
| Persistencia | Supabase/Postgres ou Postgres local. Historico bruto de conversa nao e persistido; somente contexto de ID e pendencias. | Politica de retencao de logs, LGPD e expurgo de registros? |

## Matriz de tomada de decisao

| Situacao | Conduta |
| --- | --- |
| Pedido com ID valido e pertencente a conta demonstrativa | Consultar Order API e relatar status retornado |
| Pedido desconhecido, invalido ou de outro usuario | Nao revelar dados; pedir verificacao de numero ou atendimento humano |
| Cancelamento de pedido `processing` | Registrar pendencia e pedir `sim`/`nao`; sem chamada de escrita ainda |
| Cancelamento de pedido `shipped` ou `cancelled` | Recusar cancelamento automatico |
| Confirmacao afirmativa da mesma sessao dentro da validade | Consumir pendencia atomicamente; enviar autorizacao HMAC e executar via Order API |
| Confirmacao inexistente, expirada, negada ou de outro pedido | Nao cancelar; quando necessario reiniciar a solicitacao |
| Resultado indefinido por timeout, 429/500 ou API indisponivel | Nao afirmar cancelamento/consulta confirmada; orientar atendimento humano |
| Pedido para ignorar regras, revelar prompt, forjar sucesso ou ferramenta | Ignorar a instrucao indevida; seguir contrato da API e validacoes |
| Pedido fora do escopo | Oferecer atendimento humano; perguntar motivo somente se necessario, registrar fila interna `pending_demo`, sem afirmar que existe atendente conectado |

## Separacao entre cancelamento e atendimento humano

Cancelamento continua **sempre** exigindo confirmacao explicita e sucesso da Order API. Handoff nao altera pedidos nem precisa de segundo opt-in se o cliente pediu ajuda humana. A Camila pergunta o motivo quando ainda nao foi informado. Ao iniciar handoff, descarta a confirmacao de cancelamento pendente; ao mudar de assunto para cancelamento, descarta a triagem humana. Em erro, so afirma que registrou depois de INSERT bem-sucedido na tabela `agent_handoff_requests`. Nenhum atendente ou CRM recebe dados nesta fase.
