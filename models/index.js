import { TRoles } from "./roles.js";
import { TUsers } from "./user.js";
import { TProyectos } from "./proyecto.js";
import { TProyectoUsuario } from "./proyectoUsuario.js";
import { TArchivosProyecto } from "./archivoProyecto.js";
import { TRefreshTokens } from "./refreshToken.js";

export const initDB = async () => {
    try {
        console.log("creando las tablas ....")
        await TRoles();
        await TUsers();
        await TProyectos();
        await TProyectoUsuario();
        await TArchivosProyecto();
        await TRefreshTokens();
        console.log("✅ Todas las tablas fueron creadas o verificadas con éxito.");
    } catch (error) {
        console.error("❌ Error durante la inicialización de la base de datos:", error);
    }
}