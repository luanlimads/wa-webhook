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

const api = axios.create({
  baseURL: `${CW_URL}/api/v1/accounts/${CW_ACCOUNT}`,
  headers: { api_access_token: CW_TOKEN, "Content-Type": "application/json" }
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN)
    return res.status(200).send(challenge);
  res.sendStatus(403);
});

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

    // 1. Buscar contato existente
    let contactId;
    try {
      const search = await api.get(`/contacts/search?q=%2B${from}&include_contacts=true`);
      const found = search.data?.payload?.[0];
      if (found) {
        contactId = found.id;
        console.log(`Contato existente: ${contactId}`);
      }
    } catch(e) {
      console.log("Contato não encontrado, criando...");
    }

    // 2. Criar contato se não existir
    if (!contactId) {
      const created = await api.post(`/contacts`, {
        name,
        phone_number: `+${from}`
      });
      contactId = created.data?.id;
      console.log(`Contato criado: ${contactId}`);
    }

    // 3. Criar conversa
    const conv = await api.post(`/conversations`, {
      contact_id: contactId,
      inbox_id: parseInt(CW_INBOX)
    });
    const convId = conv.data?.id;
    console.log(`Conversa criada: ${convId}`);

    // 4. Adicionar mensagem
    await api.post(`/conversations/${convId}/messages`, {
      content: text,
      message_type: "incoming",
      private: false
    });

    console.log(`Mensagem adicionada na conversa ${convId}`);
  } catch (e) {
    console.error("Erro:", JSON.stringify(e.response?.data) || e.message);
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Webhook rodando!"));
