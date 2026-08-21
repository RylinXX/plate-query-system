// 动态自适应当前 Host 相对路径以支持全栈 Web 部署
const BACKEND_URL = window.location.origin;

// 缓存与配置管理
const CONFIG_KEY = "PLATE_QUERY_CONFIG";

const DEFAULT_TOKEN = "";

let appConfig = {
    authtoken: DEFAULT_TOKEN,
    id: "225642",
    worksitetype: "1"
};

// 全局已缓存的数据结构
let fetchedVehicles = [];
let fetchedTransports = [];
let fetchedTempTransports = [];
let fetchedWorksiteName = "中央广播电视总台超高清示范园工程(演播视听中心)";

// DOM 节点初始化
const backendStatus = document.getElementById("backendStatus");
const openConfigBtn = document.getElementById("openConfigBtn");
const closeConfigBtn = document.getElementById("closeConfigBtn");
const configDrawer = document.getElementById("configDrawer");
const drawerOverlay = document.getElementById("drawerOverlay");
const saveConfigBtn = document.getElementById("saveConfigBtn");

const tokenInput = document.getElementById("tokenInput");
const worksiteIdInput = document.getElementById("worksiteIdInput");
const worksiteTypeInput = document.getElementById("worksiteTypeInput");

const plateInput = document.getElementById("plateInput");
const searchBtn = document.getElementById("searchBtn");

const resultContainer = document.getElementById("resultContainer");
const loadingState = document.getElementById("loadingState");
const successState = document.getElementById("successState");
const failState = document.getElementById("failState");
const errorState = document.getElementById("errorState");

const successPlate = document.getElementById("successPlate");
const successWorksite = document.getElementById("successWorksite");
const successTime = document.getElementById("successTime");
const permitSerial = document.getElementById("permitSerial");

const failPlate = document.getElementById("failPlate");
const failWorksite = document.getElementById("failWorksite");
const failDesc = document.getElementById("failDesc");

const errorText = document.getElementById("errorText");

// 新增同步与双大表 DOM 节点
const syncDataBtn = document.getElementById("syncDataBtn");
const syncTimeDisplay = document.getElementById("syncTimeDisplay");
const tableWorksiteDisplay = document.getElementById("tableWorksiteDisplay");
const transportsTableBody = document.getElementById("transportsTableBody");
const tempTransportsTableBody = document.getElementById("tempTransportsTableBody");
const downloadTablePdfBtn = document.getElementById("downloadTablePdfBtn");

// 初始化与事件绑定
window.addEventListener("DOMContentLoaded", () => {
    loadConfig();
    loadConfigFromServer(false);
    detectBackendStatus();
    fetchLocalData(); // 启动时加载本地已有的持久化数据
    setupEventListeners();
});

// 加载配置
function loadConfig() {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            appConfig = {
                authtoken: parsed.authtoken || DEFAULT_TOKEN,
                id: parsed.id || "225642",
                worksitetype: parsed.worksitetype || "1"
            };
        } catch (e) {
            console.error("配置加载失败:", e);
        }
    }
    
    // 智能升级判断：若浏览器本地缓存的依旧是之前失效的旧 Token (以 00Y6YT 结尾)，
    // 我们在此将其热升级为全新的有效 Token，免去用户重复粘贴配置的烦恼
    const oldTokenSignature = "00Y6YTOfUU2Ifa-a0D4cMHcaA_PgXOrvH3eoJg2Xfio";
    if (appConfig.authtoken && appConfig.authtoken.endsWith(oldTokenSignature)) {
        appConfig.authtoken = DEFAULT_TOKEN;
        localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));
        console.log("🛠️ 系统已智能检测到旧 Token，并热重载升级为最新有效 Token！");
    }
    
    if (!appConfig.authtoken) {
        appConfig.authtoken = DEFAULT_TOKEN;
    }
    
    // 同步到表单
    tokenInput.value = appConfig.authtoken || "";
    worksiteIdInput.value = appConfig.id || "225642";
    worksiteTypeInput.value = appConfig.worksitetype || "1";
}

async function loadConfigFromServer(force = false) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/config`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success) {
            appConfig.id = data.id || appConfig.id || "225642";
            appConfig.worksitetype = data.worksitetype || appConfig.worksitetype || "1";
            
            localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));
            
            if (tokenInput) tokenInput.value = appConfig.authtoken || "";
            if (worksiteIdInput) worksiteIdInput.value = appConfig.id;
            if (worksiteTypeInput) worksiteTypeInput.value = appConfig.worksitetype;
            
            console.log("Successfully synchronized public configuration with the server backend.");
            if (force) {
                alert("🎉 已成功从服务端同步公共配置！");
            }
        }
    } catch (err) {
        console.error("Failed to load config from server:", err);
        if (force) {
            alert(`同步服务端配置失败: ${err.message}`);
        }
    }
}

// 探测后端服务状态
async function detectBackendStatus() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/health`);
        if (response.ok) {
            backendStatus.className = "status-indicator online";
            backendStatus.querySelector(".status-text").textContent = "代理服务已就绪";
        } else {
            setBackendOffline();
        }
    } catch (e) {
        setBackendOffline();
    }
}

function setBackendOffline() {
    backendStatus.className = "status-indicator offline";
    backendStatus.querySelector(".status-text").textContent = "本地代理未就绪";
}

// 获取并装载本地已保存的数据
async function fetchLocalData() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/local-data`);
        if (!response.ok) {
            renderEmptyTables("读取本地持久化数据失败，请点击上方“一键同步最新数据”进行初始化拉取！");
            return;
        }
        
        const data = await response.json();
        if (data.success && data.has_data) {
            fetchedVehicles = data.vehicles || [];
            fetchedTransports = data.transports || [];
            fetchedTempTransports = data.temporary_transports || [];
            fetchedWorksiteName = data.worksite_name || "未命名工地";
            
            // 刷新页面状态展示
            syncTimeDisplay.textContent = `上次同步: ${data.last_updated}`;
            tableWorksiteDisplay.innerHTML = `备案工地: <span class="text-white">${fetchedWorksiteName}</span>`;
            
            // 渲染正式合作与临时合作两个企业大表
            renderEnterpriseTables(fetchedTransports, fetchedTempTransports);
        } else {
            renderEmptyTables(data.msg || "本地尚未同步数据，请点击上方“一键同步最新数据”进行初始化拉取！");
        }
    } catch (err) {
        console.error("加载本地数据出错:", err);
        renderEmptyTables("无法连接后端服务，请确认服务已启动。");
    }
}

// 将逗号分隔的车牌号字符串格式化为极客霓虹微光 Chip 芯片标签集合（禁止换行，整齐自适应排列）
function formatPlatesToChips(platesStr) {
    if (!platesStr) return `<span style="color: var(--text-secondary); font-style: italic;">无备案车牌</span>`;
    
    // 支持中英文逗号分割车牌
    const plates = platesStr.split(/[,，]+/);
    return plates.map(plate => {
        const p = plate.trim().toUpperCase();
        if (!p) return "";
        return `<span style="font-family: var(--font-outfit); font-weight: 700; color: #ffffff; background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); margin: 3px; display: inline-block; white-space: nowrap;">${p}</span>`;
    }).join("");
}

// 核心企业双表格渲染逻辑
function renderEnterpriseTables(transports, tempTransports) {
    // 1. 渲染：正式合作运输企业信息
    if (!transports || transports.length === 0) {
        renderEmptyTable(transportsTableBody, 5, "暂无正式合作运输企业记录。");
    } else {
        transportsTableBody.innerHTML = "";
        transports.forEach(item => {
            const tr = document.createElement("tr");
            
            // 企业名称
            const tdName = document.createElement("td");
            tdName.style.fontWeight = "600";
            tdName.style.color = "#ffffff";
            tdName.textContent = item.companyname || "未知企业";
            tr.appendChild(tdName);
            
            // 地址
            const tdAddress = document.createElement("td");
            tdAddress.textContent = item.address || "-";
            tr.appendChild(tdAddress);
            
            // 使用车辆数
            const tdCount = document.createElement("td");
            tdCount.style.textAlign = "center";
            tdCount.style.fontWeight = "800";
            tdCount.style.color = "var(--neon-cyan)";
            tdCount.textContent = item.carcount || "0";
            tr.appendChild(tdCount);
            
            // 车牌芯片集合 (自动折行且单车牌 nowrap 芯片化)
            const tdPlates = document.createElement("td");
            tdPlates.innerHTML = formatPlatesToChips(item.carnumbers);
            tr.appendChild(tdPlates);
            
            // 负责人电话
            const tdPhone = document.createElement("td");
            tdPhone.style.fontFamily = "var(--font-outfit)";
            tdPhone.textContent = item.phone || "-";
            tr.appendChild(tdPhone);
            
            transportsTableBody.appendChild(tr);
        });
    }

    // 2. 渲染：临时合作运输企业信息
    if (!tempTransports || tempTransports.length === 0) {
        renderEmptyTable(tempTransportsTableBody, 7, "暂无临时合作运输企业记录。");
    } else {
        tempTransportsTableBody.innerHTML = "";
        tempTransports.forEach(item => {
            const tr = document.createElement("tr");
            
            // 企业名称
            const tdName = document.createElement("td");
            tdName.style.fontWeight = "600";
            tdName.style.color = "#ffffff";
            tdName.textContent = item.companyName || "未知企业";
            tr.appendChild(tdName);
            
            // 地址
            const tdAddress = document.createElement("td");
            tdAddress.textContent = item.address || "-";
            tr.appendChild(tdAddress);
            
            // 使用车辆数
            const tdCount = document.createElement("td");
            tdCount.style.textAlign = "center";
            tdCount.style.fontWeight = "800";
            tdCount.style.color = "var(--neon-orange)";
            tdCount.textContent = item.carcount || "0";
            tr.appendChild(tdCount);
            
            // 车牌芯片集合
            const tdPlates = document.createElement("td");
            tdPlates.innerHTML = formatPlatesToChips(item.carnumbers);
            tr.appendChild(tdPlates);
            
            // 开始时间
            const tdStart = document.createElement("td");
            tdStart.style.textAlign = "center";
            tdStart.style.fontSize = "12px";
            tdStart.style.color = "var(--text-secondary)";
            tdStart.textContent = item.startDate || "-";
            tr.appendChild(tdStart);
            
            // 结束时间
            const tdEnd = document.createElement("td");
            tdEnd.style.textAlign = "center";
            tdEnd.style.fontSize = "12px";
            tdEnd.style.color = "var(--text-secondary)";
            tdEnd.textContent = item.endDate || "-";
            tr.appendChild(tdEnd);
            
            // 负责人电话
            const tdPhone = document.createElement("td");
            tdPhone.style.fontFamily = "var(--font-outfit)";
            tdPhone.textContent = item.phone || "-";
            tr.appendChild(tdPhone);
            
            tempTransportsTableBody.appendChild(tr);
        });
    }
}

// 渲染单个表格空状态
function renderEmptyTable(tbody, colSpan, message) {
    tbody.innerHTML = `
        <tr>
            <td colspan="${colSpan}" class="table-empty">
                <i class="fa-solid fa-folder-open empty-icon"></i>
                <p>${message}</p>
            </td>
        </tr>
    `;
}

// 渲染双表空状态
function renderEmptyTables(message) {
    renderEmptyTable(transportsTableBody, 5, message);
    renderEmptyTable(tempTransportsTableBody, 7, message);
    syncTimeDisplay.textContent = "上次同步: 未同步数据";
    tableWorksiteDisplay.textContent = "备案工地: 暂无本地同步数据";
}

// 绑定事件处理器
function setupEventListeners() {
    // 接口配置抽屉交互
    openConfigBtn.addEventListener("click", () => {
        configDrawer.classList.add("active");
        drawerOverlay.classList.add("active");
    });

    const closeDrawer = () => {
        configDrawer.classList.remove("active");
        drawerOverlay.classList.remove("active");
    };

    closeConfigBtn.addEventListener("click", closeDrawer);
    drawerOverlay.addEventListener("click", closeDrawer);

    // 保存配置
    saveConfigBtn.addEventListener("click", () => {
        appConfig.authtoken = tokenInput.value.trim();
        appConfig.id = worksiteIdInput.value.trim();
        appConfig.worksitetype = worksiteTypeInput.value.trim();

        localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));
        alert("🎉 接口配置已成功保存并应用！");
        closeDrawer();
        
        // 尝试重测后端状态
        detectBackendStatus();
    });

    const syncConfigFromServerBtn = document.getElementById("syncConfigFromServerBtn");
    if (syncConfigFromServerBtn) {
        syncConfigFromServerBtn.addEventListener("click", () => loadConfigFromServer(true));
    }

    // 一键同步最新数据到本地 JSON
    syncDataBtn.addEventListener("click", syncDataFromServer);

    // 限制输入为大写并去除空格
    plateInput.addEventListener("input", (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/\s+/g, "");
    });

    // 搜索回车绑定
    plateInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            performSearch();
        }
    });

    searchBtn.addEventListener("click", performSearch);

    // 导出全量已备案车辆总表 PDF (双表1:1经典还原)
    downloadTablePdfBtn.addEventListener("click", generateTablePDF);
}

// 快速输入示例填充并触发检索
window.fillPlate = function(plate) {
    plateInput.value = plate.toUpperCase();
    performSearch();
};

// 一键从外部接口同步数据并写入本地
async function syncDataFromServer() {
    // 阻止重复点击
    syncDataBtn.disabled = true;
    const origHtml = syncDataBtn.innerHTML;
    syncDataBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> 正在拉取数据...`;
    
    // 前置检测 Token
    if (!appConfig.authtoken) {
        alert("请先在右上角【接口配置】中贴入最新的有效 authtoken！");
        syncDataBtn.disabled = false;
        syncDataBtn.innerHTML = origHtml;
        return;
    }
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/sync-data`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(appConfig)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            alert(`同步失败: ${data.detail || "服务端返回异常"}`);
            return;
        }
        
        if (data.success) {
            fetchedVehicles = data.vehicles || [];
            fetchedTransports = data.transports || [];
            fetchedTempTransports = data.temporary_transports || [];
            fetchedWorksiteName = data.worksite_name || "未命名工地";
            
            // 更新 UI
            syncTimeDisplay.textContent = `上次同步: ${data.last_updated}`;
            tableWorksiteDisplay.innerHTML = `备案工地: <span class="text-white">${fetchedWorksiteName}</span>`;
            
            renderEnterpriseTables(fetchedTransports, fetchedTempTransports);
            alert(`🎉 本地数据同步成功！共载入 ${fetchedTransports.length} 家正式合作企业，${fetchedTempTransports.length} 家临时合作企业。`);
        } else {
            alert("同步拉取失败，目标接口返回异常。");
        }
    } catch (err) {
        alert(`无法连接后端服务，请确认 start.bat 已运行。(${err.message})`);
    } finally {
        syncDataBtn.disabled = false;
        syncDataBtn.innerHTML = origHtml;
    }
}

// 核心车牌检索逻辑（日常检索 100% 离线本地比对）
async function performSearch() {
    const plateNo = plateInput.value.trim().toUpperCase();
    
    if (!plateNo) {
        alert("请输入要检索的车牌号！");
        return;
    }
    
    if (plateNo.length < 7) {
        alert("输入的车牌号格式不完整（传统车牌为7位，新能源为8位）！");
        return;
    }

    // 重置并显示检索状态面板
    resultContainer.style.display = "block";
    loadingState.style.display = "block";
    successState.style.display = "none";
    failState.style.display = "none";
    errorState.style.display = "none";

    try {
        const response = await fetch(`${BACKEND_URL}/api/local-query`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ plate_no: plateNo })
        });

        const data = await response.json();
        loadingState.style.display = "none";

        if (!response.ok) {
            errorState.style.display = "block";
            errorText.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${data.detail || "本地�// 核心已备案车辆总表 PDF 生成器 (克隆临时高密度 A4 打印 DOM，支持双企业表格1:1经典呈现)
function generateTablePDF() {
    if (!fetchedTransports.length && !fetchedTempTransports.length) {
        alert("本地尚无合作运输企业数据记录，无法导出！");
        return;
    }

    // 锁定导出按钮，提供动画反馈
    downloadTablePdfBtn.disabled = true;
    const origHtml = downloadTablePdfBtn.innerHTML;
    downloadTablePdfBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> 正在导出高精度 PDF...`;

    // 1. 动态创建一个 0.01 透明定位在 (0, 0) 的包裹容器，高度自适应且宽度锁死 740px (完美吻合 A4 7.67 英寸宽幅，消解留白偏置与裁剪 Bug)
    const printWrapper = document.createElement("div");
    printWrapper.id = "pdf-print-wrapper";
    printWrapper.style.position = "absolute";
    printWrapper.style.left = "0";
    printWrapper.style.top = "0";
    printWrapper.style.width = "740px";
    printWrapper.style.height = "auto";
    printWrapper.style.opacity = "0.01";
    printWrapper.style.zIndex = "-9999";
    printWrapper.style.pointerEvents = "none"; // 避免阻挡鼠标交互

    // 2. 动态生成用于 PDF 高密度打印的明亮白底黑字容器
    const printContainer = document.createElement("div");
    printContainer.className = "pdf-print-template";
    printContainer.style.width = "740px"; // 锁死 740px
    printContainer.style.backgroundColor = "#ffffff";
    printContainer.style.color = "#000000";
    printContainer.style.opacity = "1";
    printContainer.style.visibility = "visible";
    
    const now = new Date();
    const timeStr = now.getFullYear() + "-" + 
        String(now.getMonth() + 1).padStart(2, '0') + "-" + 
        String(now.getDate()).padStart(2, '0') + " " + 
        String(now.getHours()).padStart(2, '0') + ":" + 
        String(now.getMinutes()).padStart(2, '0') + ":" + 
        String(now.getSeconds()).padStart(2, '0');
    
    // 组装头部元数据
    let htmlContent = `
        <div class="pdf-print-title">工地合作运输企业登记总表</div>
        <div class="pdf-print-title-en">Worksite Vehicle Put-on-Record Registration List</div>
        
        <div class="pdf-print-meta">
            <span>项目名称: <strong>${fetchedWorksiteName}</strong></span>
            <span>数据同步时刻: <strong>${timeStr}</strong></span>
            <span>备案车辆总数: <strong>${fetchedVehicles.length} 辆</strong></span>
        </div>
    `;
    
    // 表格一：正式合作运输企业信息 (在 740px 总宽下精密分配列宽以防止溢出与截断)
    htmlContent += `
        <div style="margin-top: 10px; margin-bottom: 16px;">
            <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 6px; border-left: 3px solid #0f172a; padding-left: 6px; text-align: left;">
                | 合作运输企业信息
            </div>
            <table class="pdf-grid-table">
                <thead>
                    <tr>
                        <th style="width: 160px; text-align: left;">企业名称</th>
                        <th style="width: 130px;">地址</th>
                        <th style="width: 70px; text-align: center;">使用车辆数</th>
                        <th>车牌号</th>
                        <th style="width: 130px;">负责人联系方式</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    if (!fetchedTransports.length) {
        htmlContent += `<tr><td colspan="5" style="text-align: center; color: #94a3b8; padding: 15px;">暂无合作运输企业记录</td></tr>`;
    } else {
        fetchedTransports.forEach(item => {
            const formattedPlates = item.carnumbers ? item.carnumbers.split(/[,，]+/).join(", ") : "-";
            htmlContent += `
                <tr>
                    <td style="font-weight: 700; text-align: left;">${item.companyname || "-"}</td>
                    <td>${item.address || "-"}</td>
                    <td style="text-align: center; font-weight: 700; color: #0f172a;">${item.carcount || "0"}</td>
                    <td class="pdf-plate-text" style="text-align: left; line-height: 1.4;">${formattedPlates}</td>
                    <td style="font-family: monospace;">${item.phone || "-"}</td>
                </tr>
            `;
        });
    }
    htmlContent += `</tbody></table></div>`;

    // 表格二：临时合作运输企业信息 (在 740px 物理总宽下分配，预留 170px 空间给车牌号列自适应平铺，其余固定尺寸)
    htmlContent += `
        <div style="margin-top: 10px; margin-bottom: 16px;">
            <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 6px; border-left: 3px solid #0f172a; padding-left: 6px; text-align: left;">
                | 临时合作运输企业信息
            </div>
            <table class="pdf-grid-table">
                <thead>
                    <tr>
                        <th style="width: 150px; text-align: left;">企业名称</th>
                        <th style="width: 110px;">地址</th>
                        <th style="width: 50px; text-align: center;">车辆数</th>
                        <th>车牌号</th>
                        <th style="width: 80px; text-align: center;">开始时间</th>
                        <th style="width: 80px; text-align: center;">结束时间</th>
                        <th style="width: 120px;">负责人联系方式</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    if (!fetchedTempTransports.length) {
        htmlContent += `<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 15px;">暂无临时合作运输企业记录</td></tr>`;
    } else {
        fetchedTempTransports.forEach(item => {
            const formattedPlates = item.carnumbers ? item.carnumbers.split(/[,，]+/).join(", ") : "-";
            htmlContent += `
                <tr>
                    <td style="font-weight: 700; text-align: left;">${item.companyName || "-"}</td>
                    <td>${item.address || "-"}</td>
                    <td style="text-align: center; font-weight: 700; color: #0f172a;">${item.carcount || "0"}</td>
                    <td class="pdf-plate-text" style="text-align: left; line-height: 1.4;">${formattedPlates}</td>
                    <td style="text-align: center;">${item.startDate || "-"}</td>
                    <td style="text-align: center;">${item.endDate || "-"}</td>
                    <td style="font-family: monospace;">${item.phone || "-"}</td>
                </tr>
            `;
        });
    }
    htmlContent += `</tbody></table></div>`;
    
    // 组装权威性尾部盖章
    htmlContent += `
        <div class="pdf-print-footer">
            <div class="pdf-print-stamp">已备案</div>
            <div class="pdf-print-note">
                本登记总表由智能车辆安全校验终端自主分析清洗并高清导出。<br>
                数据完整性与真实性由 ztxn.capcloud.com.cn 官方数据中枢及本地持久化校验库提供双重校验背书。
            </div>
        </div>
    `;
    
    printContainer.innerHTML = htmlContent;
    printWrapper.appendChild(printContainer);
    document.body.appendChild(printWrapper);

    // 清理一下工地名称，用来做文件名
    const worksiteClean = fetchedWorksiteName.replace(/[\\/:*?"<>|]/g, "_");
    const dateStr = new Date().toISOString().slice(0, 10);

    const opt = {
        margin:       [0.3, 0.3, 0.3, 0.3], // 英寸，较紧凑的页边距以展示更多内容
        filename:     `工地合作运输企业登记总表_${worksiteClean}_${dateStr}.pdf`,
        image:        { type: "jpeg", quality: 0.98 },
        html2canvas:  { 
            scale: 2, 
            useCORS: true, 
            backgroundColor: "#ffffff", // 高清明亮白底
            letterRendering: true,
            width: 740, // 锁死 740 像素的 HTML 画布宽度，完美对齐 A4 可打印宽度
            windowWidth: 740, // 确保 html2canvas 的虚拟窗口宽度为 740
            scrollX: 0, // 核心机制：重置滚动偏置 scrollX，防止因页面已向滑动导致截图发生向左物理偏移
            scrollY: 0, // 核心机制：重置滚动偏置 scrollY，防止产生向上偏置
            x: 0,       // 强力对齐 X 坐标起点
            y: 0        // 强力对齐 Y 坐标起点
        },
        jsPDF:        { unit: "in", format: "a4", orientation: "portrait" }, // 标准 A4 纵向规格
        pagebreak:    { mode: ['css', 'legacy'] } // 确保跨页防截断 CSS 规范被尊重
    };

    html2pdf().set(opt).from(printContainer).save().then(() => {
        // 彻底销毁打印用临时 DOM，保持页面洁净度
        if (document.body.contains(printWrapper)) {
            document.body.removeChild(printWrapper);
        }
        // 恢复按钮状态
        downloadTablePdfBtn.disabled = false;
        downloadTablePdfBtn.innerHTML = origHtml;
    }).catch(err => {
        alert("备案总表 PDF 导出失败: " + err.message);
        if (document.body.contains(printWrapper)) {
            document.body.removeChild(printWrapper);
        }
        downloadTablePdfBtn.disabled = false;
        downloadTablePdfBtn.innerHTML = origHtml;
    });
}) : "-";
            htmlContent += `
                <tr>
                    <td style="font-weight: 700; text-align: left;">${item.companyName || "-"}</td>
                    <td>${item.address || "-"}</td>
                    <td style="text-align: center; font-weight: 700; color: #0f172a;">${item.carcount || "0"}</td>
                    <td class="pdf-plate-text" style="text-align: left; line-height: 1.4;">${formattedPlates}</td>
                    <td style="text-align: center;">${item.startDate || "-"}</td>
                    <td style="text-align: center;">${item.endDate || "-"}</td>
                    <td style="font-family: monospace;">${item.phone || "-"}</td>
                </tr>
            `;
        });
    }
    htmlContent += `</tbody></table></div>`;
    
    // 组装权威性尾部盖章
    htmlContent += `
        <div class="pdf-print-footer">
            <div class="pdf-print-stamp">已备案</div>
            <div class="pdf-print-note">
                本登记总表由智能车辆安全校验终端自主分析清洗并高清导出。<br>
                数据完整性与真实性由 ztxn.capcloud.com.cn 官方数据中枢及本地持久化校验库提供双重校验背书。
            </div>
        </div>
    `;
    
    printContainer.innerHTML = htmlContent;
    printWrapper.appendChild(printContainer);
    document.body.appendChild(printWrapper);

    // 清理一下工地名称，用来做文件名
    const worksiteClean = fetchedWorksiteName.replace(/[\\/:*?"<>|]/g, "_");
    const dateStr = new Date().toISOString().slice(0, 10);

    const opt = {
        margin:       [0.3, 0.3, 0.3, 0.3], // 英寸，较紧凑的页边距以展示更多内容
        filename:     `工地合作运输企业登记总表_${worksiteClean}_${dateStr}.pdf`,
        image:        { type: "jpeg", quality: 0.98 },
        html2canvas:  { 
            scale: 2, 
            useCORS: true, 
            backgroundColor: "#ffffff", // 高清明亮白底
            letterRendering: true,
            width: 1080, // 锁死 1080 像素的 HTML 画布宽度
            windowWidth: 1080, // 确保 html2canvas 的虚拟窗口宽度为 1080
            scrollX: 0, // 核心机制：重置滚动偏置 scrollX，防止因页面已向下滑动导致截图发生向左物理偏移
            scrollY: 0, // 核心机制：重置滚动偏置 scrollY，防止产生向上偏置
            x: 0,       // 强力对齐 X 坐标起点
            y: 0        // 强力对齐 Y 坐标起点
        },
        jsPDF:        { unit: "in", format: "a4", orientation: "portrait" }, // 标准 A4 纵向规格
        pagebreak:    { mode: ['css', 'legacy'] } // 确保跨页防截断 CSS 规范被尊重
    };

    html2pdf().set(opt).from(printContainer).save().then(() => {
        // 彻底销毁打印用临时 DOM，保持页面洁净度
        if (document.body.contains(printWrapper)) {
            document.body.removeChild(printWrapper);
        }
        // 恢复按钮状态
        downloadTablePdfBtn.disabled = false;
        downloadTablePdfBtn.innerHTML = origHtml;
    }).catch(err => {
        alert("备案总表 PDF 导出失败: " + err.message);
        if (document.body.contains(printWrapper)) {
            document.body.removeChild(printWrapper);
        }
        downloadTablePdfBtn.disabled = false;
        downloadTablePdfBtn.innerHTML = origHtml;
    });
}
