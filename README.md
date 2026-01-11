# Clinic Patient Queue API

A Node.js/TypeScript backend API for managing clinic patient queues with authentication and PostgreSQL database.

## Features

- Patient queue management (create, list, mark as visited)
- User authentication with JWT tokens (cookie-based and Bearer token)
- PostgreSQL database integration
- TypeScript for type safety
- Express.js web framework
- CORS support for frontend integration

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd myClinicBackend
```

2. Install dependencies:
```bash
npm install
```

3. Set up PostgreSQL database:
```bash
# Create a PostgreSQL database
createdb clinic

# Or using psql:
psql -U postgres
CREATE DATABASE clinic;
```

4. Create a `.env` file in the root directory:
```env
DATABASE_URL=postgresql://username:password@localhost:5432/clinic
JWT_SECRET=your-secret-key-change-this-in-production
JWT_ALGORITHM=HS256
JWT_COOKIE_NAME=access_token
PORT=8000
```

## Development

Run the development server (with hot-reload):
```bash
npm run dev
```

Build TypeScript:
```bash
npm run build
```

Run the production server:
```bash
npm start
```

Type check without building:
```bash
npm run type-check
```

## API Endpoints

### Authentication
- `POST /auth/signup` - Register a new user
- `POST /auth/login` - Login and get JWT token
- `POST /auth/logout` - Logout (clears cookie)
- `GET /auth/me` - Get current authenticated user (requires authentication)

### Patients (all require authentication)
- `GET /patients` - Get all waiting patients
- `POST /patients` - Create a new patient
- `PUT /patients/:id/visit` - Mark a patient as visited
- `GET /patients/stats` - Get patient statistics

### Other
- `GET /` - API information
- `GET /health` - Health check
- `GET /debug/db-info` - Database diagnostic information

## Default Admin User

On first run, a default admin user is created:
- Email: `admin@clinic.com`
- Password: `admin123`

## Technology Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL (with pg library)
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcrypt
- **Validation**: Zod
- **Environment Variables**: dotenv

## Project Structure

```
myClinicBackend/
├── src/
│   ├── main.ts          # Express app and routes
│   ├── db.ts            # Database operations
│   ├── auth.ts          # Authentication utilities
│   └── classes.ts       # Type definitions and Zod schemas
├── data.json            # Initial patient data (migrated to DB)
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── README.md            # This file
```
