/**
 * Linguagem conversacional da Camila no Telegram.
 * Traducoes de respostas factuais so sao feitas quando o formato confiavel
 * do backend coincide com um contrato conhecido. Nao usa LLM para reescrever
 * cancelamentos, nao infere status e nao aceita dados de usuario como fatos.
 */
export const CAMILA_WELCOME = [
  "Oi! Eu sou a Camila 😊",
  "Posso te ajudar com pedidos, produtos ou uma solicitação de cancelamento. O que você precisa?",
  "",
  "Só um aviso: este é um ambiente de demonstração com pedidos fictícios e encaminhamentos simulados."
].join("\n");

const ORDER_ID = "(PED-[0-9]{4})";
const STATUS = new RegExp(`^O pedido ${ORDER_ID} está (em processamento|enviado|registrado como cancelado), conforme a Order API\\.$`);
const CANNOT_CANCEL = new RegExp(`^O pedido ${ORDER_ID} não está em processamento, portanto não pode ser cancelado\\.$`);
const ASK_CONFIRMATION = new RegExp(`^O pedido ${ORDER_ID} está em processamento\\. Confirma o cancelamento\\? Responda somente "sim" ou "não" em até 10 minutos\\.$`);
const CANCEL_SUCCESS = new RegExp(`^Cancelamento do pedido ${ORDER_ID} confirmado pela Order API\\.$`);
const CANCEL_STATE_CHANGED = new RegExp(`^O pedido ${ORDER_ID} não pode mais ser cancelado\\. Seu estado pode ter mudado\\.$`);
const PRODUCT = /^Produto ([1-9][0-9]*): ([^\r\n]+)\. Preço de referência: ([0-9]+\.[0-9]{2}) \(moeda da Fake Store\)\.$/;

const knownReplies: Readonly<Record<string, string>> = {
  "Entendido. Nenhum cancelamento foi solicitado à Order API.":
    "Tudo bem, não vou cancelar. Quer ver alguma outra coisa?",
  "Certo. Não vou solicitar o cancelamento do pedido.":
    "Tudo certo, não vou cancelar esse pedido.",
  "Não há cancelamento pendente.":
    "Não tenho nenhum cancelamento aguardando sua confirmação agora.",
  "Não há um cancelamento pendente para confirmar. Informe o pedido que deseja cancelar.":
    "Não encontrei nenhum cancelamento aguardando confirmação. Se quiser fazer um pedido novo, me diga o número dele.",
  "A confirmação expirou ou já foi utilizada. Solicite o cancelamento novamente, se desejar.":
    "Essa confirmação já expirou ou foi usada. Se ainda quiser cancelar, é só me pedir novamente.",
  "Não encontrei esse pedido na conta autenticada. Confira o número ou solicite atendimento humano.":
    "Não consegui encontrar esse pedido entre os disponíveis aqui. Pode conferir o número pra mim?",
  "Não encontrei esse pedido na conta autenticada. Nenhum cancelamento foi solicitado.":
    "Não encontrei esse pedido. Pode conferir o número? Fica tranquilo que não solicitei nenhum cancelamento.",
  "Não encontrei esse pedido na conta autenticada. Nenhum cancelamento foi confirmado.":
    "Não consegui localizar esse pedido, então não há cancelamento confirmado.",
  "Para solicitar o cancelamento, informe um único pedido no formato PED-0000.":
    "Me passa só o número do pedido que você quer cancelar, por exemplo PED-1001?",
  "Posso consultar pedidos pelo código PED-0000 ou produtos pelo ID. Qual deseja consultar?":
    "Posso ver o status de um pedido, conferir um produto ou te ajudar a pedir um cancelamento. O que você gostaria de fazer?",
  "Não foi possível confirmar se o cancelamento ocorreu. Não vou afirmar que foi concluído. Solicite atendimento humano para verificar antes de tentar novamente.":
    "Não consegui confirmar se o cancelamento aconteceu. Prefiro não te dar uma informação errada. O mais seguro é verificar com o atendimento humano antes de tentar novamente.",
  "Ainda não tenho previsão de entrega para esse pedido. Posso acompanhar o status com você.":
    "Ainda não tenho uma data prevista de entrega, mas posso acompanhar o andamento do pedido com você.",
  "Não consigo realizar essa operação automaticamente. Posso oferecer atendimento humano.":
    "Essa parte eu não consigo resolver por aqui. Se quiser, posso te orientar sobre o atendimento humano da demonstração.",
  "O atendimento automático está temporariamente indisponível. Posso oferecer atendimento humano.":
    "Estou com dificuldade para consultar essa informação agora. Podemos tentar de novo daqui a pouco ou seguir com a opção de atendimento humano demonstrativo.",
  "Não foi possível confirmar o status do pedido agora. Posso oferecer atendimento humano.":
    "Não consegui consultar o status nesse momento. Prefiro não arriscar uma informação incorreta. Quer tentar mais tarde?",
  "Não consegui confirmar os dados do produto agora. Posso oferecer atendimento humano.":
    "Não consegui verificar os detalhes desse produto agora. Podemos tentar de novo mais tarde.",
  "Tudo certo. Nenhum encaminhamento humano foi registrado.":
    "Sem problema, não registrei o pedido de atendimento humano.",
  "A confirmação de atendimento humano expirou ou já foi utilizada. Solicite novamente.":
    "Essa confirmação de atendimento humano expirou ou já foi usada. Se quiser, pode me pedir outra vez.",
};

function normalizeUserMessage(text: string): string {
  return text.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.!?,]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function isFollowUp(text: string): boolean {
  const input = normalizeUserMessage(text);
  // Quando a pessoa informa um ID explicitamente, nao e uma retomada implicita.
  if (/\bPED-[0-9]{4}\b/i.test(text) || /\b(?:produto|item)\s*(?:id\s*)?#?[1-9][0-9]*\b/i.test(text)) {
    return false;
  }
  return /\b(dele|dela|ele|ela|desse pedido|desse produto)\b/.test(input)
    || /^(e |mas |entao )/.test(input);
}

function asksOnlyPrice(text: string): boolean {
  const input = normalizeUserMessage(text);
  return /\b(preco|valor|custa|custando|quanto custa|quanto sai)\b/.test(input);
}

// Alteramos apenas a apresentacao decimal brasileira, nunca convertemos moeda.
function showPrice(raw: string): string {
  return raw.replace(".", ",");
}

// Varia levemente a frase conforme a pergunta, sem aleatoriedade ou estado de sessao.
function variant(input: string, count: number): number {
  const normalized = normalizeUserMessage(input);
  let sum = 0;
  for (const char of normalized) sum = (sum * 31 + char.codePointAt(0)!) >>> 0;
  return sum % count;
}

const GENERIC_REPLIES = new Set([
  "Posso consultar pedidos pelo código PED-0000 ou produtos pelo ID. Qual deseja consultar?",
  "Não consigo realizar essa operação automaticamente. Posso oferecer atendimento humano."
]);

/** `userMessage` personaliza somente a forma de falar, nunca o fato verificado. */
export function humanizeTelegramReply(raw: string, userMessage = ""): string {
  const status = STATUS.exec(raw);
  if (status) {
    const [, id, state] = status;
    if (state === "em processamento") {
      if (isFollowUp(userMessage)) return "Ainda está em processamento.";
      if (/\b(consegue|poderia consultar|pode ver|pode consultar)\b/.test(normalizeUserMessage(userMessage))) {
        return `Consigo sim! O pedido ${id} ainda está em processamento.`;
      }
      const options = [
        `O pedido ${id} ainda está em processamento.`,
        `Por enquanto, o pedido ${id} segue em processamento.`
      ];
      return options[variant(userMessage || id!, options.length)]!;
    }
    if (state === "enviado") {
      return isFollowUp(userMessage)
        ? "Já foi enviado."
        : `O pedido ${id} já foi enviado.`;
    }
    return isFollowUp(userMessage)
      ? "Já consta como cancelado."
      : `O pedido ${id} consta como cancelado.`;
  }

  const blocked = CANNOT_CANCEL.exec(raw);
  if (blocked) {
    return `O pedido ${blocked[1]} não está mais em processamento, então não posso cancelar por aqui.`;
  }

  const confirmation = ASK_CONFIRMATION.exec(raw);
  if (confirmation) {
    return `O pedido ${confirmation[1]} ainda está em processamento e pode ser cancelado. Quer confirmar o cancelamento?\n\nResponda somente "sim" ou "não" em até 10 minutos.`;
  }

  const completed = CANCEL_SUCCESS.exec(raw);
  if (completed) return `Tudo certo! O cancelamento do pedido ${completed[1]} foi confirmado.`;

  const changed = CANCEL_STATE_CHANGED.exec(raw);
  if (changed) {
    return `O status do pedido ${changed[1]} mudou e agora não permite cancelamento. Não fiz nenhuma nova alteração.`;
  }

  const product = PRODUCT.exec(raw);
  if (product) {
    const [, , title, price] = product;
    const shownPrice = showPrice(price!);
    if (isFollowUp(userMessage)) return `Está listado por ${shownPrice}.`;
    if (asksOnlyPrice(userMessage)) return `O preço informado é ${shownPrice}.`;
    return `Claro! Encontrei ${title}. O preço informado é ${shownPrice}.`;
  }

  // Cumprimentos e agradecimentos nao podem mascarar falhas de negocio.
  // So substituimos as respostas genericas, jamais confirmacoes ou erros especificos.
  if (GENERIC_REPLIES.has(raw)) {
    const input = normalizeUserMessage(userMessage);
    if (/^(?:(?:oi|ola|e ai)(?: camila)?(?: tudo bem)?|bom dia(?: camila)?|boa tarde(?: camila)?|boa noite(?: camila)?)$/.test(input)) {
      return "Oi! Tudo bem? Me conta o que você precisa que eu vejo como te ajudar.";
    }
    if (/^(obrigado|obrigada|valeu|muito obrigado|muito obrigada|agradeco)$/.test(input)) {
      return "Imagina! Se precisar de mais alguma coisa, é só me chamar.";
    }
    if (/^(tchau|ate mais|ate logo)$/.test(input)) {
      return "Até mais! Quando precisar, estou por aqui.";
    }
  }

  // Caso desconhecido: preserva literalmente o retorno seguro do backend.
  return knownReplies[raw] ?? raw;
}
