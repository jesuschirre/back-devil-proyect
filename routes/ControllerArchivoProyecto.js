import { db } from "../db.js";
import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";

const router = Router();

// GET - Obtener todos los archivos de un proyecto
router.get("/proyecto/:idProyecto", verifyToken, async (req, res) => {
  try {
    const { idProyecto } = req.params;

    // Verificar que el usuario tiene acceso al proyecto
    const acceso = await db.query(
      `SELECT id FROM proyecto_usuario
       WHERE fk_id_user = $1 AND fk_id_proyecto = $2`,
      [req.user.id, idProyecto]
    );

    if (acceso.rows.length === 0) {
      return res.status(403).json({ error: "No tienes acceso a este proyecto" });
    }

    const result = await db.query(
      `SELECT id, name, url_archivo, tipo_archivo, size_kb,
              fk_id_proyecto, fk_id_user_uploader
       FROM archivos_proyecto
       WHERE fk_id_proyecto = $1
       ORDER BY id DESC`,
      [idProyecto]
    );

    return res.status(200).json({ archivos: result.rows });
  } catch (error) {
    console.error("Error en GET /archivos/proyecto/:idProyecto:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET by ID - Obtener un archivo específico
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT a.id, a.name, a.url_archivo, a.tipo_archivo, a.size_kb,
              a.fk_id_proyecto, a.fk_id_user_uploader
       FROM archivos_proyecto a
       JOIN proyecto_usuario pu ON pu.fk_id_proyecto = a.fk_id_proyecto
       WHERE a.id = $1 AND pu.fk_id_user = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Archivo no encontrado o sin acceso" });
    }

    return res.status(200).json({ archivo: result.rows[0] });
  } catch (error) {
    console.error("Error en GET /archivos/:id:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST - Subir un archivo a un proyecto
router.post("/", verifyToken, async (req, res) => {
  try {
    const { name, url_archivo, tipo_archivo, size_kb, fk_id_proyecto } = req.body;

    if (!name || !url_archivo || !fk_id_proyecto) {
      return res.status(400).json({ error: "name, url_archivo y fk_id_proyecto son obligatorios" });
    }

    // Verificar que el usuario tiene acceso al proyecto (al menos viewer puede subir)
    const acceso = await db.query(
      `SELECT id FROM proyecto_usuario
       WHERE fk_id_user = $1 AND fk_id_proyecto = $2`,
      [req.user.id, fk_id_proyecto]
    );

    if (acceso.rows.length === 0) {
      return res.status(403).json({ error: "No tienes acceso a este proyecto" });
    }

    const result = await db.query(
      `INSERT INTO archivos_proyecto (name, url_archivo, tipo_archivo, size_kb, fk_id_proyecto, fk_id_user_uploader)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, url_archivo, tipo_archivo, size_kb, fk_id_proyecto, fk_id_user_uploader`,
      [name, url_archivo, tipo_archivo || null, size_kb || null, fk_id_proyecto, req.user.id]
    );

    return res.status(201).json({
      message: "Archivo subido correctamente",
      archivo: result.rows[0],
    });
  } catch (error) {
    console.error("Error en POST /archivos:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Actualizar datos de un archivo (nombre, tipo)
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url_archivo, tipo_archivo } = req.body;

    // Verificar que el archivo existe y el usuario tiene acceso
    const archivoCheck = await db.query(
      `SELECT a.id, a.fk_id_proyecto
       FROM archivos_proyecto a
       JOIN proyecto_usuario pu ON pu.fk_id_proyecto = a.fk_id_proyecto
       WHERE a.id = $1 AND pu.fk_id_user = $2`,
      [id, req.user.id]
    );

    if (archivoCheck.rows.length === 0) {
      return res.status(404).json({ error: "Archivo no encontrado o sin acceso" });
    }

    const result = await db.query(
      `UPDATE archivos_proyecto
       SET name = COALESCE($1, name),
           url_archivo = COALESCE($2, url_archivo),
           tipo_archivo = COALESCE($3, tipo_archivo)
       WHERE id = $4
       RETURNING id, name, url_archivo, tipo_archivo, size_kb, fk_id_proyecto, fk_id_user_uploader`,
      [name, url_archivo, tipo_archivo, id]
    );

    return res.status(200).json({
      message: "Archivo actualizado correctamente",
      archivo: result.rows[0],
    });
  } catch (error) {
    console.error("Error en PUT /archivos/:id:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Eliminar un archivo
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar acceso: solo owner o editor del proyecto, o quien lo subió
    const archivoCheck = await db.query(
      `SELECT a.id, a.fk_id_user_uploader, a.fk_id_proyecto
       FROM archivos_proyecto a
       JOIN proyecto_usuario pu ON pu.fk_id_proyecto = a.fk_id_proyecto
       WHERE a.id = $1 AND pu.fk_id_user = $2`,
      [id, req.user.id]
    );

    if (archivoCheck.rows.length === 0) {
      return res.status(404).json({ error: "Archivo no encontrado o sin acceso" });
    }

    await db.query(`DELETE FROM archivos_proyecto WHERE id = $1`, [id]);

    return res.status(200).json({ message: "Archivo eliminado correctamente" });
  } catch (error) {
    console.error("Error en DELETE /archivos/:id:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;

