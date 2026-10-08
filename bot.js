const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');

const app = express();
let sock;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if(qr) {
            console.log('--- ESCANEA ESTE QR ---');
            qrcode.generate(qr, { small: true });
        }

        if(connection === 'open') {
            console.log('✅ WhatsApp Conectado!');
        }

        if(connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
            console.log('Conexion cerrada, reconectando...', shouldReconnect);
            if(shouldReconnect) startBot();
        }
    });
}
startBot();

app.get('/', (req,res) => res.send('Bot Solin Activo - Ve a Logs para QR. Luego usa /check?number=521...'));

app.get('/check', async (req,res) => {
    const number = req.query.number;
    if(!number) return res.json({ error: 'Falta?number=521...' });
    if(!sock) return res.json({ error: 'Bot iniciando, espera 10 seg' });
    try {
        const jid = number.includes('@')? number : `${number}@s.whatsapp.net`;
        const [result] = await sock.onWhatsApp(jid);
        if(result?.exists) {
            res.json({ number, exists: true, jid: result.jid, status: 'TIENE WHATSAPP ✅' });
        } else {
            res.json({ number, exists: false, status: 'NO TIENE WHATSAPP ❌' });
        }
    } catch(e) {
        res.json({ error: e.message });
    }
});

app.listen(process.env.PORT || 10000, () => console.log('Servidor listo'));
