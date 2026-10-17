import { Router } from "express";
import { db } from "../db.js";
import { requireRole, verifyToken } from "../middleware/verifyToken.js";

const router = Router();
const articuloColumns =
  "id, titulo, subtitulo, imagen_portada, fecha_creacion, descripcion, cta, updated_at";
const editableFields = [
  "titulo",
  "subtitulo",
  "imagen_portada",
  "fecha_creacion",
  "descripcion",
  "cta",
];

function validId(id) {
  return /^\d+$/.test(id) && Number(id) >= 0;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validBody(body) {
  return body !== null && typeof body === "object" && !Array.isArray(body);
}

function hasField(body, field) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

function validArticleFields(body, { creating = false } = {}) {
  if (creating && (typeof body.titulo !== "string" || !body.titulo.trim())) {
    return false;
  }

  if (
    body.titulo !== undefined &&
    (typeof body.titulo !== "string" || !body.titulo.trim() || body.titulo.length > 200)
  ) {
    return false;
  }
  if (
    body.subtitulo !== undefined &&
    body.subtitulo !== null &&
    (typeof body.subtitulo !== "string" || body.subtitulo.length > 300)
  ) {
    return false;
  }
  if (
    body.imagen_portada !== undefined &&
    body.imagen_portada !== null &&
    (typeof body.imagen_portada !== "string" || body.imagen_portada.length > 1000)
  ) {
    return false;
  }
  if (
    body.fecha_creacion !== undefined &&
    !validDate(body.fecha_creacion)
  ) {
    return false;
  }
  for (const field of ["descripcion", "cta"]) {
    if (
      hasField(body, field) &&
      (body[field] === null || typeof body[field] !== "object")
    ) {
      return false;
    }
  }

  return true;
}

router.get("/", async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT ${articuloColumns}
       FROM articulos
       ORDER BY fecha_creacion DESC, id DESC`
    );
    return res.status(200).json({ articulos: result.rows });
  } catch (error) {
    console.error("Error en GET /articulos:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validId(id)) {
      return res.status(400).json({ error: "ID de artículo inválido" });
    }

    const result = await db.query(
      `SELECT ${articuloColumns} FROM articulos WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Artículo no encontrado" });
    }

    return res.status(200).json({ articulo: result.rows[0] });
  } catch (error) {
    console.error("Error en GET /articulos/:id:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.post("/", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const body = req.body;
    if (!validBody(body) || !validArticleFields(body, { creating: true })) {
      return res.status(400).json({ error: "Los datos del artículo no son válidos" });
    }

    const result = await db.query(
      `INSERT INTO articulos
         (titulo, subtitulo, imagen_portada, fecha_creacion, descripcion, cta)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE),
               COALESCE($5::jsonb, '[]'::jsonb), COALESCE($6::jsonb, '[]'::jsonb))
       RETURNING ${articuloColumns}`,
      [
        body.titulo.trim(),
        body.subtitulo ?? null,
        body.imagen_portada ?? null,
        body.fecha_creacion ?? null,
        body.descripcion == null ? null : JSON.stringify(body.descripcion),
        body.cta == null ? null : JSON.stringify(body.cta),
      ]
    );

    return res.status(201).json({
      message: "Artículo creado correctamente",
      articulo: result.rows[0],
    });
  } catch (error) {
    console.error("Error en POST /articulos:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.put("/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    if (!validId(id)) {
      return res.status(400).json({ error: "ID de artículo inválido" });
    }
    if (
      !validBody(body) ||
      !editableFields.some((field) => hasField(body, field)) ||
      !validArticleFields(body)
    ) {
      return res.status(400).json({ error: "Los datos del artículo no son válidos" });
    }

    const values = [];
    const setClauses = [];
    for (const field of editableFields) {
      if (!hasField(body, field)) {
        continue;
      }
      let value = body[field];
      if (field === "titulo") {
        value = value.trim();
      } else if (field === "descripcion" || field === "cta") {
        value = value == null ? null : JSON.stringify(value);
      }
      values.push(value);
      const columnType = field === "fecha_creacion" ? "::date" :
        field === "descripcion" || field === "cta" ? "::jsonb" : "";
      setClauses.push(`${field} = $${values.length}${columnType}`);
    }

    values.push(id);
    const result = await db.query(
      `UPDATE articulos
       SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING ${articuloColumns}`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Artículo no encontrado" });
    }

    return res.status(200).json({
      message: "Artículo actualizado correctamente",
      articulo: result.rows[0],
    });
  } catch (error) {
    console.error("Error en PUT /articulos/:id:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.delete("/:id", verifyToken, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!validId(id)) {
      return res.status(400).json({ error: "ID de artículo inválido" });
    }

    const result = await db.query(
      "DELETE FROM articulos WHERE id = $1 RETURNING id",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Artículo no encontrado" });
    }

    return res.status(200).json({ message: "Artículo eliminado correctamente" });
  } catch (error) {
    console.error("Error en DELETE /articulos/:id:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
