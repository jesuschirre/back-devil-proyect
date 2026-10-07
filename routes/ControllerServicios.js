import { db } from "../db.js";
import { Router } from "express";
import { requireRole, verifyToken } from "../middleware/verifyToken.js";

const router = Router();
const serviceColumns = `id, nombre, tipo, fecha_contratacion, fecha_expiracion,
                        costo_renovacion, estado, fk_id_user`;
const serviceWithUserColumns = `s.id, s.nombre, s.tipo, s.fecha_contratacion, s.fecha_expiracion,
                                s.costo_renovacion, s.estado, s.fk_id_user,
                                u.name AS usuario_nombre, u.username AS usuario_username,
                                u.correo AS usuario_correo`;
const SERVICE_STATES = ["activo", "desactivo", "cancelado"];

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validServiceId(id) {
  return /^\d+$/.test(id) && Number(id) > 0;
}

function validServiceFields({ nombre, tipo, fecha_expiracion }) {
  return (
    typeof nombre === "string" &&
    nombre.trim().length > 0 &&
    nombre.length <= 150 &&
    typeof tipo === "string" &&
    tipo.trim().length > 0 &&
    tipo.length <= 50 &&
    validDate(fecha_expiracion)
  );
}

function validOptionalFields(body) {
  if (body.fecha_contratacion !== undefined &&
      body.fecha_contratacion !== null &&
      !validDate(body.fecha_contratacion)) {
    return false;
  }
  if (body.estado !== undefined &&
      body.estado !== null &&
      !SERVICE_STATES.includes(body.estado)) {
    return false;
  }
  if (body.costo_renovacion !== undefined && body.costo_renovacion !== null) {
    const costo = Number(body.costo_renovacion);
    if (!Number.isFinite(costo) || Math.abs(costo) >= 100000000) {
      return false;
    }
  }
  return true;
}

// Administradores ven todos los servicios; los demás solo ven los propios.
router.get("/", verifyToken, async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const result = await db.query(
      `SELECT ${serviceWithUserColumns}
       FROM servicios s
       JOIN users u ON u.id = s.fk_id_user
       ${isAdmin ? "" : "WHERE s.fk_id_user = $1"}
       ORDER BY s.id DESC`,
      isAdmin ? [] : [req.user.id]
    );

    return res.status(200).json({ servicios: result.rows });
  } catch (error) {
    console.error("Error en GET /servicios:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.get("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!validServiceId(id)) {
      return res.status(400).json({ error: "ID de servicio inválido" });
    }

    const isAdmin = req.user.role === "admin";
    const result = await db.query(
      `SELECT ${serviceWithUserColumns}
       FROM servicios s
       JOIN users u ON u.id = s.fk_id_user
       WHERE s.id = $1 ${isAdmin ? "" : "AND s.fk_id_user = $2"}`,
      isAdmin ? [id] : [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }
    return res.status(200).json({ servicio: result.rows[0] });
  } catch (error) {
    console.error("Error en GET /servicios/:id:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Solo los administradores pueden crear servicios y asignarles un usuario.
router.post("/", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "El cuerpo de la solicitud es inválido" });
    }

    const {
      nombre,
      tipo,
      fecha_contratacion,
      fecha_expiracion,
      costo_renovacion,
      estado,
      fk_id_user,
    } = body;
    if (!validServiceFields({ nombre, tipo, fecha_expiracion })) {
      return res.status(400).json({
        error: "nombre, tipo y fecha_expiracion son obligatorios y deben ser válidos",
      });
    }
    if (!validOptionalFields(body)) {
      return res.status(400).json({ error: "Uno o más campos opcionales no son válidos" });
    }
    if (!Number.isInteger(Number(fk_id_user)) || Number(fk_id_user) <= 0) {
      return res.status(400).json({ error: "Debes seleccionar un usuario válido" });
    }
    const userExists = await db.query("SELECT id FROM users WHERE id = $1", [Number(fk_id_user)]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: "El usuario seleccionado no existe" });
    }

    const columns = ["nombre", "tipo", "fecha_expiracion", "fk_id_user"];
    const values = [nombre.trim(), tipo.trim(), fecha_expiracion, Number(fk_id_user)];
    for (const field of ["fecha_contratacion", "costo_renovacion", "estado"]) {
      if (body[field] !== undefined) {
        columns.push(field);
        values.push(body[field]);
      }
    }
    const placeholders = values.map((_, index) => `$${index + 1}`);

    const result = await db.query(
      `INSERT INTO servicios (${columns.join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING ${serviceColumns}`,
      values
    );

    return res.status(201).json({
      message: "Servicio creado correctamente",
      servicio: result.rows[0],
    });
  } catch (error) {
    console.error("Error en POST /servicios:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Solo los administradores pueden actualizar servicios.
router.put("/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    if (!validServiceId(id)) {
      return res.status(400).json({ error: "ID de servicio inválido" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "El cuerpo de la solicitud es inválido" });
    }

    const { nombre, tipo, fecha_expiracion, fk_id_user } = body;
    if (!validServiceFields({ nombre, tipo, fecha_expiracion })) {
      return res.status(400).json({
        error: "nombre, tipo y fecha_expiracion son obligatorios y deben ser válidos",
      });
    }
    if (!validOptionalFields(body)) {
      return res.status(400).json({ error: "Uno o más campos opcionales no son válidos" });
    }
    if (!Number.isInteger(Number(fk_id_user)) || Number(fk_id_user) <= 0) {
      return res.status(400).json({ error: "Debes seleccionar un usuario válido" });
    }
    const userExists = await db.query("SELECT id FROM users WHERE id = $1", [Number(fk_id_user)]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: "El usuario seleccionado no existe" });
    }

    const values = [nombre.trim(), tipo.trim(), fecha_expiracion];
    const setClauses = [
      "nombre = $1",
      "tipo = $2",
      "fecha_expiracion = $3",
    ];
    values.push(Number(fk_id_user));
    setClauses.push(`fk_id_user = $${values.length}`);

    for (const field of ["fecha_contratacion", "costo_renovacion", "estado"]) {
      if (body[field] !== undefined) {
        values.push(body[field]);
        setClauses.push(`${field} = $${values.length}`);
      }
    }

    values.push(id);
    const result = await db.query(
      `UPDATE servicios
       SET ${setClauses.join(", ")}
       WHERE id = $${values.length}
       RETURNING ${serviceColumns}`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }

    return res.status(200).json({
      message: "Servicio actualizado correctamente",
      servicio: result.rows[0],
    });
  } catch (error) {
    console.error("Error en PUT /servicios/:id:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Solo los administradores pueden eliminar servicios.
router.delete("/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!validServiceId(id)) {
      return res.status(400).json({ error: "ID de servicio inválido" });
    }

    const result = await db.query(
      `DELETE FROM servicios
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }

    return res.status(200).json({ message: "Servicio eliminado correctamente" });
  } catch (error) {
    console.error("Error en DELETE /servicios/:id:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
