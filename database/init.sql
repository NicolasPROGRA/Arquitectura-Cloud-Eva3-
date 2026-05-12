CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    precio NUMERIC(10,2) NOT NULL,
    stock INTEGER NOT NULL,
    categoria VARCHAR(80),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO productos (nombre, descripcion, precio, stock, categoria)
VALUES 
('Paracetamol 500mg', 'Analgésico y antipirético', 1990, 100, 'Medicamentos'),
('Alcohol Gel 70%', 'Producto de higiene personal', 2490, 80, 'Higiene'),
('Mascarillas Clínicas', 'Caja de mascarillas desechables', 3990, 50, 'Insumos');
