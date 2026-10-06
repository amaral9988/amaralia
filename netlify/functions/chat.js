// Netlify Function: recebe as mensagens do site e chama a API gratuita do Google Gemini.
// A chave fica guardada no Netlify (variável GEMINI_API_KEY), nunca no navegador.

const SYSTEM_PROMPT =
  "Você é a AmaraL IA, uma assistente simpática e objetiva. " +
  "Responda sempre em português do Brasil, em textos curtos e claros, " +
  "pensados para quem lê no celular.";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { reply: "Método não permitido." });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(500, { reply: "Chave da API não configurada no Netlify." });

  let messages;
  try {
    messages = JSON.parse(event.body).messages;
  } catch {
    return json(400, { reply: "Requisição inválida." });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return json(400, { reply: "Nenhuma mensagem enviada." });
  }

  // Limita o histórico e converte para o formato do Gemini (assistant -> model)
  const contents = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.slice(0, 4000) }],
    }));

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { maxOutputTokens: 1000 },
        }),
      }
    );

    if (res.status === 429) {
      return json(429, { reply: "Muitas mensagens em pouco tempo. Aguarde um instante e tente de novo." });
    }
    if (!res.ok) {
      const raw = await res.text();
      console.error("Erro da API:", res.status, raw);
      let msg = "";
      try { msg = JSON.parse(raw).error.message; } catch (_) {}
      return json(502, { reply: `A IA não respondeu (erro ${res.status}): ${String(msg).slice(0, 200)}` });
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const reply = parts.map((p) => p.text || "").join("");

    return json(200, { reply: reply || "Não consegui gerar uma resposta." });
  } catch (err) {
    console.error(err);
    return json(500, { reply: "Erro ao falar com a IA." });
  }
};
