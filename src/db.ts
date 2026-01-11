/**
 * Database module using PostgreSQL.
 * All authentication and application data is stored in a PostgreSQL database.
 * Requires PostgreSQL server to be running and configured.
 */
import { Pool, PoolClient } from "pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { hashPassword } from "./auth";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "Missing required DATABASE_URL environment variable. " +
      "Please ensure .env file contains DATABASE_URL"
  );
}

// Connection pool for better performance
let connectionPool: Pool | null = null;

export function getDbConnection(): Pool {
  if (connectionPool === null) {
    try {
      connectionPool = new Pool({
        connectionString: DATABASE_URL,
        min: 1,
        max: 10,
      });
    } catch (error) {
      connectionPool = null;
      throw new Error(`Failed to create database connection pool: ${error}`);
    }
  }
  return connectionPool;
}

export async function getDbClient(): Promise<PoolClient> {
  const pool = getDbConnection();
  try {
    return await pool.connect();
  } catch (error) {
    throw new Error(`Failed to get database connection: ${error}`);
  }
}

export async function initDb(): Promise<void> {
  let client: PoolClient | null = null;
  try {
    client = await getDbClient();
  } catch (error) {
    console.error(`ERROR: Failed to connect to database: ${error}`);
    console.error(`Please ensure PostgreSQL is running and the database is accessible.`);
    const urlParts = DATABASE_URL.split("@");
    if (urlParts.length > 0) {
      console.error(`Connection URL: ${urlParts[0]}@***`);
    }
    throw error;
  }

  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user'
      )
    `);

    // Create patients table
    await client.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        problem TEXT NOT NULL,
        priority VARCHAR(50) NOT NULL,
        "arrivalTime" VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL
      )
    `);


    // Create default admin user if it doesn't exist
    const adminCheck = await client.query(
      "SELECT id FROM users WHERE email = $1",
      ["admin@clinic.com"]
    );

    if (adminCheck.rows.length === 0) {
      const hashedPassword = await hashPassword("admin123");
      await client.query(
        `
        INSERT INTO users (name, email, password, role)
        VALUES ($1, $2, $3, $4)
      `,
        ["Admin User", "admin@clinic.com", hashedPassword, "admin"]
      );
    }

    // Migrate data from data.json if patients table is empty
    const patientCountResult = await client.query(
      'SELECT COUNT(*) as c FROM patients'
    );
    const patientCount = parseInt(patientCountResult.rows[0].c, 10);

    if (patientCount === 0) {
      const dataFile = path.join(__dirname, "..", "data.json");
      if (fs.existsSync(dataFile)) {
        try {
          const dataContent = fs.readFileSync(dataFile, "utf-8");
          const data = JSON.parse(dataContent);
          for (const p of data) {
            await client.query(
              `
              INSERT INTO patients (id, name, problem, priority, "arrivalTime", status)
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
              [
                p.id,
                p.name,
                p.problem,
                p.priority,
                p.arrivalTime,
                p.status,
              ]
            );
          }
        } catch (error) {
          // Ignore errors during migration
        }
      }
    }
  } finally {
    if (client) {
      client.release();
    }
  }
}

interface PatientRow {
  id: number;
  name: string;
  problem: string;
  priority: string;
  arrivalTime?: string;
  arrivaltime?: string;
  arrival_time?: string;
  status: string;
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  password?: string;
}

function rowToPatient(r: PatientRow): {
  id: number;
  name: string;
  problem: string;
  priority: string;
  arrivalTime: string;
  status: string;
} {
  const arrival =
    r.arrivalTime || r.arrivaltime || r.arrival_time || "";
  return {
    id: r.id,
    name: r.name,
    problem: r.problem,
    priority: r.priority,
    arrivalTime: arrival,
    status: r.status,
  };
}

function rowToUser(r: UserRow): {
  id: number;
  name: string;
  email: string;
  role: string;
} {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
  };
}

// User authentication functions - all user data stored in PostgreSQL
export async function createUser(
  name: string,
  email: string,
  password: string,
  role: string = "user"
): Promise<{ id: number; name: string; email: string; role: string }> {
  const client = await getDbClient();
  const hashedPassword = await hashPassword(password);

  try {
    const result = await client.query(
      `
      INSERT INTO users (name, email, password, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role
    `,
      [name, email, hashedPassword, role]
    );
    return rowToUser(result.rows[0]);
  } catch (error: any) {
    if (error.code === "23505") {
      // Unique violation (duplicate email)
      throw new Error("Email already exists");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function getUserByEmail(email: string): Promise<{
  id: number;
  name: string;
  email: string;
  password: string;
  role: string;
} | null> {
  const client = await getDbClient();
  try {
    const result = await client.query(
      "SELECT id, name, email, password, role FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.role,
    };
  } finally {
    client.release();
  }
}

export async function getUserById(
  user_id: number
): Promise<{
  id: number;
  name: string;
  email: string;
  role: string;
} | null> {
  const client = await getDbClient();
  try {
    const result = await client.query(
      "SELECT id, name, email, role FROM users WHERE id = $1",
      [user_id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return rowToUser(result.rows[0]);
  } finally {
    client.release();
  }
}

// Patient functions
export async function getAllPatients(): Promise<
  Array<{
    id: number;
    name: string;
    problem: string;
    priority: string;
    arrivalTime: string;
    status: string;
  }>
> {
  const client = await getDbClient();
  try {
    const result = await client.query(`
      SELECT * FROM patients 
      WHERE status='Waiting' 
      ORDER BY 
        CASE WHEN priority='Emergency' THEN 0 ELSE 1 END,
        "arrivalTime" ASC
    `);
    return result.rows.map((r) => rowToPatient(r as PatientRow));
  } finally {
    client.release();
  }
}

export async function addPatient(
  name: string,
  problem: string,
  priority: string
): Promise<{
  id: number;
  name: string;
  problem: string;
  priority: string;
  arrivalTime: string;
  status: string;
}> {
  const client = await getDbClient();
  try {
    const arrival = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

    const result = await client.query(
      `
      INSERT INTO patients (name, problem, priority, "arrivalTime", status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
      [name, problem, priority, arrival, "Waiting"]
    );

    return rowToPatient(result.rows[0] as PatientRow);
  } finally {
    client.release();
  }
}

export async function markVisited(
  patient_id: number
): Promise<
  [
    {
      id: number;
      name: string;
      problem: string;
      priority: string;
      arrivalTime: string;
      status: string;
    } | null,
    string | null
  ]
> {
  const client = await getDbClient();
  try {
    const checkResult = await client.query(
      "SELECT * FROM patients WHERE id = $1",
      [patient_id]
    );

    if (checkResult.rows.length === 0) {
      return [null, "not_found"];
    }

    const row = checkResult.rows[0];
    if (row.status === "Visited") {
      return [null, "already_visited"];
    }

    const updateResult = await client.query(
      'UPDATE patients SET status=\'Visited\' WHERE id = $1 RETURNING *',
      [patient_id]
    );

    return [rowToPatient(updateResult.rows[0] as PatientRow), null];
  } finally {
    client.release();
  }
}

export async function getStats(): Promise<{
  totalWaiting: number;
  totalEmergency: number;
  totalVisited: number;
}> {
  const client = await getDbClient();
  try {
    const waitingResult = await client.query(
      "SELECT COUNT(*) as count FROM patients WHERE status='Waiting'"
    );
    const waiting = parseInt(waitingResult.rows[0].count, 10);

    const emergencyResult = await client.query(
      `
      SELECT COUNT(*) as count FROM patients
      WHERE status='Waiting' AND priority='Emergency'
    `
    );
    const emergency = parseInt(emergencyResult.rows[0].count, 10);

    const visitedResult = await client.query(
      "SELECT COUNT(*) as count FROM patients WHERE status='Visited'"
    );
    const visited = parseInt(visitedResult.rows[0].count, 10);

    return {
      totalWaiting: waiting,
      totalEmergency: emergency,
      totalVisited: visited,
    };
  } finally {
    client.release();
  }
}

// Export connection pool and URL for debugging
export { getDbConnection, DATABASE_URL };

