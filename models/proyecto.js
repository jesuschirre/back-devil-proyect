import { db } from "../db.js";

export const TProyectos = async () => {
    const queryProyectos = `
        CREATE TABLE IF NOT EXISTS proyectos (
            id SERIAL PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            descripcion TEXT,
            status VARCHAR(30) DEFAULT 'en_progreso',
            fecha_inicio DATE,
            fecha_estimada_fin DATE,
            fk_id_user_creador INT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            FOREIGN KEY (fk_id_user_creador) REFERENCES users(id) ON DELETE SET NULL
        )
    `;
    try {
        await db.query(queryProyectos);
        console.log("Tabla proyectos creada satisfactoriamente");
    } catch (error) {
        console.log("Error en la tabla proyectos: ", error);
    }
};

