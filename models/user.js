import { db } from "../db.js";

export const TUsers = async () => {
    const queryUsers = `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            numberphone VARCHAR(20),
            correo VARCHAR(150) NOT NULL UNIQUE,
            username VARCHAR(50) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            fk_id_role INT NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            FOREIGN KEY (fk_id_role) REFERENCES roles(id)
        )
    `;
    try {
        await db.query(queryUsers);
        console.log("Tabla users creada satisfactoriamente");
    } catch (error) {
        console.log("Error en la tabla users: ", error);
    }
};

