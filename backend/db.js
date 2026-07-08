const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.sqlite'));

// Esquema mínimo para Fase 2. El catálogo de productos sigue viviendo
// en el frontend (CONFIG de carta-digital.html) hasta que montemos el
// panel de administración — por eso pedido_items guarda nombre/precio
// directamente en vez de referenciar una tabla productos.
db.exec(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mesa TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'enviado', -- enviado | en_preparacion | listo | entregado
    creado_en TEXT NOT NULL,
    total REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pedido_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    precio_unitario REAL NOT NULL,
    cantidad INTEGER NOT NULL,
    notas TEXT DEFAULT '',
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  );
`);

module.exports = db;
