const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const META_TOKEN = process.env.META_TOKEN;
const PHONE_ID = process.env.PHONE_ID;
const CW_URL = process.env.CW_URL;
const CW_TOKEN = process.env.CW_TOKEN;
const CW_INBOX = process.env.CW_INBOX;
const CW_ACCOUNT = process.env.CW_ACCOUNT;

// Verificação do webhook pela Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado!");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Recebe mensagens do WhatsApp
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const msg = change?.messages?.[0];
    if (!msg) return;

    const from = msg.from;
    const text = msg.text?.body || "[mídia]";
    const name = change.contacts?.[0]?.profile?.name || from;

    console.log(`Mensagem de ${name} (${from}): ${text}`);

    // 1. Criar contato no Chatwoot
    let contactId;
    try {
      const res1 = await axios.post(
        `${CW_URL}/api/v1/accounts/${CW_ACCOUNT}/contacts`,
        { name, phone_number: `+${from}` },
        { headers: { api_access_token: CW_TOKEN } }
      );
      contactId = res1.data.id;
    } catch (e) {
      // Contato já existe — buscar pelo telefone
      const res2 = await axios.get(
        `${CW_URL}/api/v1/accounts/${CW_ACCOUNT}/contacts/search?q=${from}`,
        { headers: { api_access_token: CW_TOKEN } }
      );
      contactId = res2.data.payload[0]?.id;
    }

    // 2. Criar conversa no Chatwoot
    const conv = await axios.post(
      `${CW_URL}/api/v1/accounts/${CW_ACCOUNT}/conversations`,
      {
        contact_id: contactId,
        inbox_id: parseInt(CW_INBOX),
        additional_attributes: { phone: from }
      },
      { headers: { api_access_token: CW_TOKEN } }
    );
    const convId = conv.data.id;

    // 3. Adicionar mensagem na conversa
    await axios.post(
      `${CW_URL}/api/v1/accounts/${CW_ACCOUNT}/conversations/${convId}/messages`,
      { content: text, message_type: "incoming", private: false },
      { headers: { api_access_token: CW_TOKEN } }
    );

    console.log(`Conversa ${convId} criada no Chatwoot`);
  } catch (e) {
    console.error("Erro:", e.response?.data || e.message);
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Webhook rodando!")
);
