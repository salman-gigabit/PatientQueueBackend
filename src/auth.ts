import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcrypt";
import { Request, Response, NextFunction } from "express";
import * as dotenv from "dotenv";

dotenv.config();

// JWT Configuration - read from .env file
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ALGORITHM = process.env.JWT_ALGORITHM as jwt.Algorithm;
const ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24; // 24 hours
export const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME;
export { ACCESS_TOKEN_EXPIRE_MINUTES };

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required in .env file");
}
if (!JWT_ALGORITHM) {
  throw new Error("JWT_ALGORITHM is required in .env file");
}
if (!JWT_COOKIE_NAME) {
  throw new Error("JWT_COOKIE_NAME is required in .env file");
}

export interface JWTPayload {
  sub: string | number;
  email?: string;
  role?: string;
  exp?: number;
  [key: string]: any;
}

export interface CurrentUser {
  user_id: number;
  email?: string;
  role?: string;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}

export function createAccessToken(
  data: Record<string, any>,
  expiresDelta?: number
): string {
  const toEncode: JWTPayload = { ...data };

  if ("sub" in toEncode && toEncode.sub !== undefined) {
    toEncode.sub = String(toEncode.sub);
  }

  const expiresIn = expiresDelta
    ? expiresDelta
    : ACCESS_TOKEN_EXPIRE_MINUTES * 60;

  const token = jwt.sign(toEncode, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: `${expiresIn}s`,
  });

  return token;
}

export function decodeToken(token: string): JWTPayload {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as JWTPayload;
    return payload;
  } catch (error) {
    console.error(`[AUTH] ❌ JWT decode failed: ${error}`);
    throw new Error("Invalid authentication credentials");
  }
}

function extractToken(request: Request): string {
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearerToken = authHeader
      .split(" ", 2)[1]
      .trim()
      .replace(/^"|"$/g, "")
      .trim();
    if (
      bearerToken &&
      bearerToken.toLowerCase() !== "null" &&
      bearerToken.toLowerCase() !== "undefined"
    ) {
      console.log(
        `[AUTH] ✅ Token found in Authorization header (length: ${bearerToken.length})`
      );
      return bearerToken;
    }
  }

  // Try cookie
  const cookieToken = request.cookies?.[JWT_COOKIE_NAME];
  if (cookieToken) {
    console.log(
      `[AUTH] ✅ Token found in cookie: ${JWT_COOKIE_NAME} (length: ${cookieToken.length})`
    );
    return cookieToken;
  }

  // Enhanced debug logging
  console.error(`[AUTH] ❌ No token found!`);
  console.error(`[AUTH] Request method: ${request.method}`);
  console.error(`[AUTH] Request URL: ${request.url}`);
  console.error(
    `[AUTH] Available cookies: ${Object.keys(request.cookies || {})}`
  );
  console.error(`[AUTH] Authorization header: ${authHeader}`);
  console.error(`[AUTH] All headers:`, request.headers);

  throw new Error("Invalid authentication credentials");
}

export async function getCurrentUser(
  request: Request,
  response?: Response,
  next?: NextFunction
): Promise<CurrentUser | void> {
  try {
    const token = extractToken(request);
    const payload = decodeToken(token);
    const userIdRaw = payload.sub;

    if (userIdRaw === undefined || userIdRaw === null) {
      const error = new Error("Invalid authentication credentials");
      if (response) {
        response.status(401).json({
          message: "Invalid authentication credentials",
        });
        response.setHeader("WWW-Authenticate", "Bearer");
      }
      throw error;
    }

    // Ensure user_id is an integer (JWT might return string or int)
    const userId =
      typeof userIdRaw === "number"
        ? userIdRaw
        : parseInt(String(userIdRaw), 10);

    const currentUser: CurrentUser = {
      user_id: userId,
      email: payload.email,
      role: payload.role,
    };

    if (next && response) {
      (request as any).currentUser = currentUser;
      next();
      return;
    }
    return currentUser;
  } catch (error) {
    if (response) {
      response.status(401).json({
        message:
          error instanceof Error
            ? error.message
            : "Invalid authentication credentials",
      });
      response.setHeader("WWW-Authenticate", "Bearer");
    }
    throw error;
  }
}

// Express middleware for authentication
export function authMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = extractToken(req);
      const payload = decodeToken(token);
      const userIdRaw = payload.sub;

      if (userIdRaw === undefined || userIdRaw === null) {
        return res.status(401).json({
          message: "Invalid authentication credentials",
        });
      }

      // Ensure user_id is an integer (JWT might return string or int)
      const userId =
        typeof userIdRaw === "number"
          ? userIdRaw
          : parseInt(String(userIdRaw), 10);

      (req as any).currentUser = {
        user_id: userId,
        email: payload.email,
        role: payload.role,
      };
      next();
    } catch (error) {
      res.status(401).json({
        message:
          error instanceof Error
            ? error.message
            : "Invalid authentication credentials",
      });
      res.setHeader("WWW-Authenticate", "Bearer");
    }
  };
}
