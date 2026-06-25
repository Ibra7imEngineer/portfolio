// Serverless handler: proxies requests to Google's Generative Language (Gemini)
// Expects `process.env.GEMINI_API_KEY` to be set on the server.

const TIMEOUT_MS = 30000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rawBody = req.body;
    const body =
      typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody || {};
    const userMessage = body.message;
    const botName = body.botName || "";

    if (!userMessage || typeof userMessage !== "string") {
      return res
        .status(400)
        .json({ error: "Missing `message` in request body" });
    }

    const apiKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GROQ_API_KEY not set");
      return res
        .status(500)
        .json({ error: "Server misconfiguration: missing GROQ_API_KEY" });
    }

    const systemPrompt = `أنت مساعد ذكي لمهندس محترف. أجب بشكل مهني، مختصر، وودود.`;

    const genUrl = "https://api.groq.com/openai/v1/chat/completions";

    const genRequest = {
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 400,
      temperature: 0.25,
      top_p: 0.9,
      n: 1,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const upstream = await fetch(genUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(genRequest),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => "");
      console.error("Groq upstream error", upstream.status, txt);
      return res.status(502).json({
        error: "Upstream error from Groq",
        status: upstream.status,
        details: txt,
      });
    }

    const result = await upstream.json();
    const reply =
      result?.choices?.[0]?.message?.content ||
      result?.candidates?.[0]?.content?.[0]?.text ||
      result?.candidates?.[0]?.content?.[0]?.parts?.[0]?.text ||
      result?.candidates?.[0]?.content?.text ||
      result?.output?.[0]?.content?.[0]?.text ||
      "";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("Error in /api/chat handler", err);
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "Request to Gemini timed out" });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};
