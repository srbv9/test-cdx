# Secure Terminal

Secure Terminal is a privacy-first 1:1 chat MVP combining a TypeScript Fastify backend, a Vue 3 renderer, and an Electron desktop shell. Conversations are initiated only when a user shares their secret profile ID offline. Messages are encrypted on the client so the server only stores ciphertext.

## Repository layout
- `backend`: Fastify + Prisma API with WebSocket messaging.
- `frontend`: Vue 3 + Vite renderer packaged into the Electron app.
- `desktop`: Electron wrapper and packaging configuration.
- `docker-compose.yml`: Local stack with API and proxy scaffolding.

## Security model overview
- **Authentication**: Username + strong password (min 12 chars with complexity). Passwords hashed with Argon2. JWT access tokens plus long-lived refresh tokens.
- **Secret profile IDs**: Generated per account, only shown to the owner via `/api/users/me` and the Profile screen. Conversations start by submitting another user’s profile ID; the backend never exposes profile IDs in responses.
- **End-to-end encryption**: Clients generate asymmetric key pairs and keep private keys locally. The backend stores public keys and only ever sees ciphertext for messages.
- **Transport**: HTTPS/TLS enforced behind the reverse proxy. WebSocket upgrades flow through the same proxy. Logging excludes sensitive content.

## Local development
1. Install Node.js 20+.
2. Backend
   - `cd backend`
   - `npm install`
   - Set `DATABASE_URL=file:./dev.db` or a custom path.
   - `npm run dev` (uses ts-node-dev).
3. Frontend
   - `cd frontend`
   - `npm install`
   - `npm run dev` (served on `http://localhost:5173`).
4. Electron shell
   - `cd desktop`
   - `npm install`
   - `npm run dev` (loads `http://localhost:5173`).
5. API base URLs
   - Configure `VITE_API_BASE` and `VITE_WS_BASE` env vars for the renderer as needed. Defaults point to `https://api.vendadummydomain.com`.

## Database schema
Prisma schema (`backend/prisma/schema.prisma`) models users, refresh tokens, conversations, and messages. Use `npm run prisma:generate` to create the client and `DATABASE_URL` to point at your SQLite file.

## Docker and reverse proxy
- `docker-compose up --build` starts the API on port 3001 and an nginx proxy on ports 80/443.
- `nginx.conf` forwards `/api` and `/ws` to the API and exposes `/health` for monitoring.
- Supply TLS certificates in production (e.g., via certbot) and mount them into nginx.

## AWS EC2 deployment (CLI, fresh account, single apex domain)
The following steps assume a fresh AWS account, no AWS CLI profile yet, and a Route53 hosted zone for `vendadummydomain.com` (no `api.` subdomain). The API will live at `https://vendadummydomain.com/api` and WebSocket at `wss://vendadummydomain.com/ws`.

### 1) Install and configure AWS CLI locally
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Create an admin IAM user in the console (recommended) and generate an access key.
# Then configure your first profile:
aws configure --profile secure-terminal
# Supply AWS Access Key ID, Secret Access Key, default region (e.g., us-east-1), and default output (json).
```

### 2) Create SSH key pair and security group
```bash
export AWS_PROFILE=secure-terminal

# Create key pair (stored locally as PEM for SSH)
aws ec2 create-key-pair   --key-name secure-terminal-key   --query 'KeyMaterial' --output text > secure-terminal-key.pem
chmod 600 secure-terminal-key.pem

# Create security group in default VPC
VPC_ID=$(aws ec2 describe-vpcs --query 'Vpcs[0].VpcId' --output text)
SG_ID=$(aws ec2 create-security-group   --group-name secure-terminal-sg   --description "Secure Terminal access"   --vpc-id "$VPC_ID"   --query 'GroupId' --output text)

# Allow SSH (22), HTTP (80), HTTPS (443)
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 22 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 443 --cidr 0.0.0.0/0
```

### 3) Launch EC2 instance and attach Elastic IP
```bash
# Get latest Amazon Linux 2023 AMI
AMI_ID=$(aws ec2 describe-images   --owners amazon   --filters 'Name=name,Values=al2023-ami-*-x86_64' 'Name=state,Values=available'   --query 'reverse(sort_by(Images,&CreationDate))[:1].ImageId' --output text)

# Launch t3.small (adjust as needed)
INSTANCE_ID=$(aws ec2 run-instances   --image-id "$AMI_ID"   --instance-type t3.small   --key-name secure-terminal-key   --security-group-ids "$SG_ID"   --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=secure-terminal}]'   --query 'Instances[0].InstanceId' --output text)

# Allocate and associate Elastic IP
ALLOCATION_ID=$(aws ec2 allocate-address --domain vpc --query 'AllocationId' --output text)
aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOCATION_ID"

# Capture the public IP
PUBLIC_IP=$(aws ec2 describe-addresses --allocation-ids "$ALLOCATION_ID" --query 'Addresses[0].PublicIp' --output text)
echo "Public IP: $PUBLIC_IP"
```

### 4) Point DNS at the instance (apex only)
```bash
HOSTED_ZONE_ID=$(aws route53 list-hosted-zones-by-name --dns-name vendadummydomain.com --query 'HostedZones[0].Id' --output text)

cat > /tmp/secure-terminal-dns.json <<'EOF'
{
  "Comment": "Point apex to Secure Terminal EC2",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "vendadummydomain.com.",
        "Type": "A",
        "TTL": 60,
        "ResourceRecords": [{"Value": "PUBLIC_IP_PLACEHOLDER"}]
      }
    }
  ]
}
EOF

sed -i "s/PUBLIC_IP_PLACEHOLDER/$PUBLIC_IP/" /tmp/secure-terminal-dns.json
aws route53 change-resource-record-sets   --hosted-zone-id "$HOSTED_ZONE_ID"   --change-batch file:///tmp/secure-terminal-dns.json
```

Wait a few minutes for DNS to propagate. The API will be served at `https://vendadummydomain.com/api`.

### 5) SSH into the instance
```bash
ssh -i secure-terminal-key.pem ec2-user@${PUBLIC_IP}
```

### 6) Install Docker, docker-compose plugin, and git on the instance
```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo service docker start
sudo usermod -a -G docker ec2-user
newgrp docker

# Install compose plugin
mkdir -p ~/.docker/cli-plugins
curl -SL https://github.com/docker/compose/releases/download/v2.24.6/docker-compose-linux-x86_64 -o ~/.docker/cli-plugins/docker-compose
chmod +x ~/.docker/cli-plugins/docker-compose
docker compose version
```

### 7) Pull code and prepare environment
```bash
git clone https://github.com/your-org/secure-terminal.git
cd secure-terminal

# Create environment file for docker-compose
cat > .env <<'EOF'
JWT_SECRET=$(openssl rand -hex 32)
DATABASE_URL=file:/app/data/prod.db
ALLOWED_ORIGIN=https://vendadummydomain.com
EOF

# Create data directory for SQLite
mkdir -p backend/data
```

### 8) Obtain TLS certificate for apex domain
Use certbot in standalone mode (temporarily stops nginx container if running).
```bash
sudo dnf install -y certbot
sudo systemctl stop nginx || true
sudo certbot certonly --standalone -d vendadummydomain.com --non-interactive --agree-tos -m admin@vendadummydomain.com

# Certificates live under /etc/letsencrypt/live/vendadummydomain.com/
```

### 9) Update nginx config for TLS (apex only)
Edit `nginx.conf` to add a TLS server block for `vendadummydomain.com` that serves `/api` and `/ws`, referencing the cert paths. Example snippet:
```
  server {
    listen 443 ssl;
    server_name vendadummydomain.com;
    ssl_certificate /etc/letsencrypt/live/vendadummydomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vendadummydomain.com/privkey.pem;
    location /health { proxy_pass http://api:3001/health; }
    location /api/ { proxy_pass http://api:3001/api/; proxy_http_version 1.1; proxy_set_header Host $host; }
    location /ws { proxy_pass http://api:3001/ws; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; proxy_set_header Host $host; }
  }
```
Keep the existing port 80 server to redirect or serve ACME challenges.

### 10) Run the stack
```bash
docker compose up --build -d
```

### 11) Verify deployment
```bash
curl -k https://vendadummydomain.com/health
curl -k https://vendadummydomain.com/api/health
```

Set the Electron/Vite renderer to use `https://vendadummydomain.com/api` and `wss://vendadummydomain.com/ws`.

## Electron packaging
- The Electron app loads the built renderer from `frontend/dist` (copy to `desktop/renderer` before `npm run build`).
- `desktop/electron-builder.yml` targets macOS `.dmg`; Windows/Linux targets can be added later.
- Place branding assets in `desktop/icons` (provided `logo.svg`).

## Key generation (client outline)
The renderer should generate a long-term asymmetric key pair on first login/registration, store the private key locally (e.g., in the Electron secure store), and upload the public key through `POST /api/users/public-key`. Message bodies must be encrypted with the peer’s public key before sending through the WebSocket or REST APIs.
