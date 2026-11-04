#!/usr/bin/env bash
# Prepare a fresh Hetzner Cloud VPS (Ubuntu 24.04) for the Nuvadesk control plane.
# Run ONCE as root, on the server:
#
#   curl -fsSL https://raw.githubusercontent.com/vinuki-thiranya/AI-Automation-Service-for-Overseas-SMBs-Full-System-/main/scripts/hetzner-setup.sh -o hetzner-setup.sh
#   less hetzner-setup.sh            # read it before running it
#   sudo bash hetzner-setup.sh
#
# What it does: system updates, unattended security upgrades, a non-root deploy user with your
# SSH key, SSH hardening (keys only, no root login), ufw (22/80/443), fail2ban, 2 GB swap,
# Docker Engine + compose plugin, a deploy key for GitHub, and a clone of the repo in /opt/nuvadesk.
set -euo pipefail

DEPLOY_USER=${DEPLOY_USER:-nuvadesk}
REPO_SSH=${REPO_SSH:-git@github.com:vinuki-thiranya/AI-Automation-Service-for-Overseas-SMBs-Full-System-.git}
APP_DIR=${APP_DIR:-/opt/nuvadesk}

[[ $EUID -eq 0 ]] || { echo "run as root (sudo bash $0)" >&2; exit 1; }
grep -q 'VERSION_ID="24.04"' /etc/os-release || echo "warning: tested on Ubuntu 24.04 only" >&2
[[ -s /root/.ssh/authorized_keys ]] || { echo "no /root/.ssh/authorized_keys — create the server with your SSH key first" >&2; exit 1; }

echo "==> packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg git make jq ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Docker Engine (official repository)"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

echo "==> deploy user '$DEPLOY_USER'"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker,sudo "$DEPLOY_USER"
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"

echo "==> SSH hardening"
cat > /etc/ssh/sshd_config.d/90-nuvadesk.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
X11Forwarding no
MaxAuthTries 3
EOF
sshd -t
systemctl reload ssh

echo "==> firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
# Note: Docker publishes ports by editing iptables directly and bypasses ufw. The stack
# publishes only 80/443 (Caddy), so this is consistent — never publish other ports.

echo "==> fail2ban (sshd)"
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "==> swap (2 GB)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-swappiness.conf
fi

echo "==> GitHub deploy key"
KEY="/home/$DEPLOY_USER/.ssh/nuvadesk_deploy"
if [[ ! -s "$KEY" ]]; then
  sudo -u "$DEPLOY_USER" ssh-keygen -q -t ed25519 -N '' -C "nuvadesk-deploy@$(hostname)" -f "$KEY"
fi
cat > "/home/$DEPLOY_USER/.ssh/config" <<EOF
Host github.com
  IdentityFile $KEY
  IdentitiesOnly yes
EOF
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/config"
chmod 600 "/home/$DEPLOY_USER/.ssh/config"
sudo -u "$DEPLOY_USER" sh -c "ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null"

echo
echo "Add this public key to GitHub → repo → Settings → Deploy keys → 'Allow write access':"
echo
cat "$KEY.pub"
echo
read -r -p "Press Enter once the deploy key is added..." _

echo "==> clone repo to $APP_DIR"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
  sudo -u "$DEPLOY_USER" git clone "$REPO_SSH" "$APP_DIR"
fi

cat <<EOF

Server ready. Log out and back in as $DEPLOY_USER (root login is now disabled):
  ssh $DEPLOY_USER@<server-ip>
  cd $APP_DIR
  cp infra/.env.example infra/.env && nano infra/.env
  make first-boot
EOF
