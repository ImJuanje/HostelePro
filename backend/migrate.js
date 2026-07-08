const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

function hasColumn(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some(r => r.name === column);
}

try {
  console.log('Conectando a', dbPath);

  if (!hasColumn('pedidos', 'tipo')) {
    console.log('Añadiendo columna pedidos.tipo');
    db.prepare(`ALTER TABLE pedidos ADD COLUMN tipo TEXT DEFAULT 'local'`).run();
  } else console.log('pedidos.tipo ya existe');

  if (!hasColumn('pedidos', 'telefono')) {
    console.log('Añadiendo columna pedidos.telefono');
    db.prepare(`ALTER TABLE pedidos ADD COLUMN telefono TEXT DEFAULT ''`).run();
  } else console.log('pedidos.telefono ya existe');

  if (!hasColumn('pedidos', 'entregado_en')) {
    console.log('Añadiendo columna pedidos.entregado_en');
    db.prepare(`ALTER TABLE pedidos ADD COLUMN entregado_en TEXT`).run();
  } else console.log('pedidos.entregado_en ya existe');

  if (!hasColumn('pedido_items', 'hecho')) {
    console.log('Añadiendo columna pedido_items.hecho');
    db.prepare(`ALTER TABLE pedido_items ADD COLUMN hecho INTEGER DEFAULT 0`).run();
  } else console.log('pedido_items.hecho ya existe');

  console.log('Migración completada.');
} catch (err) {
  console.error('Error durante migración:', err);
  process.exit(1);
} finally {
  db.close();
}
