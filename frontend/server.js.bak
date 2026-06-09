const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'simi_erp',
  user: process.env.DB_USER || 'simi_user',
  password: process.env.DB_PASSWORD || 'simi_pass'
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/productos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al consultar productos:', error);
    res.status(500).json({ error: 'Error al consultar productos' });
  }
});

app.post('/api/productos', async (req, res) => {
  try {
    const { nombre, descripcion, precio, stock, categoria } = req.body;

    if (!nombre || !precio || !stock) {
      return res.status(400).json({
        error: 'Los campos nombre, precio y stock son obligatorios'
      });
    }

    const result = await pool.query(
      'INSERT INTO productos (nombre, descripcion, precio, stock, categoria) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [nombre, descripcion, precio, stock, categoria]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al registrar producto:', error);
    res.status(500).json({ error: 'Error al registrar producto' });
  }
});

app.listen(PORT, () => {
  console.log('Servidor ERP SIMI ejecutandose en puerto ' + PORT);
});
