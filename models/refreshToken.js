import { db } from "../db.js";

export const TRefreshTokens = async () => {
    const queryRefreshTokens = `
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id SERIAL PRIMARY KEY,
            fk_id_user INT NOT NULL,
            token_hash VARCHAR(255) NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            revoked BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            FOREIGN KEY (fk_id_user) REFERENCES users(id) ON DELETE CASCADE
        )
    `;
    try {
        await db.query(queryRefreshTokens);
        console.log("Tabla refresh_tokens creada satisfactoriamente");
    } catch (error) {
        console.log("Error en la tabla refresh_tokens: ", error);
    }
};

