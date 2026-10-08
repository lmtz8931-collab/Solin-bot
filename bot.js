const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const app = express();

async function startBot(){
 console.log('Iniciando bot...');
 const { state, saveCreds } = await useMultiFileAuthState('auth');
 const sock = makeWASocket({
   auth: state,
   logger: P({level:'silent'}),
   browser: ['SOLIN','Chrome','1.0'],
   printQRInTerminal: false
 });
 sock.ev.on('creds.update', saveCreds);

 sock.ev.on('connection.update', async (u)=>{
   console.log('Connection:', u.connection);
   if(u.qr) console.log('QR generado, ignorando...');
   if(u.connection === 'open'){
     console.log('✅ CONECTADO EXITOSAMENTE');
   }
   if(u.connection === 'close'){
     let reason = u.lastDisconnect?.error?.output?.statusCode;
     console.log('Cerrado:', u.lastDisconnect?.error?.message);
     if(reason !== DisconnectReason.loggedOut) {
       console.log('Reintentando en 5s...');
       setTimeout(startBot, 5000);
     }
   }
 });

 if(!state.creds.registered){
   await new Promise(r=>setTimeout(r, 3000));
   try{
     const num = '5218141407449';
     let code = await sock.requestPairingCode(num);
     console.log('============================');
     console.log('CODIGO: ' + code);
     console.log('============================');
   }catch(e){ 
     console.log('Error codigo: ' + e.message);
     console.log('Reintentando codigo en 10s...');
     setTimeout(async()=>{
       try{
         let code = await sock.requestPairingCode('5218141407449');
         console.log('CODIGO REINTENTO: ' + code);
       }catch(e2){ console.log('Fallo 2do intento: ' + e2.message) }
     }, 10000);
   }
 }
}
startBot();
app.get('/',(req,res)=>res.send('BOT ON'));
app.listen(process.env.PORT||10000,()=>console.log('Web en puerto 10000'));
