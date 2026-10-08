const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const app = express();
let sock;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' }),
        printQRInTerminal: true
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'open') console.log('✅ WhatsApp Conectado!');
        if(connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== 401;
            if(shouldReconnect) startBot();
        }
    });
}
startBot();

app.get('/', (req,res) => res.send('Bot Solin Activo - Ve a Logs en Render para escanear QR'));
app.get('/check', async (req,res) => {
    const number = req.query.number;
    if(!number) return res.json({ error: 'Falta?number=521...' });
    if(!sock) return res.json({ error: 'Bot iniciando, espera QR' });
    try {
        const jid = `${number}@s.whatsapp.net`;
        const [result] = await sock.onWhatsApp(jid);
        if(result?.exists) {
            res.json({ number, exists: true, jid: result.jid, status: 'TIENE WHATSAPP' });
        } else {
            res.json({ number, exists: false, status: 'NO TIENE WHATSAPP' });
        }
    } catch(e) {
        res.json({ error: e.message });
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Servidor listo'));
