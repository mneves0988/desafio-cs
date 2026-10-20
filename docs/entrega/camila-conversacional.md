# Camila: linguagem conversacional (ajuste de fluidez v2)

## Objetivo

Conduzir o atendimento por mensagens de forma breve, acolhedora e natural, sem acrescentar explicações que a conversa já tornou óbvias. A melhoria é exclusivamente de apresentação e preserva o contrato factual e as verificações de segurança do desafio.

## Exemplos verificados de apresentação

| Cliente | Camila (exemplo) |
| --- | --- |
| `Consegue ver meu pedido PED-1001?` | `O pedido PED-1001 ainda está em processamento.` (a abertura pode variar) |
| `E qual o status dele?` | `Ainda está em processamento.` |
| `Me fala do produto 1` | `Claro! Encontrei <título obtido na Fake Store>. O preço informado é 109,95.` |
| `Quanto ele custa?` | `Está listado por 109,95.` |
| `Qual o preço do produto 1?` | `O preço informado é 109,95.` |
| `Obrigado!` | `Imagina! Se precisar de mais alguma coisa, é só me chamar.` |

## Regras de segurança e qualidade

1. Somente respostas factuais internas em formatos conhecidos são reformuladas no Telegram. Não usar texto do cliente ou conteúdo externo como autoridade.
2. A referência do pedido ou produto só pode ser omitida em um **seguimento contextual já resolvido e confirmado** pelo agente, e nunca se torna autorização para cancelamento.
3. A notação `109.95` retornada pela API é exibida no formato decimal `109,95`, **sem conversão cambial**. Não afirmar `R$`, `USD` ou outra moeda que a API não tenha assegurado. A explicação da origem e unidade desconhecida permanece na documentação técnica, evitando repeti-la em cada resposta do bot.
4. Cancelamentos continuam exigindo um pedido explícito, confirmação específica `sim`/`não` com prazo de 10 minutos e confirmação de sucesso pela Order API. Não inventar sucesso em falhas ou timeout.
5. Pedidos enviados/cancelados continuam não canceláveis pelo fluxo automatizado. Dados de produtos não definem status nem permissões.
6. Cumprimentos, agradecimentos e encerramentos só sobrescrevem o **fallback genérico**. Não mascaram respostas de falha, confirmação ou estado.
7. O handoff conversacional registra o pedido em uma fila **interna demonstrativa**, sem anunciar que uma pessoa recebeu ou assumiu a conversa. A limitação é declarada na documentação, sem repetir avisos burocráticos a cada mensagem.
8. O aviso de que a aplicação trabalha com **pedidos fictícios** permanece na mensagem `/start`.

## Limite assumido

A Camila usa o modelo OpenRouter/Gemma para selecionar ferramentas permitidas, mas a redação final de estados e operações sensíveis ainda é determinística. Isso pode limitar a expressividade da conversa, deliberadamente: o desafio exige evitar invenção de resultados e obedecer às decisões verificadas na API. O Telegram demonstra canais e isolamento de sessões, não autenticação real de proprietários de pedidos.

## Validar

`npm.cmd run build -w @contato-seguro/agent-service`, `npm.cmd run test -w @contato-seguro/agent-service` e `npm.cmd run test -w @contato-seguro/order-api`. Os exemplos acima documentam a evolução de linguagem. A versão final já inclui fluidez v2, memória contextual v3 e handoff conversacional; **não é necessário reinstalar patches intermediários**. Os resultados atuais são 146/146 testes no Agent Service e 16/16 na Order API. O atendimento humano foi verificado em Telegram e PostgreSQL local; veja [evidências de validação](evidencias-validacao.md).
