# Cloudflare Tunnel for App Monitor

This document describes the Cloudflare Tunnel setup for exposing the app-monitor backend to the internet for GitHub webhooks.

## Tunnel Information

- **Tunnel Name:** `app-monitor`
- **Tunnel ID:** `f522d5d2-4766-4b01-b35a-5f624d443d2c`
- **Public URL:** `https://app-monitor.joshwentworth.com`
- **Local Service:** `http://localhost:80` (nginx)
- **Config File:** `/home/jdubz/.cloudflared/app-monitor-config.yml`
- **Credentials:** `/home/jdubz/.cloudflared/f522d5d2-4766-4b01-b35a-5f624d443d2c.json`

## Setup Commands

### Install and Start Tunnel Service

```bash
# Copy service file
sudo cp /tmp/cloudflared-app-monitor.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable cloudflared-app-monitor.service

# Start the service
sudo systemctl start cloudflared-app-monitor.service

# Check status
sudo systemctl status cloudflared-app-monitor.service
```

### Verify Tunnel is Working

```bash
# Check tunnel status
cloudflared tunnel info app-monitor

# Test health endpoint
curl https://app-monitor.joshwentworth.com/api/github/webhooks/health

# Expected response:
# {
#   "success": true,
#   "message": "GitHub webhooks endpoint is healthy",
#   "timestamp": "2025-11-10T03:58:00.000Z"
# }
```

## Service Management

```bash
# View logs
sudo journalctl -u cloudflared-app-monitor.service -f

# Restart service
sudo systemctl restart cloudflared-app-monitor.service

# Stop service
sudo systemctl stop cloudflared-app-monitor.service

# Check service status
sudo systemctl status cloudflared-app-monitor.service
```

## GitHub Webhook Configuration

Now that the tunnel is set up, configure GitHub webhooks:

### Pull Request Webhook

1. Go to repository settings → Webhooks → Add webhook
2. **Payload URL:** `https://app-monitor.joshwentworth.com/api/github/webhooks/pr`
3. **Content type:** `application/json`
4. **Events:** Select "Pull requests"
5. **Active:** ✓
6. Click "Add webhook"

### Push Webhook

1. Go to repository settings → Webhooks → Add webhook
2. **Payload URL:** `https://app-monitor.joshwentworth.com/api/github/webhooks/push`
3. **Content type:** `application/json`
4. **Events:** Select "Pushes"
5. **Active:** ✓
6. Click "Add webhook"

## Architecture

```
GitHub
   ↓ (webhook)
Cloudflare Network
   ↓ (encrypted tunnel)
app-monitor.joshwentworth.com
   ↓
Cloudflare Tunnel (cloudflared)
   ↓ (http://localhost:80)
Nginx
   ↓ (proxy_pass)
Backend Service (localhost:5001)
   ↓
/api/github/webhooks/* endpoints
```

## Security Notes

1. ✅ **Encrypted:** All traffic through Cloudflare tunnel is encrypted
2. ✅ **No port forwarding:** No router port forwarding needed
3. ✅ **Cloudflare DDoS protection:** Automatic protection
4. ⚠️ **No webhook signature verification yet:** Anyone with URL can send requests
5. 🔒 **Next step:** Implement HMAC signature verification

## Troubleshooting

### Tunnel not connecting

```bash
# Check service status
sudo systemctl status cloudflared-app-monitor.service

# Check logs for errors
sudo journalctl -u cloudflared-app-monitor.service -n 50

# Restart service
sudo systemctl restart cloudflared-app-monitor.service
```

### DNS not resolving

```bash
# Check DNS record
dig app-monitor.joshwentworth.com

# Should show CNAME to tunnel
# app-monitor.joshwentworth.com. 300 IN CNAME f522d5d2-4766-4b01-b35a-5f624d443d2c.cfargotunnel.com.
```

### 404 errors

```bash
# Verify nginx is running
sudo systemctl status nginx

# Test local endpoint
curl http://localhost/api/github/webhooks/health

# Check nginx config
sudo nginx -t
```

### Backend not responding

```bash
# Check backend service
systemctl status app-monitor-backend@5001.service

# Check backend logs
journalctl -u app-monitor-backend@5001.service -n 50
```

## Monitoring Webhook Events

```bash
# Watch for incoming webhooks in backend logs
journalctl -u app-monitor-backend@5001.service -f | grep -i webhook

# Watch cloudflare tunnel logs
sudo journalctl -u cloudflared-app-monitor.service -f
```

## Updating Configuration

If you need to change the tunnel configuration:

```bash
# Edit config
nano /home/jdubz/.cloudflared/app-monitor-config.yml

# Validate config
cloudflared tunnel --config /home/jdubz/.cloudflared/app-monitor-config.yml ingress validate

# Restart service to apply changes
sudo systemctl restart cloudflared-app-monitor.service
```

## Removing Tunnel

If you need to remove the tunnel:

```bash
# Stop and disable service
sudo systemctl stop cloudflared-app-monitor.service
sudo systemctl disable cloudflared-app-monitor.service

# Remove service file
sudo rm /etc/systemd/system/cloudflared-app-monitor.service
sudo systemctl daemon-reload

# Delete DNS record
cloudflared tunnel route dns delete app-monitor app-monitor.joshwentworth.com

# Delete tunnel
cloudflared tunnel delete app-monitor

# Remove config files
rm /home/jdubz/.cloudflared/app-monitor-config.yml
rm /home/jdubz/.cloudflared/f522d5d2-4766-4b01-b35a-5f624d443d2c.json
```

## Related Documentation

- [GitHub Webhooks Setup](./GITHUB_WEBHOOKS.md)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
