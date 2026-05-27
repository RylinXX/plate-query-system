@echo off
chcp 65001 >nul
title 智能车牌查询准入系统 - 启动终端

echo ===================================================
echo    PLATE SHIELD - 智能车牌查询准入系统 一键启动器
echo ===================================================
echo.

cd /d "%~dp0"

:: 1. 检测 Python 环境
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未在系统环境变量中检测到 Python！
    echo 请先安装 Python (推荐 3.10 及以上版本) 并勾选 "Add Python to PATH"。
    pause
    exit /b
)

:: 2. 检测并初始化虚拟环境
if not exist "backend\venv" (
    echo [配置] 正在首次初始化 Python 虚拟环境 (venv)，请稍候...
    python -m venv backend\venv
    if %errorlevel% neq 0 (
        echo [错误] 虚拟环境创建失败！
        pause
        exit /b
    )
    echo [配置] 虚拟环境初始化成功。
)

:: 3. 激活虚拟环境并安装依赖
echo [配置] 正在检查并自动部署依赖组件 (FastAPI, Uvicorn, HTTPX)...
call backend\venv\Scripts\activate.bat
python -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple >nul 2>&1
pip install -r backend\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
if %errorlevel% neq 0 (
    echo [警告] 国内镜像源连接超时，正在尝试备用官方源...
    pip install -r backend\requirements.txt
)

:: 4. 后台拉起 FastAPI 全栈 Web 服务
echo [启动] 正在以最小化形式后台拉起本地 Uvicorn 全栈服务 (端口 8001)...
start "Plate Shield Fullstack Web" /min cmd /c "cd backend && venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001"

:: 5. 自动访问全栈 Web 界面
echo [启动] 正在调用默认浏览器加载车牌校验 Web 终端...
start "" "http://127.0.0.1:8001/"

echo.
echo ===================================================
echo    🎉 系统已圆满拉起！
echo.
echo    1. 浏览器已自动加载车牌校验仪表盘终端。
echo    2. 请点击右上角“接口配置”抽屉，贴入最新的 authtoken 即可查询。
echo    3. 代理服务已最小化静默运行在后台。
echo    4. 若需停止服务，请关闭此 CMD 窗口并直接关闭浏览器页即可。
echo ===================================================
echo.
pause
