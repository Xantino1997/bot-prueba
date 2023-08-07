const express = require('express');
const app = express();
const port = 3000;

// Ruta GET para responder con "Hola"
app.get('/saludo', (req, res) => {
  res.send('Hola');
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor en funcionamiento en http://localhost:${port}`);
});
