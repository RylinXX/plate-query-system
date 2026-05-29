# PLATE SHIELD - 智能车牌查询准入系统

PLATE SHIELD 是一款轻量、智能且现代化的车牌查询与准入校验控制系统。它提供了直观的前端可视化交互仪表盘，并通过基于 FastAPI 的高效后端提供数据接口。

## 🌟 系统核心特性

* **一键傻瓜式部署**：专为 Windows 用户设计了 `start.bat` 一键部署脚本，自动完成 Python 虚拟环境配置、依赖部署、后台服务拉起和浏览器打开。
* **现代化前端仪表盘**：采用流畅的 UI 交互，支持车牌快速输入、校验和结果展示。
* **强大的接口配置**：支持前端“接口配置”抽屉，允许用户灵活配置和更新最新的 `authtoken` 凭证进行安全查询。
* **低耦合架构**：前端与后端采用服务隔离，开发维护方便。

---

## 🛠 目录结构说明

```text
plate-query-system/
├── backend/               # 后端 FastAPI 项目
│   ├── app/               # 接口业务逻辑目录
│   │   └── main.py        # 接口入口文件
│   ├── tests/             # 单元测试与校验测试
│   └── requirements.txt   # 后端 Python 依赖列表
├── frontend/              # 前端网页项目
│   ├── index.html         # 车牌查询可视化主页
│   ├── app-runtime.js     # 前端运行时交互逻辑
│   ├── app.js             # 历史前端控制脚本
│   └── style.css          # 政务监管风格样式表
├── .gitignore             # 忽略本地 Python 虚拟环境及临时缓存
├── start.bat              # Windows 一键智能启动脚本
└── README.md              # 本项目说明文档
```

---

## 🚀 快速启动指南 (Windows)

只需简单一步，即可完整运行全套系统：

1. 双击运行根目录下的 **`start.bat`** 启动脚本。
2. 脚本将自动为您：
   * 检测系统 Python 环境（推荐 3.10+）。
   * 自动在 `backend\venv` 下创建和部署隔离的虚拟环境。
   * 使用国内高速镜像源（清华源）极速安装所需依赖。
   * 以最小化窗口在后台静默运行 Uvicorn 服务（运行在端口 `8001`）。
   * 自动调用系统默认浏览器打开可视化仪表盘 `http://127.0.0.1:8001/`。

---

## ⚙ 配置与使用说明

1. 服务启动后，浏览器会自动打开仪表盘终端。
2. 点击页面右上角的 **“接口配置”** 抽屉，贴入最新的 `authtoken`。
3. 输入需要校验的车牌，即可立即进行准入校验与接口查询。
4. **如何停止服务**：直接关闭启动时的 CMD 窗口，并关闭浏览器标签页即可。

---

## 🐧 Linux 服务器部署流程

以下流程以 Ubuntu / Debian 系服务器为例，推荐将服务部署在 `/opt/plate-query-system`，由 `systemd` 托管后端服务，并使用 Nginx 反向代理对外提供访问。

### 1. 安装基础环境

```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip nginx
```

请确认 Python 版本不低于 3.10：

```bash
python3 --version
```

### 2. 拉取项目源码

```bash
cd /opt
sudo git clone https://github.com/RylinXX/plate-query-system.git
sudo chown -R $USER:$USER /opt/plate-query-system
cd /opt/plate-query-system
```

如果服务器已经存在项目目录，则不要重复 clone，直接进入项目目录即可。

### 3. 创建虚拟环境并安装依赖

```bash
cd /opt/plate-query-system/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. 本地验证启动

```bash
cd /opt/plate-query-system/backend
source venv/bin/activate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

新开一个终端验证健康检查：

```bash
curl http://127.0.0.1:8001/api/health
```

返回类似以下内容即表示后端运行正常：

```json
{"status":"healthy","service":"plate-query-proxy"}
```

验证完成后，在运行 Uvicorn 的终端按 `Ctrl+C` 停止临时服务。

### 5. 配置 systemd 服务

创建服务文件：

```bash
sudo nano /etc/systemd/system/plate-query.service
```

写入以下内容：

```ini
[Unit]
Description=Plate Shield FastAPI Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/plate-query-system/backend
ExecStart=/opt/plate-query-system/backend/venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=5
User=www-data
Group=www-data
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

授权并启动：

```bash
sudo chown -R www-data:www-data /opt/plate-query-system
sudo systemctl daemon-reload
sudo systemctl enable plate-query
sudo systemctl start plate-query
sudo systemctl status plate-query
```

查看运行日志：

```bash
sudo journalctl -u plate-query -f
```

### 6. 配置 Nginx 反向代理

创建 Nginx 配置：

```bash
sudo nano /etc/nginx/sites-available/plate-query
```

写入以下内容，将 `your-domain.com` 替换为服务器域名或公网 IP：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用站点并重载 Nginx：

```bash
sudo ln -s /etc/nginx/sites-available/plate-query /etc/nginx/sites-enabled/plate-query
sudo nginx -t
sudo systemctl reload nginx
```

如果服务器开启了防火墙，请放行 HTTP / HTTPS：

```bash
sudo ufw allow 'Nginx Full'
```

部署完成后访问：

```text
http://your-domain.com/
```

### 7. HTTPS 配置（可选但推荐）

如果已经绑定域名，推荐使用 Certbot 配置 HTTPS：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 🔄 线上版本更新流程

线上更新建议遵循“先备份、再拉取、后重启、最后验证”的顺序，避免覆盖本地持久化数据。

### 1. 进入项目目录

```bash
cd /opt/plate-query-system
```

### 2. 检查本地改动

```bash
git status
```

如果存在本地源码改动，请先确认是否需要保留。线上运行产生的 `backend/data.json` 是本地同步数据文件，默认不纳入 Git，不应随版本更新删除。

### 3. 备份本地数据

```bash
mkdir -p /opt/plate-query-backups
cp backend/data.json /opt/plate-query-backups/data-$(date +%Y%m%d-%H%M%S).json 2>/dev/null || true
```

### 4. 拉取最新源码

```bash
git fetch origin
git pull --ff-only origin main
```

如果提示无法 fast-forward，说明服务器上存在本地提交或分支偏移，需要先人工确认差异后再更新。

### 5. 更新 Python 依赖

```bash
cd /opt/plate-query-system/backend
source venv/bin/activate
pip install -r requirements.txt
```

### 6. 运行测试（推荐）

```bash
cd /opt/plate-query-system/backend
source venv/bin/activate
python -m pytest
```

### 7. 重启服务

```bash
sudo systemctl restart plate-query
sudo systemctl status plate-query
```

### 8. 验证服务

```bash
curl http://127.0.0.1:8001/api/health
```

如果使用 Nginx 对外访问，也可以验证公网入口：

```bash
curl http://your-domain.com/api/health
```

返回 `healthy` 后，刷新浏览器页面即可使用新版本。

### 9. 回滚版本（应急）

查看最近提交：

```bash
cd /opt/plate-query-system
git log --oneline -5
```

回滚到指定提交：

```bash
git reset --hard <commit_id>
cd backend
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart plate-query
```

回滚后再次执行健康检查，确认服务恢复正常。
