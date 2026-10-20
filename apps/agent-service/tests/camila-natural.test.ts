import { describe, expect, it } from "vitest";
import { CAMILA_WELCOME, humanizeTelegramReply } from "../src/channels/telegram-copy.js";

const status = "O pedido PED-1001 está em processamento, conforme a Order API.";
const shipped = "O pedido PED-1002 está enviado, conforme a Order API.";
const product = "Produto 1: Mochila de teste. Preço de referência: 109.95 (moeda da Fake Store).";
const generic = "Posso consultar pedidos pelo código PED-0000 ou produtos pelo ID. Qual deseja consultar?";

describe("Camila: tom conversacional e segurança", () => {
  it("se apresenta de modo leve e avisa que o ambiente é fictício", () => {
    expect(CAMILA_WELCOME).toContain("Camila");
    expect(CAMILA_WELCOME).toContain("pedidos fictícios");
  });

  it("consulta não fica repetindo 'Conferi aqui!'", () => {
    const result = humanizeTelegramReply(status, "Qual o status do PED-1001?");
    expect(result).toContain("PED-1001");
    expect(result).toContain("processamento");
    expect(result).not.toContain("Conferi aqui!");
    expect(result).not.toContain("Order API");
  });

  it("usa resposta curta quando a pessoa se refere ao pedido anterior", () => {
    expect(humanizeTelegramReply(status, "E qual o status dele?"))
      .toBe("Ainda está em processamento.");
  });

  it("varia a abertura conforme a formulação mantendo o mesmo fato", () => {
    const answers = [
      humanizeTelegramReply(status, "Qual o status do PED-1001?"),
      humanizeTelegramReply(status, "Me diz o status do PED-1001 por favor"),
      humanizeTelegramReply(status, "Poderia consultar PED-1001?")
    ];
    for (const answer of answers) {
      expect(answer).toContain("PED-1001");
      expect(answer).toContain("processamento");
    }
    expect(new Set(answers).size).toBeGreaterThan(1);
  });

  it("não inventa previsão de entrega para pedido enviado", () => {
    const answer = humanizeTelegramReply(shipped, "Qual o status de PED-1002?");
    expect(answer).toContain("já foi enviado");
    expect(answer).not.toContain("amanhã");
    expect(answer).not.toContain("previsão");
  });

  it("segue natural em pergunta sobre preço sem converter moeda", () => {
    const answer = humanizeTelegramReply(product, "Quanto ele custa?");
    expect(answer).toBe("Está listado por 109,95.");
    expect(answer).not.toContain("R$");
  });

  it("evita repeticao do pedido em perguntas curtas de continuidade", () => {
    expect(humanizeTelegramReply(status, "E o status dele?"))
      .toBe("Ainda está em processamento.");
    expect(humanizeTelegramReply(shipped, "E ele, já foi enviado?"))
      .toBe("Já foi enviado.");
    const cancelled = "O pedido PED-1003 está registrado como cancelado, conforme a Order API.";
    expect(humanizeTelegramReply(cancelled, "E ele está cancelado?"))
      .toBe("Já consta como cancelado.");
  });

  it("apresenta descricao do produto sem aviso repetitivo sobre moeda", () => {
    const text = humanizeTelegramReply(product, "Me fala do produto 1");
    expect(text).toContain("Mochila de teste");
    expect(text).toContain("109,95");
    expect(text).not.toContain("loja de demonstração");
    expect(text).not.toContain("na moeda");
    expect(text).not.toContain("R$");
  });

  it("para pergunta direta sobre preco responde somente o preco", () => {
    const text = humanizeTelegramReply(product, "Qual o preço do produto 1?");
    expect(text).toBe("O preço informado é 109,95.");
    expect(text).not.toContain("Mochila de teste");
  });

  it("para perguntas sobre status com ID explicito mostra qual pedido", () => {
    const text = humanizeTelegramReply(status, "E o status do PED-1001?");
    expect(text).toContain("PED-1001");
    expect(text).toContain("processamento");
  });

  it("nao converte moeda ou arredonda valores fornecidos pela API", () => {
    const raw = "Produto 9: Produto exemplo. Preço de referência: 1234.50 (moeda da Fake Store).";
    const text = humanizeTelegramReply(raw, "Quanto ele custa?");
    expect(text).toContain("1234,50");
    expect(text).not.toContain("R$");
    expect(text).not.toContain("USD");
  });

  it("mantém a confirmação explícita e os 10 minutos do cancelamento", () => {
    const answer = humanizeTelegramReply('O pedido PED-1001 está em processamento. Confirma o cancelamento? Responda somente "sim" ou "não" em até 10 minutos.', "Cancelar PED-1001");
    expect(answer).toContain("PED-1001");
    expect(answer).toContain('"sim"');
    expect(answer).toContain('"não"');
    expect(answer).toContain("10 minutos");
    expect(answer).not.toContain("foi cancelado");
  });

  it("nao confunde pergunta de cancelamento com consulta comum", () => {
    const pending = 'O pedido PED-1001 está em processamento. Confirma o cancelamento? Responda somente "sim" ou "não" em até 10 minutos.';
    const answer = humanizeTelegramReply(pending, "E o status dele?");
    expect(answer).toContain("confirmar o cancelamento");
    expect(answer).toContain('"sim"');
    expect(answer).toContain('"não"');
  });

  it("não transforma falha técnica em sucesso ao receber agradecimento", () => {
    const error = "Não foi possível confirmar se o cancelamento ocorreu. Não vou afirmar que foi concluído. Solicite atendimento humano para verificar antes de tentar novamente.";
    const answer = humanizeTelegramReply(error, "obrigado");
    expect(answer).toContain("Não consegui confirmar");
    expect(answer).not.toContain("foi confirmado");
  });

  it("responde a cumprimentos quando o backend retornou fallback genérico", () => {
    expect(humanizeTelegramReply(generic, "Oi, tudo bem?")).toContain("Oi! Tudo bem?");
    expect(humanizeTelegramReply(generic, "Obrigado!")).toContain("Imagina!");
    expect(humanizeTelegramReply(generic, "Tchau")).toContain("Até mais!");
  });

  it("não altera respostas desconhecidas de negócio", () => {
    const raw = "Não foi possível validar a operação, nenhuma alteração foi confirmada.";
    expect(humanizeTelegramReply(raw, "obrigado")).toBe(raw);
  });

  it("mantém o handoff natural sem alegar que um atendente assumiu a conversa", () => {
    // Contrato do handoff conversacional v3: registro interno, sem transferência real.
    const raw = "Entendi, é sobre a entrega. Deixei sua solicitação registrada para atendimento humano.";
    const answer = humanizeTelegramReply(raw, "Minha entrega está atrasada");
    expect(answer).toBe(raw);
    expect(answer).toContain("solicitação registrada");
    expect(answer).not.toMatch(/atendente (?:assumiu|respondeu|está conectado)|(?:transferi|conectei) você/i);
    expect(answer).not.toContain("Nenhum atendente real foi acionado");
  });
  it("saudacao com nome Camila recebe resposta acolhedora", () => {
    const message = humanizeTelegramReply(generic, "Oi Camila, tudo bem?");
    expect(message).toContain("Oi! Tudo bem?");
  });

  it("previsao de entrega sem dados confirmados continua clara e sem datas inventadas", () => {
    const raw = "Ainda não tenho previsão de entrega para esse pedido. Posso acompanhar o status com você.";
    const message = humanizeTelegramReply(raw, "Tem previsão de quando chega?");
    expect(message).toContain("não tenho uma data prevista de entrega");
    expect(message).not.toMatch(/amanhã|R\$|PED-/i);
  });

});
