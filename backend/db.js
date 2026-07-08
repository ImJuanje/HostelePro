const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database.sqlite'));

// Nota: si ya tienes una base de datos existente, ejecuta las ALTER TABLE
// indicadas en la documentación que acompaña este cambio para migrar la DB.

db.exec(`
  CREATE TABLE IF NOT EXISTS mesas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS categorias (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    orden INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria_id TEXT NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    precio REAL NOT NULL,
    alergenos TEXT DEFAULT '[]', -- JSON serializado, ej: ["gluten","huevo"]
    popular INTEGER DEFAULT 0,
    disponible INTEGER DEFAULT 1,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
  );

  /* Pedidos ahora contienen tipo (local | delivery) y telefono (solo para delivery).
     Mantener estado con valores: enviado | en_preparacion | listo | entregado */
  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mesa TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'local',
    telefono TEXT DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'enviado', -- enviado | en_preparacion | listo | entregado
    creado_en TEXT NOT NULL,
    entregado_en TEXT,
    total REAL NOT NULL
  );

  /* Los items ahora llevan un campo hecho (0/1) para marcar progreso por línea */
  CREATE TABLE IF NOT EXISTS pedido_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    precio_unitario REAL NOT NULL,
    cantidad INTEGER NOT NULL,
    notas TEXT DEFAULT '',
    hecho INTEGER DEFAULT 0,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  );
`);

module.exports = db;
