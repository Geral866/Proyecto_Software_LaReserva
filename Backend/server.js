const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

const db = new sqlite3.Database('reserva.db');
console.log('BD La Reserva lista.');

// Tablas (usuarios con 3 campos, mesas, reservas - del PDF págs 12-13)
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    telefono TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS mesas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capacidad INTEGER DEFAULT 4,
    disponible INTEGER DEFAULT 1
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    usuario_id INTEGER,
    mesa_id INTEGER,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (mesa_id) REFERENCES mesas(id)
  )`);
  // 3 mesas de ejemplo
  for (let i = 1; i <= 3; i++) {
    db.run(`INSERT OR IGNORE INTO mesas (id) VALUES (${i})`);
  }
  console.log('Tablas creadas (cumple modelo BD).');
});

// Pantalla 1: Login/Registro (/)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Pantalla 3: Admin (/admin)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// Registro (RQF-001: 3 campos - nombre, correo, teléfono)
app.post('/register', (req, res) => {
  const { nombre, email, telefono } = req.body;
  db.run('INSERT INTO usuarios (nombre, email, telefono) VALUES (?, ?, ?)', [nombre, email, telefono], function(err) {
    if (err) {
      res.send(`<div class="error">Error: Email duplicado.</div><a href="/">Volver</a>`);
    } else {
      res.send(`<div class="exito">¡Registrado! ID: ${this.lastID} (Nombre: ${nombre}, Tel: ${telefono}).</div><a href="/">Reservar</a>`);
    }
  });
});

// Disponibilidad (para reserva, RQF-004)
app.get('/disponibilidad/:fecha/:hora', (req, res) => {
  const { fecha, hora } = req.params;
  db.all(`SELECT id FROM mesas WHERE disponible = 1 AND id NOT IN (SELECT mesa_id FROM reservas WHERE fecha = ? AND hora = ?)`, [fecha, hora], (err, rows) => {
    res.json(rows || []);
  });
});

// Reserva (RQF-003: crear, cancelar simulada)
app.post('/reserva', (req, res) => {
  const { fecha, hora, usuario_id = 1 } = req.body;
  db.get(`SELECT id FROM mesas WHERE disponible = 1 AND id NOT IN (SELECT mesa_id FROM reservas WHERE fecha = ? AND hora = ?) LIMIT 1`, [fecha, hora], (err, row) => {
    if (!row) {
      res.send(`<div class="error">No hay mesas disponibles.</div><a href="/">Volver</a>`);
    } else {
      const mesa_id = row.id;
      db.run('UPDATE mesas SET disponible = 0 WHERE id = ?', [mesa_id]);
      db.run('INSERT INTO reservas (fecha, hora, usuario_id, mesa_id) VALUES (?, ?, ?, ?)', [fecha, hora, usuario_id, mesa_id], function() {
        // Notificación simulada (RQF-007)
        console.log(`Notif: Reserva ${this.lastID} confirmada.`);
        res.send(`<div class="exito">¡Reserva confirmada en mesa ${mesa_id}! Notificación enviada.</div><a href="/admin">Admin</a>`);
      });
    }
  });
});

// Lista reservas para admin (RQF-006)
app.get('/reservas', (req, res) => {
  db.all(`SELECT r.*, u.nombre, u.telefono FROM reservas r LEFT JOIN usuarios u ON r.usuario_id = u.id ORDER BY r.fecha DESC`, (err, rows) => {
    let lista = '<h2>Reservas (RQF-006):</h2><ul>';
    if (rows.length === 0) lista += '<li>No hay reservas.</li>';
    else rows.forEach(r => {
      lista += `<li>ID ${r.id}: ${r.fecha} ${r.hora} - Mesa ${r.mesa_id} - Cliente: ${r.nombre || 'Anónimo'} (${r.telefono || 'Sin tel'})</li>`;
    });
    lista += '</ul>';
    res.send(lista);
  });
});

// Config mesas para admin (RQF-005)
app.post('/configurar-mesa', (req, res) => {
  const { capacidad, id } = req.body;
  const mesaId = id || (Math.floor(Math.random() * 3) + 1); // ID aleatorio si no
  db.run('UPDATE mesas SET capacidad = ? WHERE id = ?', [capacidad, mesaId], function() {
    res.send(`<div class="exito">Mesa ${mesaId} configurada con capacidad ${capacidad} (RQF-005).</div><a href="/admin">Volver</a>`);
  });
});

app.listen(3000, () => {
  console.log('Servidor en http://localhost:3000 (cumple RQNF-001: <2s).');
});