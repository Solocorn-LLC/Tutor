#!/bin/bash

# =============================================================================
# Remote Deployment Script - Run this ON THE EC2 INSTANCE
# =============================================================================

set -e

PROJECT_DIR="/opt/tutorme"
DOMAIN_NAME="solocorn.co"

echo "========================================"
echo "Solocorn Application Deployment"
echo "========================================"
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root or with sudo"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
dnf update -y
dnf install -y git docker nginx

# Install Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
fi

# Start Docker
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user
usermod -aG docker ssm-user

# Install Certbot
dnf install -y python3-certbot-nginx

# Create project directory
mkdir -p $PROJECT_DIR

# Check if project exists
if [ -d "$PROJECT_DIR/.git" ]; then
    echo "Updating existing repository..."
    cd $PROJECT_DIR
    git pull origin main || true
else
    echo "Project should be copied to $PROJECT_DIR"
    echo "Waiting for files..."
    sleep 5
fi

# Change to project directory
cd $PROJECT_DIR/tutorme-app 2>/dev/null || cd $PROJECT_DIR

if [ ! -f "docker-compose.prod.yml" ]; then
    echo "Error: docker-compose.prod.yml not found!"
    echo "Please ensure project files are copied to $PROJECT_DIR"
    exit 1
fi

# Build and start containers
echo "Building and starting Docker containers..."
docker-compose -f docker-compose.prod.yml down 2>/dev/null || true
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# Wait for database
echo "Waiting for database to be ready..."
sleep 15

# Run migrations
echo "Running database migrations..."
docker-compose -f docker-compose.prod.yml exec -T app npm run db:migrate:deploy || {
    echo "Warning: Migration failed or already applied"
}

# Configure Nginx
echo "Configuring Nginx..."
cat > /etc/nginx/conf.d/solocorn.conf << 'EOF'
server {
    listen 80;
    server_name solocorn.co www.solocorn.co;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    }

    location /assets/ {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location /sw.js {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    }

    location /api/socket {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
EOF

# Test and reload Nginx
nginx -t && systemctl reload nginx

# Obtain SSL certificate
echo "Setting up SSL certificate..."
certbot --nginx -d solocorn.co -d www.solocorn.co --non-interactive --agree-tos --email admin@solocorn.co || {
    echo "Certbot failed. DNS may not have propagated yet."
    echo "Run manually later: sudo certbot --nginx -d solocorn.co -d www.solocorn.co"
}

# Setup auto-renewal for SSL
echo "Setting up SSL auto-renewal..."
(cat crontab -l 2>/dev/null; echo "0 3 * * * /usr/bin/certbot renew --quiet --nginx") | crontab -

echo ""
echo "========================================"
echo "Deployment Complete!"
echo "========================================"
echo ""
echo "App URL: https://${DOMAIN_NAME}"
echo ""
echo "Useful commands:"
echo "  View logs: docker-compose -f docker-compose.prod.yml logs -f app"
echo "  Restart:   docker-compose -f docker-compose.prod.yml restart"
echo "  Update:    cd ${PROJECT_DIR} && git pull && docker-compose -f docker-compose.prod.yml up -d --build"
echo ""
echo "Health check:"
curl -s http://localhost:3003/api/health && echo " ✓ App is running" || echo " ✗ App not responding"
