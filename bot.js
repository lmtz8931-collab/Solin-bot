const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');

const app = express();
let sock;

// 👇👇👇 CAMBIA ESTE NUMERO POR TU NUMERO CON LADA 👇👇👇
// Ejemplo: 5218134567890 (52 + 1 + tu numero de 10 digitos)
const TU_NUMERO = "528141407448";
const fs = require('fs');
if (fs.existsSync('./auth') && !fs.existsSync('./auth/creds.json')) { /* limpia */ }
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    sock = makeWASocket({
        auth: state,
        logger: P({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    // Si no está registrado, pide código de vinculación
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                // Limpia el numero, solo digitos
                const num = TU_NUMERO.replace(/[^0-9]/g, '');
                const code = await sock.requestPairingCode(num);
                console.log('================================');
                console.log(` TU CODIGO DE VINCULACION ES: ${code} `);
                console.log('================================');
                console.log(` Ve a WhatsApp > Dispositivos vinculados > Vincular con numero de telefono`);
                console.log(` Y escribe el codigo: ${code}`);
            } catch (e) {
                console.log('Error pidiendo codigo:', e.message);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

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

app.get('/', (req,res) => res.send('Bot Solin Activo - Ve a Logs para ver tu CODIGO. Luego usa /check?number=521...'));

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
