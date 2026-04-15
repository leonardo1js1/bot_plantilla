const DEFAULT_ULTRAMSG_API_BASE_URL = "https://api.ultramsg.com";

function serializeForLog(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function getUltraMsgConfig() {
  return {
    instanceId: String(process.env.ULTRAMSG_INSTANCE_ID || "").trim(),
    token: String(process.env.ULTRAMSG_TOKEN || "").trim(),
    apiBaseUrl: String(process.env.ULTRAMSG_API_BASE_URL || DEFAULT_ULTRAMSG_API_BASE_URL)
      .trim()
      .replace(/\/$/, "")
  };
}

function hasUltraMsgConfig() {
  const { instanceId, token } = getUltraMsgConfig();
  return Boolean(instanceId && token);
}

function extractUltraMsgChatId(body) {
  const candidates = [body?.data?.chatId, body?.message?.chatId, body?.data?.from];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const chatId = candidate.trim();

    if (chatId) {
      return chatId;
    }
  }

  return "";
}

function extractUltraMsgMessage(body) {
  const eventType = String(body?.event_type || "").trim();
  const data = body?.data;

  if (!data) {
    return null;
  }

  if (eventType && eventType !== "message_received") {
    return null;
  }

  if (data.fromMe) {
    return null;
  }

  if (String(data.type || "").trim().toLowerCase() !== "chat") {
    return null;
  }

  const userId = extractUltraMsgChatId(body);
  const text = String(data.body || "").trim();

  if (!userId || !text) {
    return null;
  }

  const extractedMessage = {
    userId,
    text
  };

  console.log(
    `[DEBUG][UltraMsg][extract] extractUltraMsgMessage() extracted: ${serializeForLog(extractedMessage)}`
  );

  return extractedMessage;
}

function mapOutboundMessageToText(message) {
  if (!message) {
    return "";
  }

  if (message.type === "document") {
    return [String(message.text || "").trim(), String(message.url || "").trim()]
      .filter(Boolean)
      .join("\n");
  }

  return String(message.text || "").trim();
}

async function sendUltraMsgTextMessage({ to, body }) {
  const { instanceId, token, apiBaseUrl } = getUltraMsgConfig();

  if (!instanceId || !token) {
    throw new Error("Faltan las variables ULTRAMSG_INSTANCE_ID o ULTRAMSG_TOKEN.");
  }

  const requestBody = new URLSearchParams();
  requestBody.set("token", token);
  requestBody.set("to", String(to || "").trim());
  requestBody.set("body", String(body || "").trim());

  const response = await fetch(
    `${apiBaseUrl}/${encodeURIComponent(instanceId)}/messages/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: requestBody
    }
  );

  const rawResponse = await response.text();
  let parsedResponse = rawResponse;

  try {
    parsedResponse = JSON.parse(rawResponse);
  } catch (error) {
    parsedResponse = rawResponse;
  }

  if (!response.ok) {
    throw new Error(
      `UltraMsg respondio con ${response.status}: ${
        typeof parsedResponse === "string" ? parsedResponse : JSON.stringify(parsedResponse)
      }`
    );
  }

  return parsedResponse;
}

async function sendUltraMsgMessages({ to, outboundMessages }) {
  const messagesAsText = outboundMessages
    .map(mapOutboundMessageToText)
    .filter(Boolean);

  const providerResults = [];

  for (const messageText of messagesAsText) {
    const providerResult = await sendUltraMsgTextMessage({
      to,
      body: messageText
    });

    providerResults.push(providerResult);
  }

  return providerResults;
}

module.exports = {
  extractUltraMsgChatId,
  extractUltraMsgMessage,
  getUltraMsgConfig,
  hasUltraMsgConfig,
  sendUltraMsgMessages
};
