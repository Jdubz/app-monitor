# Environment Variable Setup Guide

## Overview

This project uses environment variables for configuration. **Environment files (.env) are NOT committed to git for security reasons.**

## Frontend Environment Variables

### Development Setup

1. Copy the example file:
   ```bash
   cp frontend/.env.example frontend/.env.development
   ```

2. Edit `frontend/.env.development` and set:
   ```bash
   VITE_API_BASE_URL=http://localhost:5000
   VITE_PASSWORD=your-dev-password
   ```

### Production Setup

#### On Production Server

1. Create the production environment file:
   ```bash
   sudo mkdir -p /opt/app-monitor/shared/config
   sudo nano /opt/app-monitor/shared/config/.env.production
   ```

2. Add the following content:
   ```bash
   VITE_PASSWORD="your-strong-production-password"
   ```

3. Set appropriate permissions:
   ```bash
   sudo chown jdubz:jdubz /opt/app-monitor/shared/config/.env.production
   sudo chmod 600 /opt/app-monitor/shared/config/.env.production
   ```

## How It Works

### CI/CD Pipeline

1. GitHub Actions runs tests and builds the backend
2. The source code is packaged into a deployment artifact
3. The deployment artifact is uploaded to GitHub (frontend is NOT pre-built)

### Production Deployment

1. The deploy agent downloads the artifact
2. The deployment script extracts it to the production server
3. **The script builds the frontend on the server**, loading `VITE_PASSWORD` from `/opt/app-monitor/shared/config/.env.production`
4. The password is embedded in the built JavaScript bundle during this server-side build
5. The built files are served by nginx

**Note:** The frontend is built on the production server (not in CI/CD) to ensure the correct environment-specific password is used.

## Security Notes

- ✅ `.env`, `.env.development`, and `.env.production` are in `.gitignore`
- ✅ Only `.env.example` is committed to git (with placeholder values)
- ✅ Server-side `.env.production` has restricted permissions (600)
- ⚠️ The password is embedded in the frontend bundle (client-side protection only)
- ⚠️ For sensitive applications, use server-side authentication instead

## Troubleshooting

### Password Not Working in Production

1. Check if the password is set on the production server:
   ```bash
   ssh your-server
   cat /opt/app-monitor/shared/config/.env.production
   # Should show: VITE_PASSWORD="your-password"
   ```

2. Rebuild the frontend if the password was just added:
   ```bash
   cd /opt/app-monitor/current/frontend
   VITE_PASSWORD="your-password" npm run build
   ```

### Development Password Not Working

1. Ensure you have `.env.development` file:
   ```bash
   ls -la frontend/.env.development
   ```

2. Check if `VITE_PASSWORD` is set:
   ```bash
   grep VITE_PASSWORD frontend/.env.development
   ```

3. Restart the dev server after changing the `.env` file

## Backend Environment Variables

See `backend/.env.example` for backend configuration options. The backend uses a different authentication mechanism (API keys).
