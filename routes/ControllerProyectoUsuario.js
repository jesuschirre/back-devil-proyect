import { db } from "../db.js";
import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";

const router = Router();
const ROLES_PROYECTO = ["owner", "admin_proyect", "colaborador_proyect", "viewer"];
const ROLES_ELIMINABLES_POR_ADMIN = ["owner", "colaborador_proyect", "viewer"];

async function getProjectMemberRole(userId, projectId) {
  const result = await db.query(
    `SELECT rol_en_proyecto FROM proyecto_usuario
     WHERE fk_id_user = $1 AND fk_id_proyecto = $2`,
    [userId, projectId]
  );
  return result.rows[0]?.rol_en_proyecto ?? null;
}

async function canManageAccess(user, projectId) {
  if (user.role === "admin") return "admin";
  const projectRole = await getProjectMemberRole(user.id, projectId);
  return ["owner", "admin_proyect"].includes(projectRole) ? projectRole : null;
}

router.get("/dash", verifyToken, async (req, res) => {
  try {
    const getResult = await db.query(
      `
        SELECT pu.id, pu.fk_id_user, pu.fk_id_proyecto, pu.rol_en_proyecto,
               p.id AS proyecto_id, p.name, p.descripcion, p.status, p.fecha_inicio,
               p.fecha_estimada_fin, p.fk_id_user_creador,
               (SELECT COUNT(*) FROM archivos_proyecto ap WHERE ap.fk_id_proyecto = p.id) AS proyect_archivos_nr
        FROM proyecto_usuario pu
        JOIN proyectos p ON p.id = pu.fk_id_proyecto
        WHERE pu.fk_id_user = $1
        ORDER BY p.id DESC
        LIMIT 3
      `, [req.user.id]
    );
    
    const ultimosProyectos = getResult.rows.map(row => ({
      ...row,
      proyect_archivos_nr: parseInt(row.proyect_archivos_nr, 10)
    }));

    return res.status(200).json(ultimosProyectos);

  } catch (error) {
    console.error("Error en GET /dash:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET - Obtener todos los proyectos del usuario autenticado con archivos
router.get("/", verifyToken, async (req, res) => {
  try {
    // Traer las relaciones proyecto_usuario + datos del proyecto
    const puResult = await db.query(
      `SELECT pu.id, pu.fk_id_user, pu.fk_id_proyecto, pu.rol_en_proyecto,
              p.id AS proyecto_id, p.name, p.descripcion, p.status, p.fecha_inicio,
              p.fecha_estimada_fin, p.fk_id_user_creador,
              (SELECT COUNT(*) FROM archivos_proyecto ap WHERE ap.fk_id_proyecto = p.id) AS proyect_archivos_nr
       FROM proyecto_usuario pu
       JOIN proyectos p ON p.id = pu.fk_id_proyecto
       WHERE pu.fk_id_user = $1
       ORDER BY p.id DESC`,
      [req.user.id]
    );

    const registros = puResult.rows;

    if (registros.length === 0) {
      return res.status(200).json({ proyectos: [] });
    }

    // Traer todos los archivos de esos proyectos
    const proyectoIds = registros.map((r) => r.fk_id_proyecto);
    const archivosResult = await db.query(
      `SELECT id, name, url_archivo, tipo_archivo, size_kb,
              fk_id_proyecto, fk_id_user_uploader
       FROM archivos_proyecto
       WHERE fk_id_proyecto = ANY($1)`,
      [proyectoIds]
    );

    // Agrupar archivos por proyecto
    const archivosPorProyecto = {};
    for (const archivo of archivosResult.rows) {
      const pid = archivo.fk_id_proyecto;
      if (!archivosPorProyecto[pid]) {
        archivosPorProyecto[pid] = [];
      }
      archivosPorProyecto[pid].push(archivo);
    }

    // Armar la respuesta final
    const proyectos = registros.map((r) => ({
      id: r.id,
      fk_id_user: r.fk_id_user,
      fk_id_proyecto: r.fk_id_proyecto,
      rol_en_proyecto: r.rol_en_proyecto,
      proyect_archivos_nr: parseInt(r.proyect_archivos_nr, 10),
      proyecto: {
        id: r.proyecto_id,
        name: r.name,
        descripcion: r.descripcion,
        status: r.status,
        fecha_inicio: r.fecha_inicio,
        fecha_estimada_fin: r.fecha_estimada_fin,
        fk_id_user_creador: r.fk_id_user_creador,
        archivos: archivosPorProyecto[r.fk_id_proyecto] || [],
      },
    }));

    return res.status(200).json({ proyectos });
  } catch (error) {
    console.error("Error en GET /proyecto-usuario:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.get("/administrables", verifyToken, async (req, res) => {
  try {
      const result = await db.query(
        `SELECT p.id, p.name, pu.rol_en_proyecto
         FROM proyecto_usuario pu
         JOIN proyectos p ON p.id = pu.fk_id_proyecto
         WHERE pu.fk_id_user = $1
           AND pu.rol_en_proyecto IN ('owner', 'admin_proyect')
         ORDER BY p.name`,
        [req.user.id]
      );
    return res.status(200).json({ proyectos: result.rows });
  } catch (error) {
    console.error("Error en GET /proyecto-usuario/administrables:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.get("/miembros/:idProyecto", verifyToken, async (req, res) => {
  try {
    const { idProyecto } = req.params;
    if (!(await canManageAccess(req.user, idProyecto))) {
      return res.status(403).json({ error: "No tienes permiso para administrar los accesos" });
    }

    const result = await db.query(
      `SELECT pu.id, pu.fk_id_user, pu.fk_id_proyecto, pu.rol_en_proyecto,
              u.name, u.username, u.correo
       FROM proyecto_usuario pu
       JOIN users u ON u.id = pu.fk_id_user
       WHERE pu.fk_id_proyecto = $1
       ORDER BY u.name`,
      [idProyecto]
    );
    return res.status(200).json({ miembros: result.rows });
  } catch (error) {
    console.error("Error en GET /proyecto-usuario/miembros/:idProyecto:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

router.get("/usuarios-disponibles/:idProyecto", verifyToken, async (req, res) => {
  try {
    const { idProyecto } = req.params;
    if (!(await canManageAccess(req.user, idProyecto))) {
      return res.status(403).json({ error: "No tienes permiso para administrar los accesos" });
    }

    const search = String(req.query.q ?? "").trim();
    if (search.length < 2) return res.status(200).json({ usuarios: [] });

    const result = await db.query(
      `SELECT u.id, u.name, u.username, u.correo
       FROM users u
       WHERE u.is_active = TRUE
         AND (u.name ILIKE $1 OR u.username ILIKE $1 OR u.correo ILIKE $1)
         AND NOT EXISTS (
           SELECT 1 FROM proyecto_usuario pu
           WHERE pu.fk_id_user = u.id AND pu.fk_id_proyecto = $2
         )
       ORDER BY u.name
       LIMIT 20`,
      [`%${search}%`, idProyecto]
    );
    return res.status(200).json({ usuarios: result.rows });
  } catch (error) {
    console.error("Error en GET /proyecto-usuario/usuarios-disponibles/:idProyecto:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET by proyecto ID - Obtener un proyecto específico con su relación
router.get("/:idProyecto", verifyToken, async (req, res) => {
  try {
    const { idProyecto } = req.params;

    const puResult = await db.query(
      `SELECT pu.id, pu.fk_id_user, pu.fk_id_proyecto, pu.rol_en_proyecto,
              p.id AS proyecto_id, p.name, p.descripcion, p.status, p.fecha_inicio,
              p.fecha_estimada_fin, p.fk_id_user_creador
       FROM proyecto_usuario pu
       JOIN proyectos p ON p.id = pu.fk_id_proyecto
       WHERE pu.fk_id_proyecto = $1 AND pu.fk_id_user = $2`,
      [idProyecto, req.user.id]
    );

    const registro = puResult.rows[0];

    if (!registro) {
      return res.status(404).json({ error: "Proyecto no encontrado o sin acceso" });
    }

    const archivosResult = await db.query(
      `SELECT id, name, url_archivo, tipo_archivo, size_kb,
              fk_id_proyecto, fk_id_user_uploader
       FROM archivos_proyecto
       WHERE fk_id_proyecto = $1`,
      [idProyecto]
    );

    return res.status(200).json({
      proyecto: {
        id: registro.id,
        fk_id_user: registro.fk_id_user,
        fk_id_proyecto: registro.fk_id_proyecto,
        rol_en_proyecto: registro.rol_en_proyecto,
        proyecto: {
          id: registro.proyecto_id,
          name: registro.name,
          descripcion: registro.descripcion,
          status: registro.status,
          fecha_inicio: registro.fecha_inicio,
          fecha_estimada_fin: registro.fecha_estimada_fin,
          fk_id_user_creador: registro.fk_id_user_creador,
          proyect_archivos_nr: registro.proyect_archivos_nr,
          archivos: archivosResult.rows,

        },
      },
    });
  } catch (error) {
    console.error("Error en GET /proyecto-usuario/:idProyecto:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST - Crear un proyecto y registrar al creador en el proyecto
router.post("/", verifyToken, async (req, res) => {
  try {
    const { name, descripcion, status, fecha_inicio, fecha_estimada_fin } = req.body;

    if (!name) {
      return res.status(400).json({ error: "El nombre del proyecto es obligatorio" });
    }

    // Crear el proyecto
    const proyectoResult = await db.query(
      `INSERT INTO proyectos (name, descripcion, status, fecha_inicio, fecha_estimada_fin, fk_id_user_creador)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, descripcion, status, fecha_inicio, fecha_estimada_fin, fk_id_user_creador`,
      [name, descripcion || null, status || "en_progreso", fecha_inicio || null, fecha_estimada_fin || null, req.user.id]
    );

    const nuevoProyecto = proyectoResult.rows[0];

    const rolEnProyecto = "admin_proyect"

    // Mantener una relación para que el creador vea el proyecto en su lista.
    const puResult = await db.query(
      `INSERT INTO proyecto_usuario (fk_id_user, fk_id_proyecto, rol_en_proyecto)
       VALUES ($1, $2, $3)
       RETURNING id, fk_id_user, fk_id_proyecto, rol_en_proyecto`,
      [req.user.id, nuevoProyecto.id, rolEnProyecto]
    );

    return res.status(201).json({
      message: "Proyecto creado correctamente",
      proyecto: {
        ...puResult.rows[0],
        proyecto: { ...nuevoProyecto, archivos: [] },
      },
    });
  } catch (error) {
    console.error("Error en POST /proyecto-usuario:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST - Agregar un colaborador a un proyecto existente
router.post("/colaborador", verifyToken, async (req, res) => {
  try {
    const { fk_id_user, fk_id_proyecto, rol_en_proyecto } = req.body;

    if (!fk_id_user || !fk_id_proyecto) {
      return res.status(400).json({ error: "fk_id_user y fk_id_proyecto son obligatorios" });
    }

    const actorRole = await canManageAccess(req.user, fk_id_proyecto);
    if (!actorRole) {
      return res.status(403).json({ error: "No tienes permiso para agregar colaboradores" });
    }

    const assignedRole = rol_en_proyecto || "viewer";
    if (!ROLES_PROYECTO.includes(assignedRole)) {
      return res.status(400).json({ error: "El rol del proyecto no es válido" });
    }
    if (actorRole === "owner" && assignedRole !== "viewer") {
      return res.status(403).json({ error: "El owner solo puede agregar usuarios con rol viewer" });
    }

    const result = await db.query(
      `INSERT INTO proyecto_usuario (fk_id_user, fk_id_proyecto, rol_en_proyecto)
       VALUES ($1, $2, $3)
       ON CONFLICT (fk_id_user, fk_id_proyecto) DO NOTHING
       RETURNING id, fk_id_user, fk_id_proyecto, rol_en_proyecto`,
      [fk_id_user, fk_id_proyecto, assignedRole]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: "El usuario ya está asignado a este proyecto" });
    }

    return res.status(201).json({
      message: "Colaborador agregado correctamente",
      colaborador: result.rows[0],
    });
  } catch (error) {
    console.error("Error en POST /proyecto-usuario/colaborador:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT - Actualizar el proyecto o el rol de un colaborador
router.put("/:idProyecto", verifyToken, async (req, res) => {
  try {
    const { idProyecto } = req.params;
    const { name, descripcion, status, fecha_inicio, fecha_estimada_fin } = req.body;

    // Verificar que el usuario es owner
    const ownerCheck = await db.query(
      `SELECT id FROM proyecto_usuario
       WHERE fk_id_user = $1 AND fk_id_proyecto = $2 AND rol_en_proyecto = 'admin_proyect'`,
      [req.user.id, idProyecto]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ error: "Solo el owner puede editar el proyecto" });
    }

    const result = await db.query(
      `UPDATE proyectos
       SET name = COALESCE($1, name),
           descripcion = COALESCE($2, descripcion),
           status = COALESCE($3, status),
           fecha_inicio = COALESCE($4, fecha_inicio),
           fecha_estimada_fin = COALESCE($5, fecha_estimada_fin),
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, descripcion, status, fecha_inicio, fecha_estimada_fin, fk_id_user_creador`,
      [name, descripcion, status, fecha_inicio, fecha_estimada_fin, idProyecto]
    );

    return res.status(200).json({
      message: "Proyecto actualizado correctamente",
      proyecto: result.rows[0],
    });
  } catch (error) {
    console.error("Error en PUT /proyecto-usuario/:idProyecto:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT - Cambiar rol de un colaborador
router.put("/colaborador/:idRelacion", verifyToken, async (req, res) => {
  try {
    const { idRelacion } = req.params;
    const { rol_en_proyecto } = req.body;

    if (!rol_en_proyecto) {
      return res.status(400).json({ error: "rol_en_proyecto es obligatorio" });
    }

    // Obtener la relación para saber el proyecto
    const relacion = await db.query(
      `SELECT fk_id_proyecto FROM proyecto_usuario WHERE id = $1`,
      [idRelacion]
    );

    if (relacion.rows.length === 0) {
      return res.status(404).json({ error: "Relación no encontrada" });
    }

    const actorRole = await canManageAccess(req.user, relacion.rows[0].fk_id_proyecto);
    if (!actorRole || actorRole === "owner") {
      return res.status(403).json({ error: "No tienes permiso para cambiar roles" });
    }
    if (!ROLES_PROYECTO.includes(rol_en_proyecto)) {
      return res.status(400).json({ error: "El rol del proyecto no es válido" });
    }

    const result = await db.query(
      `UPDATE proyecto_usuario SET rol_en_proyecto = $1 WHERE id = $2
       RETURNING id, fk_id_user, fk_id_proyecto, rol_en_proyecto`,
      [rol_en_proyecto, idRelacion]
    );

    return res.status(200).json({
      message: "Rol actualizado correctamente",
      colaborador: result.rows[0],
    });
  } catch (error) {
    console.error("Error en PUT /proyecto-usuario/colaborador/:idRelacion:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// DELETE - Eliminar un proyecto completo (solo admin_proyect)
router.delete("/:idProyecto", verifyToken, async (req, res) => {
  try {
    const { idProyecto } = req.params;

    const ownerCheck = await db.query(
      `SELECT id FROM proyecto_usuario
        WHERE fk_id_user = $1 AND fk_id_proyecto = $2 AND rol_en_proyecto = 'admin_proyect'`,
      [req.user.id, idProyecto]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ error: "Solo el owner puede eliminar el proyecto" });
    }

    // ON DELETE CASCADE borra archivos_proyecto y proyecto_usuario
    await db.query(`DELETE FROM proyectos WHERE id = $1`, [idProyecto]);

    return res.status(200).json({ message: "Proyecto eliminado correctamente" });
  } catch (error) {
    console.error("Error en DELETE /proyecto-usuario/:idProyecto:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// DELETE - Remover un colaborador de un proyecto (solo owner)
router.delete("/colaborador/:idRelacion", verifyToken, async (req, res) => {
  try {
    const { idRelacion } = req.params;

    const relacion = await db.query(
      `SELECT fk_id_proyecto, fk_id_user, rol_en_proyecto
       FROM proyecto_usuario WHERE id = $1`,
      [idRelacion]
    );

    if (relacion.rows.length === 0) {
      return res.status(404).json({ error: "Relación no encontrada" });
    }

    // No permitir eliminar al owner
    const rel = relacion.rows[0];

    const actorRole = await canManageAccess(req.user, rel.fk_id_proyecto);
    if (!actorRole) {
      return res.status(403).json({ error: "No tienes permiso para remover colaboradores" });
    }
    if (actorRole === "owner" && rel.rol_en_proyecto !== "viewer") {
      return res.status(403).json({ error: "El owner solo puede eliminar usuarios con rol viewer" });
    }
    if (["admin", "admin_proyect"].includes(actorRole)
      && !ROLES_ELIMINABLES_POR_ADMIN.includes(rel.rol_en_proyecto)) {
      return res.status(403).json({ error: "No puedes eliminar un administrador del proyecto" });
    }

    // Verificar que no se elimine a sí mismo (owner)
    if (rel.fk_id_user === req.user.id) {
      return res.status(400).json({ error: "El owner no puede removerse a sí mismo" });
    }

    await db.query(`DELETE FROM proyecto_usuario WHERE id = $1`, [idRelacion]);

    return res.status(200).json({ message: "Colaborador removido correctamente" });
  } catch (error) {
    console.error("Error en DELETE /proyecto-usuario/colaborador/:idRelacion:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;

