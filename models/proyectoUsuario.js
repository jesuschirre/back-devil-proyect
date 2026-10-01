import { db } from "../db.js";

export const TProyectoUsuario = async () => {
    const queryProyectoUsuario = `
        CREATE TABLE IF NOT EXISTS proyecto_usuario (
            id SERIAL PRIMARY KEY,
            fk_id_user INT NOT NULL,
            fk_id_proyecto INT NOT NULL,
            rol_en_proyecto VARCHAR(30) DEFAULT 'viewer',
            created_at TIMESTAMP DEFAULT NOW(),
            FOREIGN KEY (fk_id_user) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (fk_id_proyecto) REFERENCES proyectos(id) ON DELETE CASCADE,
            UNIQUE (fk_id_user, fk_id_proyecto)
        )
    `;
    try {
        await db.query(queryProyectoUsuario);
        console.log("Tabla proyecto_usuario creada satisfactoriamente");
    } catch (error) {
        console.log("Error en la tabla proyecto_usuario: ", error);
    }
};

