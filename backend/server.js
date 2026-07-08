const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' } // en producción, restringir al dominio
});

// ---------- Consultas preparadas ----------
const insertarPedido = db.prepare(
  `INSERT INTO pedidos (mesa, tipo, telefono, estado, creado_en, total) VALUES (?, ?, ?, 'enviado', datetime('now'), ?)`
);
const insertarItem = db.prepare(
  `INSERT INTO pedido_items (pedido_id, nombre, precio_unitario, cantidad, notas, hecho) VALUES (?, ?, ?, ?, ?, ?)`
);
const actualizarEstadoPedido = db.prepare(`UPDATE pedidos SET estado = ? WHERE id = ?`);
const marcarItemHecho = db.prepare(`UPDATE pedido_items SET hecho = ? WHERE id = ?`);
const pedidosPendientes = db.prepare(
  `SELECT * FROM pedidos WHERE estado != 'entregado' ORDER BY creado_en ASC`
);
const pedidosHistorico = db.prepare(
  `SELECT * FROM pedidos WHERE estado IN ('listo','entregado') ORDER BY creado_en DESC LIMIT 200`
);
const pedidosDeliveryPendientes = db.prepare(
  `SELECT * FROM pedidos WHERE tipo = 'delivery' AND estado != 'entregado' ORDER BY creado_en ASC`
);
const itemsDePedido = db.prepare(`SELECT * FROM pedido_items WHERE pedido_id = ?`);
const obtenerPedido = db.prepare(`SELECT * FROM pedidos WHERE id = ?`);

function obtenerPedidosPendientesConItems() {
  return pedidosPendientes.all().map(pedido => ({
    ...pedido,
    items: itemsDePedido.all(pedido.id)
  }));
}

function mapPedidoConItems(pedidoRow) {
  if (!pedidoRow) return null;
  return { ...pedidoRow, items: itemsDePedido.all(pedidoRow.id) };
}

// ---------- REST auxiliar ----------
app.get('/api/pedidos/pendientes', (req, res) => {
  res.json(obtenerPedidosPendientesConItems());
});

app.get('/api/pedidos/historico', (req, res) => {
  const rows = pedidosHistorico.all();
  res.json(rows.map(r => mapPedidoConItems(r)));
});

app.get('/api/pedidos/delivery', (req, res) => {
  const rows = pedidosDeliveryPendientes.all();
  res.json(rows.map(r => mapPedidoConItems(r)));
});

app.post('/api/pedidos/:id/entregado', (req, res) => {
  const { id } = req.params;
  try {
    const info = actualizarEstadoPedido.run('entregado', id);
    db.prepare(`UPDATE pedidos SET entregado_en = datetime('now') WHERE id = ?`).run(id);
    io.to('cocina').to('camarero').emit('pedido-actualizado', { id: Number(id), estado: 'entregado' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para actualizar un item por id (marcar hecho/no hecho)
app.post('/api/pedidos/:pedidoId/items/:itemId', (req, res) => {
  const { pedidoId, itemId } = req.params;
  const { hecho } = req.body;
  try {
    marcarItemHecho.run(hecho ? 1 : 0, itemId);
    // Reemitir cambio a clientes conectados
    io.to('cocina').to('camarero').emit('pedido-actualizado', { id: Number(pedidoId), itemId: Number(itemId), hecho: !!hecho });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mesas', (req, res) => {
  const mesas = db.prepare(`SELECT * FROM mesas ORDER BY numero ASC`).all();
  res.json(mesas);
});

app.get('/api/carta', (req, res) => {
  const categorias = db.prepare(`SELECT * FROM categorias ORDER BY orden ASC`).all();
  const productos = db.prepare(`SELECT * FROM productos WHERE disponible = 1`).all()
    .map(p => ({ ...p, alergenos: JSON.parse(p.alergenos || '[]') }));
  res.json({ categorias, productos });
});

app.get('/', (req, res) => {
  res.send('HosteléPro backend funcionando');
});

// ---------- Tiempo real ----------
io.on('connection', (socket) => {
  console.log('Conexión nueva:', socket.id);

  socket.on('unirse-cocina', () => {
    socket.join('cocina');
  });

  socket.on('unirse-camarero', () => {
    socket.join('camarero');
  });

  // La carta digital / camarero manda esto cuando confirma el pedido
  socket.on('nuevo-pedido', (datos) => {
    try {
      const { mesa, items, total, tipo = 'local', telefono = '' } = datos;

      if (!mesa || !Array.isArray(items) || items.length === 0) {
        socket.emit('error-pedido', { mensaje: 'Pedido incompleto' });
        return;
      }

      const resultado = insertarPedido.run(mesa, tipo, telefono || '', total);
      const pedidoId = resultado.lastInsertRowid;

      // Insertar cada item. Guardamos hecho como 0 por defecto.
      items.forEach(item => {
        insertarItem.run(pedidoId, item.nombre, item.precio, item.cantidad || 1, item.notas || '', 0);
      });

      // Recoger items desde la DB para incluir ids y estado 'hecho'
      const itemsGuardados = itemsDePedido.all(pedidoId);

      const pedidoCompleto = {
        id: pedidoId,
        mesa,
        items: itemsGuardados,
        total,
        tipo,
        telefono,
        estado: 'enviado',
        creado_en: new Date().toISOString()
      };

      io.to('cocina').to('camarero').emit('pedido-recibido', pedidoCompleto);
      socket.emit('pedido-confirmado', { id: pedidoId, mesa });

    } catch (error) {
      console.error('Error al guardar pedido:', error);
      socket.emit('error-pedido', { mensaje: 'No se pudo procesar el pedido' });
    }
  });

  // Cocina marca un pedido como listo (se puede emitir sólo cuando todos los items estén hechos)
  socket.on('pedido-listo', (datos) => {
    const { id, mesa } = datos;
    try {
      actualizarEstadoPedido.run('listo', id);
      io.to('cocina').to('camarero').emit('pedido-actualizado', { id, estado: 'listo' });
      io.to('camarero').emit('aviso-mesa', { mesa, mensaje: 'Pedido listo para servir' });
    } catch (err) {
      console.error('Error marcando listo', err);
    }
  });

  // Cocina / Camarero actualiza el estado de un item (vía socket)
  socket.on('pedido-item-actualizado', (datos) => {
    // datos: { id: pedidoId, itemId, hecho }
    try {
      const { id: pedidoId, itemId, hecho } = datos;
      marcarItemHecho.run(hecho ? 1 : 0, itemId);
      io.to('cocina').to('camarero').emit('pedido-actualizado', { id: pedidoId, itemId, hecho: !!hecho });
    } catch (err) {
      console.error('Error al actualizar item:', err);
    }
  });

  // Camarero marca un pedido como entregado (en mesa o recogida)
  socket.on('pedido-entregado', (datos) => {
    const { id } = datos;
    try {
      actualizarEstadoPedido.run('entregado', id);
      db.prepare(`UPDATE pedidos SET entregado_en = datetime('now') WHERE id = ?`).run(id);
      io.to('cocina').to('camarero').emit('pedido-actualizado', { id, estado: 'entregado' });
    } catch (err) {
      console.error('Error al marcar entregado:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Desconectado:', socket.id);
  });
});

const PUERTO = process.env.PORT || 3000;
server.listen(PUERTO, () => {
  console.log(`Servidor escuchando en puerto ${PUERTO}`);
});
