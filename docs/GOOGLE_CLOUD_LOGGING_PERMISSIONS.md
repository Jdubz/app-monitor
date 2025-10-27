# Google Cloud Logging Permissions Setup

## Problem
The app-monitor backend requires permission to read logs from Google Cloud Logging. Without the proper IAM roles, you'll encounter this error:

```
[ERROR] cloud:fetch_logs_failed - Failed to fetch cloud logs 
  Error: 7 PERMISSION_DENIED: Permission denied for all log views
```

## Solution

### Required IAM Role
The service account used by the app-monitor backend needs the **Logs Viewer** role to read Cloud Logging entries.

### Grant Permission

```bash
gcloud projects add-iam-policy-binding <PROJECT_ID> \
  --member="serviceAccount:<SERVICE_ACCOUNT_EMAIL>" \
  --role="roles/logging.viewer"
```

### Example (for static-sites-257923 project)

```bash
gcloud projects add-iam-policy-binding static-sites-257923 \
  --member="serviceAccount:firebase-adminsdk-lfb0c@static-sites-257923.iam.gserviceaccount.com" \
  --role="roles/logging.viewer"
```

## Verification

### Check Current Permissions
```bash
gcloud projects get-iam-policy <PROJECT_ID> \
  --flatten="bindings[].members" \
  --format="table(bindings.role)" \
  --filter="bindings.members:<SERVICE_ACCOUNT_EMAIL>"
```

You should see:
- `roles/logging.logWriter` - Allows writing logs
- `roles/logging.viewer` - Allows reading logs ✓

## Configuration

The app-monitor backend reads the service account key from:
```
GOOGLE_APPLICATION_CREDENTIALS=../../.firebase/serviceAccountKey.json
```

This is configured in `app-monitor/backend/.env` and points to the root-level `.firebase/serviceAccountKey.json` file.

## IAM Roles Explained

| Role | Permission | Purpose |
|------|-----------|---------|
| `roles/logging.logWriter` | Write logs | Firebase functions and services write logs |
| `roles/logging.viewer` | Read logs | App-monitor backend reads and displays logs |
| `roles/logging.privateLogViewer` | Read logs + private data | Not typically needed |

## Troubleshooting

### Error: "Permission denied for all log views"
- **Cause**: Service account lacks `roles/logging.viewer`
- **Fix**: Grant the role using the command above

### Error: "Could not load credentials"
- **Cause**: Missing or invalid service account key file
- **Fix**: Ensure `.firebase/serviceAccountKey.json` exists and is readable

### Error: "Default credentials not found"
- **Cause**: Neither key file nor Application Default Credentials (ADC) are configured
- **Fix**: 
  1. Set `GOOGLE_APPLICATION_CREDENTIALS` in `.env`
  2. Or run `gcloud auth application-default login`

## Security Notes

- The service account key file contains sensitive credentials
- Never commit `.firebase/serviceAccountKey.json` to version control
- Rotate service account keys periodically
- Use least privilege: only grant roles that are actually needed

## Related Files
- `app-monitor/backend/src/services/cloudLogging.ts` - Cloud Logging client implementation
- `app-monitor/backend/src/config.ts` - Configuration including GCP key file path
- `app-monitor/backend/.env` - Environment variables including GOOGLE_APPLICATION_CREDENTIALS
