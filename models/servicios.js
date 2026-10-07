import { db } from "../db.js";

export const TServicios = async () => {
    const serviciosQuery = `
        CREATE TABLE IF NOT EXISTS servicios (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(150) NOT NULL,
            tipo VARCHAR(50) NOT NULL,
            fecha_contratacion DATE DEFAULT CURRENT_DATE,
            fecha_expiracion DATE NOT NULL,
            costo_renovacion NUMERIC(10,2) DEFAULT 0,
            estado VARCHAR(30) DEFAULT 'activo',
            fk_id_user INT NOT NULL,
            FOREIGN KEY (fk_id_user) REFERENCES users(id) ON DELETE CASCADE
        );
    `;

    try {
        await db.query(serviciosQuery);
        console.log("Tabla servicios creada satisfactoriamente");
    } catch (error) {
        console.log("Error al crear tabla servicios:", error);
    }
};