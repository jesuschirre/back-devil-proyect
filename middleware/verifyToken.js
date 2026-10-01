// middleware/verifyToken.js
import jwt from "jsonwebtoken";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
    // decoded = { id, role, iat, exp }

    // Guardamos los datos del usuario en req para usarlos en el resto del request
    req.user = {
      id: decoded.id,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expirado" });
    }
    return res.status(403).json({ error: "Token inválido" });
  }
}

// Middleware adicional para restringir por rol
export function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user || !rolesPermitidos.includes(req.user.role)) {
      return res.status(403).json({ error: "No tienes permisos para esta acción" });
    }
    next();
  };
}