# MyZ Service Implementation Summary

## Overview

This service provides user authentication and data synchronization for the MyZ Annotator Chrome extension. It follows a RESTful API design with JWT-based authentication and PostgreSQL for data storage.

## What Was Created

### 1. Core Service Structure

```
service/
├── src/
│   ├── config/          # Database configuration and schema
│   ├── controllers/     # Business logic for routes
│   ├── middleware/      # Authentication and validation
│   ├── models/          # Data models
│   ├── routes/          # API route definitions
│   ├── scripts/         # Database migration scripts
│   ├── utils/           # Helper functions
│   └── index.ts         # Main application entry point
├── Dockerfile           # Docker container configuration
├── docker-compose.yml   # Docker Compose setup
├── package.json         # Node.js dependencies
├── tsconfig.json        # TypeScript configuration
├── .env.example         # Environment variables template
└── README.md            # Service documentation
```

### 2. API Endpoints

#### Authentication (`/api/auth`)
- `POST /register` - User registration with email/password
- `POST /login` - User login
- `GET /verify-email` - Email verification
- `POST /resend-verification` - Resend verification email
- `GET /profile` - Get user profile (authenticated)
- `GET /google` - Google OAuth login
- `GET /github` - GitHub OAuth login

#### Data Sync (`/api/sync`)
All sync endpoints require authentication and verified email:
- `POST /highlights` - Incremental sync of highlights
- `GET /status` - Get sync status
- `GET /highlights` - Get all highlights

### 3. Key Features

#### Authentication
- Email/password registration and login
- JWT token-based authentication (7-day default expiration)
- OAuth integration (Google, GitHub)
- Email verification requirement before sync access

#### Data Synchronization
- Incremental sync (only uploads/downloads changes)
- Last-write-wins conflict resolution
- File-based storage for highlight data
- PostgreSQL for metadata and user data

#### Security
- Password hashing with bcrypt
- JWT token management
- Helmet.js security headers
- CORS configuration
- Rate limiting (100 requests per 15 minutes)
- Email verification required for sensitive operations

### 4. Database Schema

#### Users Table
- User accounts and authentication
- Email verification status
- OAuth provider information

#### Sync Metadata Table
- Last sync timestamp per user
- Highlight count tracking

#### Highlights Metadata Table
- Metadata about synced highlights
- File path references
- Deletion tracking

#### Sessions Table
- Active session token tracking

### 5. Documentation

Three comprehensive documentation files were created:

1. **knowledges/service-api.md** (15KB)
   - Complete API reference in Chinese
   - All endpoints with request/response examples
   - Error handling documentation
   - Authentication flow examples
   - Code samples for integration

2. **service/SETUP_GUIDE.md** (4KB)
   - Quick start instructions
   - PostgreSQL setup
   - Gmail SMTP configuration
   - OAuth setup (Google, GitHub)
   - Docker quick start
   - Troubleshooting guide

3. **knowledges/extension-service-integration.md** (14KB)
   - Integration guide for the Chrome extension
   - Code examples for message handlers
   - UI implementation examples
   - OAuth callback handling
   - Auto-sync implementation
   - Security considerations

## Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL 14+
- **Authentication**: JWT, Passport.js
- **Email**: Nodemailer
- **Security**: Helmet, bcrypt, CORS
- **Validation**: Zod
- **Development**: ts-node-dev, ESLint

## Dependencies

### Production Dependencies
- express - Web framework
- pg - PostgreSQL client
- bcrypt - Password hashing
- jsonwebtoken - JWT authentication
- passport - OAuth middleware
- passport-google-oauth20 - Google OAuth
- passport-github2 - GitHub OAuth
- nodemailer - Email sending
- zod - Schema validation
- dotenv - Environment variables
- cors - CORS handling
- helmet - Security headers
- express-rate-limit - Rate limiting
- uuid - UUID generation

### Development Dependencies
- typescript - Type checking
- ts-node-dev - Development server
- eslint - Code linting
- @types/* - TypeScript definitions

## Getting Started

### 1. Prerequisites
- Node.js 18 or higher
- PostgreSQL 14 or higher
- Gmail account (for email verification)
- Optional: Docker & Docker Compose

### 2. Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration

# Create database
createdb myz_db

# Run migrations
npm run build
npm run migrate

# Start development server
npm run dev
```

### 3. Using Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Configuration

### Required Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myz_db
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your-secret-key

# SMTP (for email verification)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### Optional OAuth Configuration

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# GitHub OAuth
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback
```

## Data Flow

### Registration & Login
1. User submits email/password
2. Server creates account and sends verification email
3. User clicks verification link
4. User logs in and receives JWT token
5. Token used for subsequent API calls

### Data Synchronization
1. Extension collects highlights locally
2. User triggers sync (or automatic sync)
3. Extension sends all highlights to server
4. Server compares timestamps to determine changes
5. Server returns highlights to download
6. Extension merges server data with local data

## Security Considerations

### Production Deployment
- Use strong JWT_SECRET
- Enable HTTPS
- Configure precise CORS origins
- Use environment-specific configuration
- Enable PostgreSQL SSL
- Regularly update dependencies
- Monitor logs for suspicious activity

### Data Privacy
- Passwords are hashed with bcrypt
- Highlight data stored in user-specific directories
- JWT tokens expire after 7 days
- Email verification required for sensitive operations

## Testing

The service includes built-in health check endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-10-24T12:00:00.000Z"
}
```

## Next Steps

1. **Set up PostgreSQL** and create database
2. **Configure environment variables** in `.env`
3. **Run database migrations** to create tables
4. **Start the service** in development mode
5. **Test API endpoints** using curl or Postman
6. **Integrate with extension** following the integration guide
7. **Deploy to production** with proper security configuration

## Support

For issues or questions:
- Check the Setup Guide for common problems
- Review the API documentation
- Check the integration guide for extension connection
- Submit an issue on GitHub

## License

MIT
