require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'cambiar_este_secreto';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
});

async function inicializarBaseDatos() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS productos (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      descripcion TEXT,
      precio NUMERIC(10,2) NOT NULL,
      stock INTEGER NOT NULL,
      categoria VARCHAR(80),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      mfa_secret TEXT,
      mfa_enabled BOOLEAN DEFAULT false,
      rol VARCHAR(30) DEFAULT 'usuario',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin12345';

  const usuarioExiste = await pool.query(
    'SELECT * FROM usuarios WHERE username = $1',
    [adminUser]
  );

  if (usuarioExiste.rows.length === 0) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const secret = speakeasy.generateSecret({
      name: `SIMI ERP (${adminUser})`
    });

    await pool.query(
      `INSERT INTO usuarios (username, password_hash, mfa_secret, mfa_enabled, rol)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminUser, passwordHash, secret.base32, false, 'admin']
    );

    console.log('Usuario administrador creado correctamente.');
    console.log('Usuario:', adminUser);
    console.log('MFA inicial pendiente de configuracion.');
  } else {
    const usuario = usuarioExiste.rows[0];

    if (!usuario.mfa_secret) {
      const secret = speakeasy.generateSecret({
        name: `SIMI ERP (${adminUser})`
      });

      await pool.query(
        'UPDATE usuarios SET mfa_secret = $1, mfa_enabled = false WHERE id = $2',
        [secret.base32, usuario.id]
      );

      console.log('Se actualizo el secreto MFA del usuario administrador.');
    }

    console.log('Usuario administrador ya existe.');
  }
}

function generarToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      username: usuario.username,
      rol: usuario.rol
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function generarPreAuthToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      username: usuario.username,
      stage: 'pre_mfa'
    },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
}

function obtenerToken(req) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  if (req.cookies && req.cookies.auth_token) {
    return req.cookies.auth_token;
  }

  return null;
}

function requiereAuth(req, res, next) {
  const token = obtenerToken(req);

  if (!token) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Acceso denegado. Token requerido.' });
    }

    return res.redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Token invalido o expirado.' });
    }

    return res.redirect('/login');
  }
}

app.get('/', (req, res) => {
  res.redirect('/index.html');
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/index.html', requiereAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const resultado = await pool.query(
      'SELECT * FROM usuarios WHERE username = $1',
      [username]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contrasena incorrectos.' });
    }

    const usuario = resultado.rows[0];
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordValida) {
      return res.status(401).json({ error: 'Usuario o contrasena incorrectos.' });
    }

    const preAuthToken = generarPreAuthToken(usuario);

    res.cookie('pre_auth_token', preAuthToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      maxAge: 5 * 60 * 1000
    });

    if (!usuario.mfa_enabled) {
      const otpauthUrl = speakeasy.otpauthURL({
        secret: usuario.mfa_secret,
        label: `SIMI ERP (${usuario.username})`,
        issuer: 'Farmacias SIMI',
        encoding: 'base32'
      });

      const qrDataUrl = await qrcode.toDataURL(otpauthUrl);

      return res.json({
        requiereMfa: true,
        configurarMfa: true,
        qrDataUrl: qrDataUrl,
        mensaje: 'Escanea el QR con Google Authenticator o Microsoft Authenticator.'
      });
    }

    return res.json({
      requiereMfa: true,
      configurarMfa: false,
      mensaje: 'Ingrese el codigo MFA de 6 digitos.'
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno en autenticacion.' });
  }
});

app.post('/api/auth/mfa/verify', async (req, res) => {
  try {
    const { codigo } = req.body;
    const preAuthToken = req.cookies.pre_auth_token;

    if (!preAuthToken) {
      return res.status(401).json({ error: 'Sesion MFA expirada. Inicie sesion nuevamente.' });
    }

    let decoded;

    try {
      decoded = jwt.verify(preAuthToken, JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ error: 'Token temporal invalido o expirado.' });
    }

    if (decoded.stage !== 'pre_mfa') {
      return res.status(401).json({ error: 'Token temporal invalido.' });
    }

    const resultado = await pool.query(
      'SELECT * FROM usuarios WHERE id = $1',
      [decoded.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado.' });
    }

    const usuario = resultado.rows[0];

    const codigoValido = speakeasy.totp.verify({
      secret: usuario.mfa_secret,
      encoding: 'base32',
      token: codigo,
      window: 1
    });

    if (!codigoValido) {
      return res.status(401).json({ error: 'Codigo MFA incorrecto.' });
    }

    if (!usuario.mfa_enabled) {
      await pool.query(
        'UPDATE usuarios SET mfa_enabled = true WHERE id = $1',
        [usuario.id]
      );
    }

    const tokenFinal = generarToken(usuario);

    res.clearCookie('pre_auth_token');

    res.cookie('auth_token', tokenFinal, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      maxAge: 60 * 60 * 1000
    });

    res.json({
      mensaje: 'Autenticacion MFA exitosa.',
      token: tokenFinal
    });

  } catch (error) {
    console.error('Error verificando MFA:', error);
    res.status(500).json({ error: 'Error interno validando MFA.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.clearCookie('pre_auth_token');
  res.json({ mensaje: 'Sesion cerrada correctamente.' });
});

app.get('/api/auth/me', requiereAuth, (req, res) => {
  res.json({
    usuario: req.usuario.username,
    rol: req.usuario.rol
  });
});

app.get('/api/productos', requiereAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al consultar productos:', error);
    res.status(500).json({ error: 'Error al consultar productos' });
  }
});

app.post('/api/productos', requiereAuth, async (req, res) => {
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

inicializarBaseDatos()
  .then(() => {
    app.listen(PORT, () => {
      console.log('Servidor ERP SIMI con JWT y MFA ejecutandose en puerto ' + PORT);
    });
  })
  .catch((error) => {
    console.error('Error inicializando la base de datos:', error);
    process.exit(1);
  });
