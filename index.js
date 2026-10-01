import express from 'express';
import cors from 'cors';                     
import cookieParser from 'cookie-parser';   
import { initDB } from "./models/index.js";
import ControllerUser from "./routes/ControllerUser.js";
import ControllerProyectoUsuario from "./routes/ControllerProyectoUsuario.js";
import ControllerArchivoProyecto from "./routes/ControllerArchivoProyecto.js";

const app = express();
const port = 3000;

// Configuramos CORS para permitir las cookies del frontend
app.use(cors({
  origin: 'http://localhost:5173', 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']  
}));

app.use(express.json());

// Activamos la lectura de cookies
app.use(cookieParser());

// rutas de peticion HTTP
app.use("/api/auth", ControllerUser);
app.use("/api/proyecto-usuario", ControllerProyectoUsuario);
app.use("/api/archivos", ControllerArchivoProyecto);

// Iniciar el servidor
const serverRun = async () => {
  try {
    // Crear las tablas
    await initDB();
    // Iniciar el servidor
    app.listen(port, () => {
      console.log(`🚀 Servidor Express corriendo en el puerto ${port}`);
    });
  } catch (error) {
    console.error("❌ Error al iniciar la base de datos o el servidor:", error);
  }
}

serverRun();