import { describe, expect, it, vi } from "vitest";
import { CAMILA_WELCOME, humanizeTelegramReply } from "../src/channels/telegram-copy.js";
import { handleTelegramUpdate } from "../src/channels/telegram.js";

function update(text: string) {
  return { message: { chat: { id: 144, type: "private" }, from: { id: 144 }, text } };
}

describe("Camila no Telegram", () => {
  it("/start apresenta a Camila sem omitir o aviso de demonstracao", async () => {
    const reply = vi.fn(async () => "Nao deveria ser chamado");
    const send = vi.fn(async () => {});
    await handleTelegramUpdate(update("/start"), { reply }, send);
    expect(send).toHaveBeenCalledWith(144, CAMILA_WELCOME);
    expect(CAMILA_WELCOME).toContain("sou a Camila");
    expect(CAMILA_WELCOME).toContain("pedidos fictícios");
    expect(reply).not.toHaveBeenCalled();
  });

  it("formata consulta em processamento", () => {
    expect(humanizeTelegramReply("O pedido PED-1001 está em processamento, conforme a Order API."))
      .toContain("PED-1001");
  });
  it("formata pedido enviado sem afirmar que pode cancelar", () => {
    expect(humanizeTelegramReply("O pedido PED-1002 está enviado, conforme a Order API."))
      .toContain("já foi enviado");
  });
  it("formata pedido cancelado", () => {
    expect(humanizeTelegramReply("O pedido PED-1003 está registrado como cancelado, conforme a Order API."))
      .toContain("consta como cancelado");
  });
  it("bloqueio nao cria confirmacao", () => {
    const msg = humanizeTelegramReply("O pedido PED-1002 não está em processamento, portanto não pode ser cancelado.");
    expect(msg).toContain("não posso cancelar");
  });
  it("pergunta confirmacao explicitamente, mantendo prazo", () => {
    const msg = humanizeTelegramReply('O pedido PED-1001 está em processamento. Confirma o cancelamento? Responda somente "sim" ou "não" em até 10 minutos.');
    expect(msg).toContain('somente "sim"');
    expect(msg).toContain('"não"');
    expect(msg).toContain("10 minutos");
    expect(msg).not.toContain("foi cancelado");
  });
  it("mensagem de nao nao sugere cancelamento concluido", () => {
    expect(humanizeTelegramReply("Entendido. Nenhum cancelamento foi solicitado à Order API."))
      .toContain("não vou cancelar");
  });
  it("sucesso apenas quando backend o informou", () => {
    expect(humanizeTelegramReply("Cancelamento do pedido PED-1003 confirmado pela Order API."))
      .toContain("foi confirmado");
  });
  it("falha ambigua nao inventa sucesso", () => {
    const msg = humanizeTelegramReply("Não foi possível confirmar se o cancelamento ocorreu. Não vou afirmar que foi concluído. Solicite atendimento humano para verificar antes de tentar novamente.");
    expect(msg).toContain("Não consegui confirmar");
    expect(msg).toContain("não te dar uma informação errada");
  });
  it("pedido de outra conta nao vaza estado", () => {
    const msg = humanizeTelegramReply("Não encontrei esse pedido na conta autenticada. Confira o número ou solicite atendimento humano.");
    expect(msg).not.toContain("enviado");
    expect(msg).not.toContain("em processamento");
  });
  it("mostra preco sem afirmar moeda nao comprovada", () => {
    const msg = humanizeTelegramReply("Produto 1: Fjallraven - Backpack. Preço de referência: 109.95 (moeda da Fake Store).");
    expect(msg).toContain("109,95");
    expect(msg).not.toContain("moeda usada pela loja de demonstração");
    expect(msg).not.toContain("R$");
  });
  it("texto nao reconhecido nao e reescrito nem recebe status inventado", () => {
    const raw = "Atendimento indisponível. Tente novamente mais tarde.";
    expect(humanizeTelegramReply(raw)).toBe(raw);
  });
  it("aplica o formato apenas depois do backend responder", async () => {
    const backend = "O pedido PED-1001 está em processamento, conforme a Order API.";
    const reply = vi.fn(async () => backend);
    const send = vi.fn(async () => {});
    await handleTelegramUpdate(update("Status PED-1001"), { reply }, send);
    expect(reply).toHaveBeenCalledWith("Status PED-1001", "telegram:demo-user-1:144");
    expect(send).toHaveBeenCalledWith(144, expect.stringContaining("PED-1001"));
  });
});
