import { db } from "../db.js";
import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { verifyToken } from "../middleware/verifyToken.js";
const router = Router();

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const ACCESS_TOKEN_EXPIRES = "15m";
const REFRESH_TOKEN_EXPIRES_DAYS = 7;

// Genera un hash del refresh token para guardarlo en DB
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// register
router.post("/register", async (req, res) => {
  try {
    const { name, numberphone, correo, username, password, fk_id_role } = req.body;

    if (!name || !correo || !username || !password || !fk_id_role) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    // Verificar si el usuario o correo ya existen
    const existing = await db.query(
      "SELECT id FROM users WHERE correo = $1 OR username = $2",
      [correo, username]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "El correo o username ya está registrado" });
    }

    // Hashear password
    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await db.query(
      `INSERT INTO users (name, numberphone, correo, username, password, fk_id_role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, correo, username, fk_id_role`,
      [name, numberphone, correo, username, hashedPassword, fk_id_role]
    );

    const newUser = result.rows[0];

    return res.status(201).json({
      message: "Usuario registrado correctamente",
      user: newUser,
    });
  } catch (error) {
    console.error("Error en /register:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return res.status(400).json({ error: "Correo y contraseña son requeridos" });
    }

    // Buscar usuario junto con su rol
    const result = await db.query(
      `SELECT u.id, u.name, u.correo, u.username, u.password, u.is_active,
              r.id as role_id, r.nombre as role_nombre
       FROM users u
       JOIN roles r ON u.fk_id_role = r.id
       WHERE u.correo = $1`,
      [correo]
    );

    const user = result.rows[0];

    // Mensaje genérico a propósito (no revelar si fue el correo o el password)
    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: "Usuario inactivo" });
    }
    // comparacion de contraseñas
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // Payload del access token: lo mínimo necesario
    const payload = {
      id: user.id,
      role: user.role_nombre,
    };

    const accessToken = jwt.sign(payload, ACCESS_TOKEN_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRES,
    });

    const refreshToken = jwt.sign({ id: user.id }, REFRESH_TOKEN_SECRET, {
      expiresIn: `${REFRESH_TOKEN_EXPIRES_DAYS}d`,
    });

    // Guardar el HASH del refresh token en DB
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await db.query(
      `INSERT INTO refresh_tokens (fk_id_user, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    // Refresh token va en cookie httpOnly
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Login exitoso",
      accessToken, // En memoria no en localstorage
      user: {
        id: user.id,
        name: user.name,
        correo: user.correo,
        username: user.username,
        role: user.role_nombre,
      },
    });
  } catch (error) {
    console.error("Error en /login:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});


// Refresh
router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: "No hay sesión activa" });
    }

    // Verificar firma y expiración del JWT
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
    } catch (err) {
      return res.status(403).json({ error: "Refresh token inválido o expirado" });
    }

    // Verificar que exista en DB no esté revocado y no haya expirado
    const tokenHash = hashToken(refreshToken);
    const result = await db.query(
      `SELECT rt.id, rt.revoked, rt.expires_at, u.id as user_id, r.nombre as role_nombre
       FROM refresh_tokens rt
       JOIN users u ON rt.fk_id_user = u.id
       JOIN roles r ON u.fk_id_role = r.id
       WHERE rt.token_hash = $1`,
      [tokenHash]
    );

    const storedToken = result.rows[0];

    if (!storedToken || storedToken.revoked) {
      return res.status(403).json({ error: "Refresh token inválido o revocado" });
    }

    if (new Date(storedToken.expires_at) < new Date()) {
      return res.status(403).json({ error: "Refresh token expirado" });
    }

    // revocar el token usado y emitir uno nuevo
    await db.query(
      `DELETE FROM refresh_tokens 
      WHERE fk_id_user = $1 
        AND (id = $2 OR expires_at < NOW() OR revoked = TRUE)`,
      [storedToken.user_id, storedToken.id]
    );

    const newAccessToken = jwt.sign(
      { id: storedToken.user_id, role: storedToken.role_nombre },
      ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRES }
    );

    const newRefreshToken = jwt.sign(
      { id: storedToken.user_id },
      REFRESH_TOKEN_SECRET,
      { expiresIn: `${REFRESH_TOKEN_EXPIRES_DAYS}d` }
    );

    const newTokenHash = hashToken(newRefreshToken);
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await db.query(
      `INSERT INTO refresh_tokens (fk_id_user, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [storedToken.user_id, newTokenHash, newExpiresAt]
    );

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    console.error("Error en /refresh:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

//  Logout
router.post("/logout", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
        await db.query(
          `DELETE FROM refresh_tokens 
          WHERE token_hash = $1`,
          [tokenHash]
        );
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return res.status(200).json({ message: "Sesión cerrada correctamente" });
  } catch (error) {
    console.error("Error en /logout:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

// perfil del usuario autenticado
router.get("/me", verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.correo, u.username, u.numberphone,
              r.nombre as role
       FROM users u
       JOIN roles r ON u.fk_id_role = r.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Error en /me:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});


router.put("/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, numberphone, correo, username, password } = req.body;

    // Solo el mismo usuario o un admin puede editar
    if (req.user.id !== parseInt(id) && req.user.role !== "admin") {
      return res.status(403).json({ error: "No tienes permisos para editar este perfil" });
    }

    let query = `UPDATE users SET `;
    let values = [];
    let setClauses = [];
    let counter = 1;

    if (name) {
      setClauses.push(`name = $${counter++}`);
      values.push(name);
    }
    if (numberphone) {
      setClauses.push(`numberphone = $${counter++}`);
      values.push(numberphone);
    }
    if (correo) {
      const existing = await db.query("SELECT id FROM users WHERE correo = $1 AND id != $2", [correo, id]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "El correo ya está en uso" });
      }
      setClauses.push(`correo = $${counter++}`);
      values.push(correo);
    }
    if (username) {
      const existing = await db.query("SELECT id FROM users WHERE username = $1 AND id != $2", [username, id]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "El username ya está en uso" });
      }
      setClauses.push(`username = $${counter++}`);
      values.push(username);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 12);
      setClauses.push(`password = $${counter++}`);
      values.push(hashedPassword);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: "No se enviaron datos para actualizar" });
    }

    query += setClauses.join(", ") + ` WHERE id = $${counter} RETURNING id, name, correo, username, numberphone`;
    values.push(id);

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    return res.status(200).json({
      message: "Perfil actualizado correctamente",
      user: result.rows[0]
    });
  } catch (error) {
    console.error("Error en PUT /:id :", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});



export default router;

