# Escáner Bingo

App instalable (PWA) para capturar credenciales al **Padrón Compromiso** del Bingo electoral.
Baldemar Maza León · Consultoría & Inteligencia Electoral

- Lee la credencial con el OCR de Google (vía Apps Script) y, sin señal, con el del teléfono (Tesseract).
- Valida la sección contra el municipio y avisa de posibles repetidos.
- Sin señal guarda las capturas en el teléfono y las envía solas al volver la señal.
- Los datos van a los Sheets de `paquete_123` (cuenta eleccioneschiapas2027) a través de la API de Apps Script
  (proyecto **Escaner Bingo**, función `doPost`). La URL de esa API va en `config.js`.

Link para cada capturista: `https://<sitio>.onrender.com/?m=<Municipio_con_guiones_bajos>` + el código del municipio
(Sheet "Códigos escáner Bingo").
