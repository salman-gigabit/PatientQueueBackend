import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import * as dotenv from "dotenv";
import {
  initDb,
  getAllPatients,
  addPatient,
  markVisited,
  getStats,
  createUser,
  getUserByEmail,
  getUserById,
  getDbConnection,
  DATABASE_URL,
} from "./db";
import {
  PatientIn,
  Patient,
  SignupRequest,
  LoginRequest,
  AuthResponse,
  UserResponse,
  MessageResponse,
  validatePatientIn,
  validateSignupRequest,
  validateLoginRequest,
  patientSchema,
  signupRequestSchema,
  loginRequestSchema,
  userResponseSchema,
  authResponseSchema,
  messageResponseSchema,
  Priority,
} from "./classes";
import {
  verifyPassword,
  createAccessToken,
  getCurrentUser,
  authMiddleware,
  JWT_COOKIE_NAME,
  ACCESS_TOKEN_EXPIRE_MINUTES,
} from "./auth";

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: [
    "http://localhost:5173", // Vite default port
    "http://localhost:3000", // Create React App default port
    "http://localhost:5174", // Alternative Vite port
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
  ],
  credentials: true,
  methods: ["*"],
  allowedHeaders: ["*"],
}));
app.use(cookieParser());
app.use(express.json());

// Initialize database on startup (non-blocking - app will start even if DB is unavailable)
const initializeDatabase = async () => {
  try {
    await initDb();
    console.log("✅ Database initialized successfully");
  } catch (error) {
    console.error(`⚠️  Warning: Database initialization failed: ${error}`);
    console.error("   The app will start, but database operations may fail until connection is established.");
  }
};

// Root endpoint
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Clinic Patient Queue API",
    version: "1.0.0",
    docs: "/docs",
    openapi: "/openapi.json",
  });
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "healthy" });
});

// Database diagnostic endpoint (for debugging)
app.get("/debug/db-info", async (req: Request, res: Response) => {
  try {
    const parsed = DATABASE_URL ? new URL(DATABASE_URL) : null;

    const info: any = {
      database_url: parsed
        ? `${parsed.protocol}//${parsed.username}@${parsed.hostname}:${parsed.port}${parsed.pathname}`
        : "Not configured",
      working_directory: process.cwd(),
    };

    try {
      const pool = getDbConnection();
      const client = await pool.connect();

      // Get user count
      const userCountResult = await client.query(
        "SELECT COUNT(*) as count FROM users"
      );
      const userCount = parseInt(userCountResult.rows[0].count, 10);

      // Get patient count
      const patientCountResult = await client.query(
        "SELECT COUNT(*) as count FROM patients"
      );
      const patientCount = parseInt(patientCountResult.rows[0].count, 10);

      // Get all user emails (for verification)
      const emailsResult = await client.query(
        "SELECT email FROM users ORDER BY id"
      );
      const emails = emailsResult.rows.map((row) => row.email);

      client.release();

      info.user_count = userCount;
      info.patient_count = patientCount;
      info.user_emails = emails;
      info.connection_status = "connected";
    } catch (error: any) {
      info.error = error.message;
      info.connection_status = "error";
    }

    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Favicon endpoint (prevents 404 errors from browsers)
app.get("/favicon.ico", (req: Request, res: Response) => {
  res.status(204).send();
});

// Authentication Endpoints
app.post("/auth/signup", async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = validateSignupRequest(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: validation.error.errors.map((e) => e.message).join(", "),
      });
    }

    const payload: SignupRequest = validation.data;

    let user;
    try {
      user = await createUser(payload.name, payload.email, payload.password, "user");
    } catch (error: any) {
      if (error.message === "Email already exists") {
        return res.status(400).json({ message: error.message });
      }
      throw error;
    }

    // Create JWT token (ensure sub is an integer for consistency)
    const token = createAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    // Set HttpOnly cookie for the JWT so the frontend can rely on cookies
    res.cookie(JWT_COOKIE_NAME || "access_token", token, {
      maxAge: ACCESS_TOKEN_EXPIRE_MINUTES * 60 * 1000,
      httpOnly: true,
      secure: false, // set to true in production when using HTTPS
      sameSite: "lax",
      path: "/",
    });
    console.log(`[SIGNUP] Cookie set: ${JWT_COOKIE_NAME}=${token.substring(0, 20)}...`);

    const authResponse: AuthResponse = {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as any,
      },
    };

    // Log successful signup for debugging
    console.log(`[SIGNUP] New user created: ${user.email} (ID: ${user.id})`);

    res.status(201).json(authResponse);
  } catch (error: any) {
    console.error("[SIGNUP] Error:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
});

app.post("/auth/login", async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = validateLoginRequest(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: validation.error.errors.map((e) => e.message).join(", "),
      });
    }

    const payload: LoginRequest = validation.data;

    const user = await getUserByEmail(payload.email);

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isPasswordValid = await verifyPassword(payload.password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Create JWT token (ensure sub is an integer for consistency)
    const token = createAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    // Set HttpOnly cookie for the JWT so the frontend can rely on cookies
    res.cookie(JWT_COOKIE_NAME || "access_token", token, {
      maxAge: ACCESS_TOKEN_EXPIRE_MINUTES * 60 * 1000,
      httpOnly: true,
      secure: false, // set to true in production when using HTTPS
      sameSite: "lax",
      path: "/",
    });
    console.log(`[LOGIN] Cookie set: ${JWT_COOKIE_NAME}=${token.substring(0, 20)}...`);

    const authResponse: AuthResponse = {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as any,
      },
    };

    res.json(authResponse);
  } catch (error: any) {
    console.error("[LOGIN] Error:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
});

app.post("/auth/logout", (req: Request, res: Response) => {
  res.cookie(JWT_COOKIE_NAME || "access_token", "", {
    maxAge: 0,
    httpOnly: true,
    secure: false, // set to true in production when using HTTPS
    sameSite: "lax",
    path: "/",
  });
  const response: MessageResponse = { message: "Logged out successfully" };
  res.json(response);
});

app.get("/auth/me", authMiddleware(), async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).currentUser;
    const user_id = currentUser.user_id;
    const user = await getUserById(user_id);

    if (!user) {
      console.log(`[AUTH/ME] User not found for ID: ${user_id}`);
      return res.status(404).json({ message: "User not found" });
    }

    console.log(`[AUTH/ME] User found: ${user.email} (ID: ${user.id})`);
    const userResponse: UserResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as any,
    };
    res.json(userResponse);
  } catch (error: any) {
    console.error("[AUTH/ME] Error:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
});

// Patient Endpoints (all require authentication)
app.get("/patients", authMiddleware(), async (req: Request, res: Response) => {
  try {
    const patients = await getAllPatients();
    res.json(patients);
  } catch (error: any) {
    console.error("[GET /patients] Error:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
});

app.post("/patients", authMiddleware(), async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).currentUser;
    console.log(`[CREATE_PATIENT] Request from user: ${currentUser.email} (ID: ${currentUser.user_id})`);

    // Validate request body
    const validation = validatePatientIn(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: validation.error.errors.map((e) => e.message).join(", "),
      });
    }

    const payload: PatientIn = validation.data;
    console.log(`[CREATE_PATIENT] Patient data: name=${payload.name}, problem=${payload.problem}, priority=${payload.priority}`);

    try {
      const patient = await addPatient(
        payload.name.trim(),
        payload.problem.trim(),
        payload.priority === Priority.Emergency ? "Emergency" : "Normal"
      );
      console.log(`[CREATE_PATIENT] Patient created successfully: ID=${patient.id}`);
      res.status(201).json(patient);
    } catch (error: any) {
      console.error(`[CREATE_PATIENT] Error creating patient: ${error.message}`);
      res.status(500).json({ message: `Failed to create patient: ${error.message}` });
    }
  } catch (error: any) {
    console.error("[CREATE_PATIENT] Error:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
});

app.put("/patients/:patient_id/visit", authMiddleware(), async (req: Request, res: Response) => {
  try {
    const patient_id = parseInt(req.params.patient_id, 10);
    const [patient, err] = await markVisited(patient_id);

    if (err === "not_found") {
      return res.status(404).json({ message: "Patient not found" });
    }
    if (err === "already_visited") {
      return res.status(400).json({ message: "Patient already visited" });
    }

    const response: MessageResponse = {
      message: "Patient marked as visited successfully",
    };
    res.json(response);
  } catch (error: any) {
    console.error("[PUT /patients/:id/visit] Error:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
});

app.get("/patients/stats", authMiddleware(), async (req: Request, res: Response) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (error: any) {
    console.error("[GET /patients/stats] Error:", error);
    res.status(500).json({ message: error.message || "Internal server error" });
  }
});

// Error handlers
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: err.message || "Internal server error" });
});

// Start server
const PORT = process.env.PORT || 8000;

initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});

export default app;

