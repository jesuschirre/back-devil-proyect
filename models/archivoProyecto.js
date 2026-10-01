import { db } from "../db.js";

export const TArchivosProyecto = async () => {
    const queryArchivosProyecto = `
        CREATE TABLE IF NOT EXISTS archivos_proyecto (
            id SERIAL PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            url_archivo VARCHAR(500) NOT NULL,
            tipo_archivo TEXT,
            size_kb NUMERIC(10,2),
            fk_id_proyecto INT NOT NULL,
            fk_id_user_uploader INT,
            created_at TIMESTAMP DEFAULT NOW(),
            FOREIGN KEY (fk_id_proyecto) REFERENCES proyectos(id) ON DELETE CASCADE,
            FOREIGN KEY (fk_id_user_uploader) REFERENCES users(id) ON DELETE SET NULL
        )
    `;
    try {
        await db.query(queryArchivosProyecto);
        console.log("Tabla archivos_proyecto creada satisfactoriamente");
    } catch (error) {
        console.log("Error en la tabla archivos_proyecto: ", error);
    }
};

