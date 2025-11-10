# API Authentication Setup

## Overview

Simple API key authentication has been added to protect the API from unauthorized access.

## Configuration

### Backend

1. Copy the example env file:
```bash
cp backend/.env.example backend/.env
```

2. Set a strong API key in `backend/.env`:
```env
API_KEY=your-secure-random-key-here
REQUIRE_AUTH=true
```

3. Generate a secure key:
```bash
# Generate a random 32-character key
openssl rand -base64 32
```

### Frontend

1. Copy the example env file:
```bash
cp frontend/.env.example frontend/.env
```

2. Set the same API key in `frontend/.env`:
```env
VITE_API_KEY=your-secure-random-key-here
```

## Usage

### Frontend (TypeScript/React)

Use the provided `apiClient` utility:

```typescript
import { apiClient } from '@/utils/apiClient';

// GET request
const tasks = await apiClient.get('/dev-bots/tasks');

// POST request
const newTask = await apiClient.post('/dev-bots/tasks', {
  title: 'My task',
  description: 'Task description'
});
```

### curl Commands

Include the `X-API-Key` header:

```bash
curl -H "X-API-Key: your-api-key-here" \
  https://app-monitor.joshwentworth.com/api/dev-bots/tasks
```

### fetch/JavaScript

```javascript
fetch('https://app-monitor.joshwentworth.com/api/dev-bots/tasks', {
  headers: {
    'X-API-Key': 'your-api-key-here'
  }
})
```

## Endpoints

### Public (No Auth Required)
- `GET /api/health` - Health check
- `POST /api/github/webhooks/*` - GitHub webhooks (uses GitHub signature verification)

### Protected (API Key Required)
- All `/api/dev-bots/*` endpoints
- All `/api/services/*` endpoints  
- All `/api/docker/*` endpoints
- All `/api/logs/*` endpoints
- All other API endpoints

## Development

To disable auth during development:

```env
# backend/.env
REQUIRE_AUTH=false
```

## Production Deployment

1. **Set a strong API key** on the production server:
```bash
# On production server
echo "API_KEY=$(openssl rand -base64 32)" >> /opt/app-monitor/shared/.env
echo "REQUIRE_AUTH=true" >> /opt/app-monitor/shared/.env
```

2. **Update frontend build** with the production API key:
```bash
# Set in CI/CD or build environment
export VITE_API_KEY="your-production-key"
npm run build
```

3. **Restart backend** to pick up new environment variables:
```bash
sudo systemctl restart app-monitor-backend@5001
```

## Security Notes

- ⚠️ **Change the default key** - Never use `dev-key-change-in-production` in production
- 🔒 API keys are logged (partial) for debugging - monitor security logs
- 🔐 Store API keys in environment variables, not in code
- 🚫 Do not commit `.env` files to git (already in .gitignore)
- 📝 Rotate API keys periodically for better security

## Future Enhancements

This is a simple authentication system. Future improvements could include:

- Rate limiting per API key
- Multiple API keys with different permissions
- API key rotation/expiration
- OAuth2/JWT authentication
- IP whitelisting
- Request signing for additional security

## Troubleshooting

### 401 Unauthorized
- Check that `X-API-Key` header is included
- Verify the API key matches between frontend and backend
- Check backend logs for auth failures

### Auth disabled but still getting 401
- Verify `REQUIRE_AUTH=false` in backend `.env`
- Restart backend after changing `.env`
- Check `config.requireAuth` value in logs

### Frontend can't connect
- Verify `VITE_API_KEY` is set in `frontend/.env`
- Rebuild frontend after changing `.env` files
- Check browser console for auth errors
