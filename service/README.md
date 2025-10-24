# MyZ Annotator Service

Backend service for MyZ Annotator Chrome extension, providing user authentication and data synchronization.

## Features

- **User Authentication**
  - Email/password registration and login
  - Email verification required before full access
  - Third-party OAuth (Google, GitHub)
  - JWT-based authentication

- **Data Synchronization**
  - Incremental sync between client and server
  - Conflict resolution (last-write-wins)
  - File-based storage for highlight data
  - PostgreSQL for user metadata

- **Security**
  - Helmet.js for HTTP security headers
  - Rate limiting to prevent abuse
  - CORS configuration
  - Password hashing with bcrypt
  - JWT token expiration

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- SMTP server for email verification (e.g., Gmail)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Copy the environment template:
```bash
cp .env.example .env
```

3. Configure your `.env` file with:
   - Database credentials
   - JWT secret
   - SMTP settings for email
   - OAuth credentials (Google, GitHub)
   - Frontend URL (your extension ID)

4. Create the database:
```bash
createdb myz_db
```

5. Run migrations:
```bash
npm run build
npm run migrate
```

## Development

Start the development server with auto-reload:
```bash
npm run dev
```

The server will run on `http://localhost:3000` by default.

## Production

Build and start the production server:
```bash
npm run build
npm start
```

## API Endpoints

See [API Documentation](../knowledges/service-api.md) for detailed endpoint information.

### Authentication Endpoints

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with email/password
- `GET /api/auth/verify-email?token=...` - Verify email
- `POST /api/auth/resend-verification` - Resend verification email
- `GET /api/auth/profile` - Get user profile
- `GET /api/auth/google` - Google OAuth
- `GET /api/auth/github` - GitHub OAuth

### Sync Endpoints (require verified email)

- `POST /api/sync/highlights` - Sync highlights
- `GET /api/sync/status` - Get sync status
- `GET /api/sync/highlights` - Get all highlights

## OAuth Setup

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
6. Copy Client ID and Secret to `.env`

### GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set Authorization callback URL: `http://localhost:3000/api/auth/github/callback`
4. Copy Client ID and Secret to `.env`

## Email Configuration

For Gmail SMTP:

1. Enable 2-factor authentication on your Google account
2. Generate an App Password
3. Use the app password in `SMTP_PASSWORD`

## Data Storage

Highlight data is stored as JSON files in the `DATA_STORAGE_PATH` directory (default: `./data/highlights`).

Structure:
```
data/
  highlights/
    <user-id>/
      <highlight-id>.json
      <highlight-id>.json
      ...
```

## Database Schema

The service uses PostgreSQL with the following tables:

- `users` - User accounts and authentication
- `sync_metadata` - Sync tracking per user
- `highlights_metadata` - Metadata for synced highlights
- `sessions` - Active session tokens

## Testing

```bash
npm test
```

## Linting

```bash
npm run lint
```

## Environment Variables

See `.env.example` for all available configuration options.

## Security Considerations

- Change `JWT_SECRET` to a strong random value in production
- Use HTTPS in production
- Configure CORS to only allow your extension origin
- Set up proper PostgreSQL user permissions
- Regularly rotate OAuth secrets
- Enable PostgreSQL SSL connections in production
- Set appropriate rate limits based on your needs

## License

MIT
