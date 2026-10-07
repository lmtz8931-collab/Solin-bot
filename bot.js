const express = require('express');
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('Bot Solin Activo ✅'));
app.get('/check', (req, res) => {
  const number = req.query.number;
  if(!number) return res.json({ error: 'Falta ?number=' });
  res.json({ number, alive: true, status: 'Verificado' });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Bot en puerto ' + PORT));
