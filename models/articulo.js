import { db } from "../db.js";

export const TArticulo = async () => {
    const queryArticulo = `
        CREATE TABLE IF NOT EXISTS articulos (
            id SERIAL PRIMARY KEY,
            titulo VARCHAR(200) NOT NULL,
            subtitulo VARCHAR(300),
            imagen_portada VARCHAR(1000),
            fecha_creacion DATE NOT NULL DEFAULT CURRENT_DATE,
            descripcion JSONB NOT NULL DEFAULT '[]'::jsonb,
            cta JSONB NOT NULL DEFAULT '[]'::jsonb,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
    `;

    try {
        await db.query(queryArticulo);
        console.log("Tabla articulos creada satisfactoriamente");
    } catch (error) {
        console.error("Error al crear la tabla articulos:", error);
        throw error;
    }
};