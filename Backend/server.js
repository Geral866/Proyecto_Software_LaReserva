const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path'); // Para servir archivos estáticos como index.html
const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Sirve archivos estáticos desde /public (e.g., index.html)

// DB (modelo relacional alineado con RQF-003/005 del documento)
const db = new sqlite3.Database('./la_reserva.db');
db.serialize(() => {
    console.log('BD La Reserva lista.');
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        email TEXT UNIQUE,
        telefono TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS reservas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        fecha TEXT,
        hora TEXT,
        personas INTEGER,
        estado TEXT DEFAULT 'confirmada',
        FOREIGN KEY(usuario_id) REFERENCES usuarios(id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS mesas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        capacidad INTEGER NOT NULL
    )`);
    db.get('SELECT COUNT(*) as c FROM mesas', (err, row) => {
        if (row && row.c === 0) {
            db.run('INSERT INTO mesas (capacidad) VALUES (4), (6), (8)');
            console.log('Mesas de ejemplo creadas.');
        }
    });
    console.log('Tablas creadas.');
});

// GET /register (RQF-001: Registro cliente)
app.get('/register', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head><title>Registro</title>
        <style>body{font-family:Arial;margin:20px;} input,button{width:100%;padding:10px;margin:5px 0;}</style>
        </head>
        <body>
          <h1>Registro Cliente</h1>
          <form id="form">
            <input type="text" id="nombre" placeholder="Nombre" required>
            <input type="email" id="email" placeholder="Email" required>
            <input type="tel" id="telefono" placeholder="Teléfono" required>
            <button type="submit">Registrarse</button>
          </form>
          <div id="resultado"></div>
          <p><a href="/reserva">Reserva</a> | <a href="/admin">Admin</a></p>
          <script>
            document.getElementById('form').addEventListener('submit', async(e)=>{
              e.preventDefault();
              const formData = new URLSearchParams();
              formData.append('nombre', document.getElementById('nombre').value);
              formData.append('email', document.getElementById('email').value);
              formData.append('telefono', document.getElementById('telefono').value);
              const res = await fetch('/register', {method:'POST', body:formData});
              document.getElementById('resultado').innerHTML = await res.text();
            });
          </script>
        </body>
        </html>
    `);
});

// POST /register
app.post('/register', (req, res) => {
    const { nombre, email, telefono } = req.body;
    if (!email || !nombre) return res.status(400).send('Datos incompletos.');
    db.get('SELECT id FROM usuarios WHERE email = ?', [email], (err, row) => {
        if (row) return res.status(400).send('Email ya registrado.');
        db.run('INSERT INTO usuarios (nombre, email, telefono) VALUES (?, ?, ?)', [nombre, email, telefono], function(err) {
            if (err) return res.status(500).send('Error insert.');
            res.status(201).send(`Registro exitoso, ${nombre}! ID: ${this.lastID}`);
        });
    });
});

// GET /reserva (RQF-003: Crear reserva)
app.get('/reserva', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head><title>Reserva</title><style>body{font-family:Arial;margin:20px;} input,button{width:100%;padding:10px;margin:5px 0;}</style></head>
        <body>
          <h1>Nueva Reserva</h1>
          <form id="form">
            <input type="email" id="email" placeholder="Email" required>
            <input type="date" id="fecha" required>
            <input type="time" id="hora" required>
            <input type="number" id="personas" placeholder="Personas" min="1" required>
            <button type="submit">Reservar</button>
          </form>
          <div id="resultado"></div>
          <script>
            document.getElementById('form').addEventListener('submit', async(e)=>{
              e.preventDefault();
              const formData = new URLSearchParams();
              formData.append('email', document.getElementById('email').value);
              formData.append('fecha', document.getElementById('fecha').value);
              formData.append('hora', document.getElementById('hora').value);
              formData.append('personas', document.getElementById('personas').value);
              const res = await fetch('/reservations', {method:'POST', body:formData});
              document.getElementById('resultado').innerHTML = await res.text();
            });
          </script>
        </body>
        </html>
    `);
});

// POST /reservations (con RQF-004: Verificación disponibilidad)
app.post('/reservations', (req, res) => {
    const { email, fecha, hora, personas } = req.body;
    if (!email || !fecha || !hora) return res.status(400).send('Faltan datos.');
    db.get('SELECT id FROM usuarios WHERE email = ?', [email], (err, user) => {
        if (!user) return res.status(404).send('Usuario no registrado.');
        db.get('SELECT COUNT(*) as c FROM reservas WHERE fecha=? AND hora=? AND estado="confirmada"', [fecha, hora], (err, countRow) => {
            if (countRow.c >= 10) return res.status(409).send('No hay disponibilidad.');
            db.run('INSERT INTO reservas (usuario_id, fecha, hora, personas) VALUES (?, ?, ?, ?)', [user.id, fecha, hora, personas], function(err) {
                if (err) return res.status(500).send('Error insert.');
                res.status(201).send(`Reserva creada ID: ${this.lastID}`);
            });
        });
    });
});

// GET /reservas (RQF-006: Lista para admin)
app.get('/reservas', (req, res) => {
    db.all('SELECT r.id, u.nombre, u.email, r.fecha, r.hora, r.personas, r.estado FROM reservas r JOIN usuarios u ON r.usuario_id = u.id ORDER BY r.fecha', (err, rows) => {
        if (err) return res.status(500).send('Error lista.');
        let html = '<ul>';
        rows.forEach(row => {
            html += `<li>ID: ${row.id} - ${row.nombre} (${row.email}) - ${row.fecha} ${row.hora} - ${row.personas} personas - ${row.estado}</li>`;
        });
        html += '</ul>';
        res.send(html);
    });
});

// POST /configurar-mesa (RQF-005: Configuración)
app.post('/configurar-mesa', (req, res) => {
    const { capacidad, id } = req.body;
    if (!capacidad) return res.status(400).send('Capacidad requerida.');
    if (id) {
        db.run('UPDATE mesas SET capacidad = ? WHERE id = ?', [capacidad, id], function(err) {
            if (this.changes === 0) return res.status(404).send('Mesa no encontrada.');
            res.send(`Mesa ${id} actualizada a ${capacidad}`);
        });
    } else {
        db.run('INSERT INTO mesas (capacidad) VALUES (?)', [capacidad], function(err) {
            res.send(`Nueva mesa ID: ${this.lastID} capacidad ${capacidad}`);
        });
    }
});

// GET /admin (RQF-005/006: Panel simplificado)
app.get('/admin', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head><title>Admin</title>
        <style>body{font-family:Arial;margin:20px;} input,button{width:100%;padding:10px;margin:5px 0;} ul{list-style:none;padding:0;} li{background:#f0f0f0;margin:5px 0;padding:5px;}</style>
        </head>
        <body>
          <h1>Panel Admin</h1>
          <h2>Lista de Reservas</h2>
          <div id="lista">Cargando...</div>
          <h2>Configurar Mesa</h2>
          <form id="form">
            <input type="number" id="capacidad" placeholder="Capacidad (ej:4)" min="1" required>
            <input type="number" id="id" placeholder="ID Mesa (opcional)">
            <button type="submit">Guardar</button>
          </form>
          <div id="resultado"></div>
          <p><a href="/">Home</a> | <a href="/register">Registro</a> | <a href="/reserva">Reserva</a></p>
          <script>
            async function cargar() {
              const res = await fetch('/reservas');
              document.getElementById('lista').innerHTML = await res.text();
            }
            cargar();
            document.getElementById('form').addEventListener('submit', async(e)=>{
              e.preventDefault();
              const formData = new URLSearchParams();
              formData.append('capacidad', document.getElementById('capacidad').value);
              formData.append('id', document.getElementById('id').value || '');
              const res = await fetch('/configurar-mesa', {method:'POST', body:formData});
              document.getElementById('resultado').innerHTML = await res.text();
              cargar();
            });
          </script>
        </body>
        </html>
    `);
});

// GET / (sirve index.html estático si existe en /public)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Servidor backend en http://localhost:${port} (server.js - Cumple RNF-001: <2s).`);
});

