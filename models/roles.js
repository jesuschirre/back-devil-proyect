import { db } from "../db.js";

export const TRoles = async () => {
    const queryRoles = `
        CREATE TABLE IF NOT EXISTS roles (
            id SERIAL PRIMARY KEY,
            nombre VARCHAR(50) NOT NULL UNIQUE,
            descripcion VARCHAR(255),
            created_at TIMESTAMP DEFAULT NOW()
        )
    `
    try {
        await db.query(queryRoles);
        console.log("Tabla roles creada satisfactoriamente");

        // Insertar roles por defecto si no existen
        const seedRoles = `
            INSERT INTO roles (nombre, descripcion)
            VALUES 
                ('admin', 'Administrador del sistema'),
                ('user', 'Usuario estándar')
            ON CONFLICT (nombre) DO NOTHING;
        `;
        await db.query(seedRoles);
        console.log("Roles por defecto verificados/creados");

    } catch (error) {
        console.log("Error en la tabla roles: ", error)
    }
}