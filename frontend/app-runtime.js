const BACKEND_URL = window.location.origin;
const CONFIG_KEY = "PLATE_QUERY_CONFIG";
const DEFAULT_TOKEN = "";

let appConfig = {
    authtoken: DEFAULT_TOKEN,
    id: "225642",
    worksitetype: "1"
};
let fetchedVehicles = [];
let fetchedTransports = [];
let fetchedTempTransports = [];
let fetchedWorksiteName = "未命名工地";
let captchaUuid = "";
let dom = {};

// QR Code helper variables
let qrVehiclesList = [];
let qrTemplates = {
    worksite: "http://ztxn.capcloud.com.cn:8080/dist/index.html#/scan/worksite?plate={plate}",
    dump: "http://ztxn.capcloud.com.cn:8080/dist/index.html#/scan/dump?plate={plate}"
};
const QR_STORAGE_KEY = "PLATE_QUERY_QR_HELPER_DATA";
let activeQrVehiclePlate = null;
let activeQrType = null;

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function setDisplay(el, value) {
    if (el) el.style.display = value;
}

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
        } catch {
            localStorage.removeItem(CONFIG_KEY);
        }
    }

    dom.tokenInput.value = appConfig.authtoken || "";
    dom.worksiteIdInput.value = appConfig.id || "225642";
    dom.worksiteTypeInput.value = appConfig.worksitetype || "1";
    if (dom.waybillFilterWorksiteId) {
        dom.waybillFilterWorksiteId.value = "";
    }
}

async function loadConfigFromServer(force = false) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/config`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success && data.authtoken) {
            const hasLocalToken = !!appConfig.authtoken;
            if (force || !hasLocalToken || appConfig.authtoken !== data.authtoken) {
                appConfig.authtoken = data.authtoken;
                appConfig.id = data.id || appConfig.id || "225642";
                appConfig.worksitetype = data.worksitetype || appConfig.worksitetype || "1";
                
                localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));
                
                if (dom.tokenInput) dom.tokenInput.value = appConfig.authtoken;
                if (dom.worksiteIdInput) dom.worksiteIdInput.value = appConfig.id;
                if (dom.worksiteTypeInput) dom.worksiteTypeInput.value = appConfig.worksitetype;
                
                console.log("Successfully synchronized configuration with the server backend.");
                if (force) {
                    alert("🎉 已成功从服务端同步最新接口配置！");
                }
            }
        }
    } catch (err) {
        console.error("Failed to load config from server:", err);
        if (force) {
            alert(`同步服务端配置失败: ${err.message}`);
        }
    }
}

function saveConfig() {
    appConfig = {
        authtoken: dom.tokenInput.value.trim(),
        id: dom.worksiteIdInput.value.trim() || "225642",
        worksitetype: dom.worksiteTypeInput.value.trim() || "1"
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));
    alert("接口配置已保存并应用。");
    closeDrawer();
    detectBackendStatus();
}

const THEME_KEY = "PLATE_QUERY_THEME";

function initTheme() {
    let savedTheme = localStorage.getItem(THEME_KEY);
    if (!savedTheme) {
        // Automatically set to light mode if it is daytime (between 6:00 AM and 6:00 PM)
        const hour = new Date().getHours();
        savedTheme = (hour >= 6 && hour < 18) ? "light" : "dark";
    }
    applyTheme(savedTheme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    
    // Update toggle button text and icon
    if (dom.themeToggleIcon && dom.themeToggleText) {
        if (theme === "light") {
            dom.themeToggleIcon.className = "fa-solid fa-moon";
            dom.themeToggleText.textContent = "夜间模式";
        } else {
            dom.themeToggleIcon.className = "fa-solid fa-sun";
            dom.themeToggleText.textContent = "白天模式";
        }
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const newTheme = currentTheme === "light" ? "dark" : "light";
    applyTheme(newTheme);
}

function setLoginStatus(message, type = "") {
    if (!dom.loginStatus) return;
    dom.loginStatus.textContent = message;
    dom.loginStatus.className = `form-help ${type}`.trim();
}

function formatApiErrorDetail(detail, fallback = "请求失败") {
    if (!detail) return fallback;
    if (typeof detail === "string") return detail;

    const message = detail.message || detail.msg || fallback;
    const remote = detail.remote || detail;
    if (!remote || typeof remote !== "object") {
        return message;
    }

    const parts = [message];
    const summary = {};
    ["code", "message", "msg", "success", "result"].forEach(key => {
        if (Object.prototype.hasOwnProperty.call(remote, key)) {
            summary[key] = remote[key];
        }
    });

    if (Object.keys(summary).length) {
        parts.push(JSON.stringify(summary, null, 2));
    }
    return parts.join("\n");
}

function openDrawer() {
    dom.configDrawer.classList.add("active");
    dom.drawerOverlay.classList.add("active");
    if (!captchaUuid && dom.captchaImage) {
        loadCaptcha();
    }
}

function closeDrawer() {
    dom.configDrawer.classList.remove("active");
    dom.drawerOverlay.classList.remove("active");
}

async function detectBackendStatus() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/health`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        dom.backendStatus.className = "status-indicator online";
        dom.backendStatus.querySelector(".status-text").textContent = "代理服务已就绪";
    } catch {
        dom.backendStatus.className = "status-indicator offline";
        dom.backendStatus.querySelector(".status-text").textContent = "本地代理未就绪";
    }
}

async function fetchLocalData() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/local-data`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.success && data.has_data) {
            fetchedVehicles = data.vehicles || [];
            fetchedTransports = data.transports || [];
            fetchedTempTransports = data.temporary_transports || [];
            fetchedWorksiteName = data.worksite_name || "未命名工地";
            dom.syncTimeDisplay.textContent = `上次同步: ${data.last_updated || "-"}`;
            dom.tableWorksiteDisplay.innerHTML = `备案工地: <span class="text-white">${escapeHtml(fetchedWorksiteName)}</span>`;
            renderEnterpriseTables();
        } else {
            renderEmptyTables(data.msg || "本地尚未同步数据，请点击上方“一键同步最新数据”进行初始化拉取。");
        }
    } catch {
        renderEmptyTables("无法连接后端服务，请确认服务已启动。");
    }
}

async function loadCaptcha(options = {}) {
    const preserveStatus = Boolean(options.preserveStatus);
    if (!dom.refreshCaptchaBtn || !dom.captchaImage) return;

    dom.refreshCaptchaBtn.disabled = true;
    dom.captchaImage.removeAttribute("src");
    if (!preserveStatus) {
        setLoginStatus("正在获取验证码...");
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/login/captcha`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(formatApiErrorDetail(data.detail, "验证码获取失败"));
        }

        captchaUuid = data.uuid || "";
        dom.captchaImage.src = data.img;
        dom.captchaCodeInput.value = "";
        if (!preserveStatus) {
            setLoginStatus("请输入图片验证码后点击登录。");
            dom.captchaCodeInput.focus();
        }
    } catch (err) {
        captchaUuid = "";
        if (!preserveStatus) {
            setLoginStatus(`验证码获取失败: ${err.message}`, "error");
        }
    } finally {
        dom.refreshCaptchaBtn.disabled = false;
    }
}

function applyAuthtoken(token) {
    appConfig = {
        authtoken: token,
        id: dom.worksiteIdInput.value.trim() || appConfig.id || "225642",
        worksitetype: dom.worksiteTypeInput.value.trim() || appConfig.worksitetype || "1"
    };
    dom.tokenInput.value = token;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));
}

async function loginAndSaveToken() {
    const username = dom.loginUsernameInput.value.trim();
    const password = dom.loginPasswordInput.value;
    const code = dom.captchaCodeInput.value.trim();

    if (!username || !password || !code) {
        setLoginStatus("请填写账号、密码和验证码。", "error");
        return;
    }

    dom.autoLoginBtn.disabled = true;
    const originalHtml = dom.autoLoginBtn.innerHTML;
    dom.autoLoginBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> 正在登录...`;
    setLoginStatus("正在提交登录请求...");

    try {
        const response = await fetch(`${BACKEND_URL}/api/login/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username,
                password,
                code,
                uuid: captchaUuid
            })
        });
        const data = await response.json();

        if (!response.ok || !data.success || !data.authtoken) {
            throw new Error(formatApiErrorDetail(data.detail, "登录失败"));
        }

        applyAuthtoken(data.authtoken);
        dom.loginPasswordInput.value = "";
        dom.captchaCodeInput.value = "";
        setLoginStatus("Token 已获取并保存，可直接同步数据。", "success");
        detectBackendStatus();
    } catch (err) {
        setLoginStatus(`登录失败: ${err.message}`, "error");
        await loadCaptcha({ preserveStatus: true });
    } finally {
        dom.autoLoginBtn.disabled = false;
        dom.autoLoginBtn.innerHTML = originalHtml;
    }
}

function formatPlatesToChips(value) {
    if (!value) {
        return `<span style="color: var(--text-secondary); font-style: italic;">无备案车牌</span>`;
    }

    return String(value).split(/[,，\s]+/).filter(Boolean).map(plate => {
        const safePlate = escapeHtml(plate.toUpperCase());
        return `<span style="font-family: var(--font-outfit); font-weight: 700; color: var(--chip-text); background: var(--chip-bg); padding: 3px 8px; border-radius: 6px; border: 1px solid var(--chip-border); margin: 3px; display: inline-block; white-space: nowrap;">${safePlate}</span>`;
    }).join("");
}

function renderEmptyTable(tbody, colSpan, message) {
    tbody.innerHTML = `
        <tr>
            <td colspan="${colSpan}" class="table-empty">
                <i class="fa-solid fa-folder-open empty-icon"></i>
                <p>${escapeHtml(message)}</p>
            </td>
        </tr>
    `;
}

function renderEmptyTables(message) {
    renderEmptyTable(dom.transportsTableBody, 5, message);
    renderEmptyTable(dom.tempTransportsTableBody, 7, message);
    dom.syncTimeDisplay.textContent = "上次同步: 未同步数据";
    dom.tableWorksiteDisplay.textContent = "备案工地: 暂无本地同步数据";
}

function renderEnterpriseTables() {
    if (!fetchedTransports.length) {
        renderEmptyTable(dom.transportsTableBody, 5, "暂无正式合作运输企业记录。");
    } else {
        dom.transportsTableBody.innerHTML = fetchedTransports.map(item => `
            <tr>
                <td style="font-weight: 600; color: var(--text-primary);">${escapeHtml(item.companyname || "未知企业")}</td>
                <td>${escapeHtml(item.address || "-")}</td>
                <td style="text-align: center; font-weight: 800; color: var(--neon-cyan);">${escapeHtml(item.carcount || "0")}</td>
                <td>${formatPlatesToChips(item.carnumbers)}</td>
                <td style="font-family: var(--font-outfit);">${escapeHtml(item.phone || "-")}</td>
            </tr>
        `).join("");
    }

    if (!fetchedTempTransports.length) {
        renderEmptyTable(dom.tempTransportsTableBody, 7, "暂无临时合作运输企业记录。");
    } else {
        dom.tempTransportsTableBody.innerHTML = fetchedTempTransports.map(item => `
            <tr>
                <td style="font-weight: 600; color: var(--text-primary);">${escapeHtml(item.companyName || "未知企业")}</td>
                <td>${escapeHtml(item.address || "-")}</td>
                <td style="text-align: center; font-weight: 800; color: var(--neon-orange);">${escapeHtml(item.carcount || "0")}</td>
                <td>${formatPlatesToChips(item.carnumbers)}</td>
                <td style="text-align: center; font-size: 12px; color: var(--text-secondary);">${escapeHtml(item.startDate || "-")}</td>
                <td style="text-align: center; font-size: 12px; color: var(--text-secondary);">${escapeHtml(item.endDate || "-")}</td>
                <td style="font-family: var(--font-outfit);">${escapeHtml(item.phone || "-")}</td>
            </tr>
        `).join("");
    }
}

async function syncDataFromServer() {
    if (!appConfig.authtoken) {
        alert("请先在右上角【接口配置】中贴入有效 authtoken。");
        return;
    }

    dom.syncDataBtn.disabled = true;
    const originalHtml = dom.syncDataBtn.innerHTML;
    dom.syncDataBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> 正在拉取数据...`;

    try {
        const response = await fetch(`${BACKEND_URL}/api/sync-data`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(appConfig)
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            alert(`同步失败: ${data.detail || "服务端返回异常"}`);
            return;
        }

        fetchedVehicles = data.vehicles || [];
        fetchedTransports = data.transports || [];
        fetchedTempTransports = data.temporary_transports || [];
        fetchedWorksiteName = data.worksite_name || "未命名工地";
        dom.syncTimeDisplay.textContent = `上次同步: ${data.last_updated || "-"}`;
        dom.tableWorksiteDisplay.innerHTML = `备案工地: <span class="text-white">${escapeHtml(fetchedWorksiteName)}</span>`;
        renderEnterpriseTables();
        alert(`本地数据同步成功。共载入 ${fetchedTransports.length} 家正式合作企业，${fetchedTempTransports.length} 家临时合作企业。`);
    } catch (err) {
        alert(`无法连接后端服务：${err.message}`);
    } finally {
        dom.syncDataBtn.disabled = false;
        dom.syncDataBtn.innerHTML = originalHtml;
    }
}

async function performSearch() {
    const plateNo = dom.plateInput.value.trim().toUpperCase();
    if (!plateNo) {
        alert("请输入要检索的车牌号。");
        return;
    }
    if (plateNo.length < 7) {
        alert("输入的车牌号格式不完整。传统车牌为7位，新能源为8位。");
        return;
    }

    setDisplay(dom.resultContainer, "block");
    setDisplay(dom.loadingState, "block");
    setDisplay(dom.successState, "none");
    setDisplay(dom.failState, "none");
    setDisplay(dom.errorState, "none");

    try {
        const response = await fetch(`${BACKEND_URL}/api/local-query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plate_no: plateNo })
        });
        const data = await response.json();
        setDisplay(dom.loadingState, "none");

        if (!response.ok) {
            setDisplay(dom.errorState, "block");
            dom.errorText.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(data.detail || "本地查询失败")}`;
            return;
        }

        if (data.is_match) {
            setDisplay(dom.successState, "block");
            dom.successPlate.textContent = data.plate_no;
            dom.successWorksite.textContent = data.worksite_name || "未命名工地";
            dom.successTime.textContent = new Date().toLocaleString("zh-CN", { hour12: false });
            dom.permitSerial.textContent = `NO. ${Date.now().toString().slice(-8)}`;
        } else {
            setDisplay(dom.failState, "block");
            dom.failPlate.textContent = data.plate_no;
            dom.failWorksite.textContent = data.worksite_name || "未命名工地";
            dom.failDesc.textContent = "在当前本地备案数据中未检索到该车辆备案信息。请先同步最新数据，或通知司机补充报备材料。";
        }
    } catch (err) {
        setDisplay(dom.loadingState, "none");
        setDisplay(dom.errorState, "block");
        dom.errorText.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 无法连接本地代理服务：${escapeHtml(err.message)}`;
    }
}

function renderPdfRows(items, columns, emptyMessage) {
    if (!items || !items.length) {
        return `<tr><td colspan="${columns.length}" style="text-align: center; color: #94a3b8; padding: 15px;">${escapeHtml(emptyMessage)}</td></tr>`;
    }

    return items.map(item => {
        const cells = columns.map(column => {
            const style = column.style ? ` style="${column.style}"` : "";
            return `<td${style}>${escapeHtml(column.value(item) || "-")}</td>`;
        }).join("");
        return `<tr>${cells}</tr>`;
    }).join("");
}

function generateTablePDF() {
    if (!fetchedTransports.length && !fetchedTempTransports.length) {
        alert("本地尚无合作运输企业数据记录，无法导出。");
        return;
    }
    if (typeof html2pdf !== "function") {
        alert("PDF 导出组件尚未加载完成，请稍后再试。");
        return;
    }

    dom.downloadTablePdfBtn.disabled = true;
    const originalHtml = dom.downloadTablePdfBtn.innerHTML;
    dom.downloadTablePdfBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> 正在导出 PDF...`;

    const printWrapper = document.createElement("div");
    printWrapper.id = "pdf-print-wrapper";
    printWrapper.style.position = "absolute";
    printWrapper.style.left = "0";
    printWrapper.style.top = "0";
    printWrapper.style.width = "740px";
    printWrapper.style.opacity = "0.01";
    printWrapper.style.zIndex = "-9999";
    printWrapper.style.pointerEvents = "none";

    const printContainer = document.createElement("div");
    printContainer.className = "pdf-print-template";
    printContainer.style.width = "740px";
    printContainer.style.backgroundColor = "#ffffff";
    printContainer.style.color = "#000000";

    const normalizePlates = value => value ? String(value).split(/[,，\s]+/).filter(Boolean).join(", ") : "-";
    const transportRows = renderPdfRows(fetchedTransports, [
        { value: item => item.companyname, style: "font-weight: 700; text-align: left;" },
        { value: item => item.address },
        { value: item => item.carcount || "0", style: "text-align: center; font-weight: 700; color: #0f172a;" },
        { value: item => normalizePlates(item.carnumbers), style: "text-align: left; line-height: 1.4;" },
        { value: item => item.phone, style: "font-family: monospace;" }
    ], "暂无合作运输企业记录");
    const temporaryRows = renderPdfRows(fetchedTempTransports, [
        { value: item => item.companyName, style: "font-weight: 700; text-align: left;" },
        { value: item => item.address },
        { value: item => item.carcount || "0", style: "text-align: center; font-weight: 700; color: #0f172a;" },
        { value: item => normalizePlates(item.carnumbers), style: "text-align: left; line-height: 1.4;" },
        { value: item => item.startDate, style: "text-align: center;" },
        { value: item => item.endDate, style: "text-align: center;" },
        { value: item => item.phone, style: "font-family: monospace;" }
    ], "暂无临时合作运输企业记录");

    printContainer.innerHTML = `
        <div class="pdf-print-title">工地合作运输企业登记总表</div>
        <div class="pdf-print-title-en">Worksite Vehicle Put-on-Record Registration List</div>
        <div class="pdf-print-meta">
            <span>项目名称: <strong>${escapeHtml(fetchedWorksiteName)}</strong></span>
            <span>导出时间: <strong>${new Date().toLocaleString("zh-CN", { hour12: false })}</strong></span>
            <span>备案车辆总数: <strong>${fetchedVehicles.length} 辆</strong></span>
        </div>
        <div style="margin-top: 10px; margin-bottom: 16px;">
            <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 6px; border-left: 3px solid #0f172a; padding-left: 6px; text-align: left;">| 合作运输企业信息</div>
            <table class="pdf-grid-table">
                <thead><tr><th style="width: 160px; text-align: left;">企业名称</th><th style="width: 130px;">地址</th><th style="width: 70px; text-align: center;">车辆数</th><th>车牌号</th><th style="width: 130px;">负责人联系方式</th></tr></thead>
                <tbody>${transportRows}</tbody>
            </table>
        </div>
        <div style="margin-top: 10px; margin-bottom: 16px;">
            <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 6px; border-left: 3px solid #0f172a; padding-left: 6px; text-align: left;">| 临时合作运输企业信息</div>
            <table class="pdf-grid-table">
                <thead><tr><th style="width: 150px; text-align: left;">企业名称</th><th style="width: 110px;">地址</th><th style="width: 50px; text-align: center;">车辆数</th><th>车牌号</th><th style="width: 80px; text-align: center;">开始时间</th><th style="width: 80px; text-align: center;">结束时间</th><th style="width: 120px;">负责人联系方式</th></tr></thead>
                <tbody>${temporaryRows}</tbody>
            </table>
        </div>
        <div class="pdf-print-footer">
            <div class="pdf-print-stamp">已备案</div>
            <div class="pdf-print-note">本登记总表由智能车辆安全校验终端自主分析清洗并高清导出。<br>数据完整性与真实性由官方数据接口及本地持久化校验库提供校验。</div>
        </div>
    `;

    printWrapper.appendChild(printContainer);
    document.body.appendChild(printWrapper);

    const worksiteClean = fetchedWorksiteName.replace(/[\\/:*?"<>|]/g, "_");
    const dateStr = new Date().toISOString().slice(0, 10);
    const cleanup = () => {
        if (document.body.contains(printWrapper)) document.body.removeChild(printWrapper);
        dom.downloadTablePdfBtn.disabled = false;
        dom.downloadTablePdfBtn.innerHTML = originalHtml;
    };

    html2pdf().set({
        margin: [0.3, 0.3, 0.3, 0.3],
        filename: `工地合作运输企业登记总表_${worksiteClean}_${dateStr}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            letterRendering: true,
            width: 740,
            windowWidth: 740,
            scrollX: 0,
            scrollY: 0,
            x: 0,
            y: 0
        },
        jsPDF: { unit: "in", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] }
    }).from(printContainer).save().then(cleanup).catch(err => {
        alert(`备案总表 PDF 导出失败: ${err.message}`);
        cleanup();
    });
}

window.fillPlate = function fillPlate(plate) {
    dom.plateInput.value = String(plate).toUpperCase();
    performSearch();
};

function initWaybillDates() {
    // 默认查询当天，强制使用中枢系统的基准运行日期 2026-05-31
    const dateStr = "2026-05-31";
    dom.waybillFilterStarTime.value = dateStr;
    dom.waybillFilterEndTime.value = dateStr;
}

function switchTab(activeTab) {
    if (activeTab === "access") {
        dom.tabAccessBtn.classList.add("active");
        dom.tabWaybillBtn.classList.remove("active");
        dom.tabQrBtn.classList.remove("active");
        setDisplay(dom.accessPage, "block");
        setDisplay(dom.waybillPage, "none");
        setDisplay(dom.qrPage, "none");
    } else if (activeTab === "waybill") {
        dom.tabAccessBtn.classList.remove("active");
        dom.tabWaybillBtn.classList.add("active");
        dom.tabQrBtn.classList.remove("active");
        setDisplay(dom.accessPage, "none");
        setDisplay(dom.waybillPage, "block");
        setDisplay(dom.qrPage, "none");
        
        // 首次或列表为空时自动加载运单数据，提升用户体验
        if (dom.waybillsTableBody && dom.waybillsTableBody.querySelector(".table-empty")) {
            queryWaybills();
        }
    } else if (activeTab === "qr") {
        dom.tabAccessBtn.classList.remove("active");
        dom.tabWaybillBtn.classList.remove("active");
        dom.tabQrBtn.classList.add("active");
        setDisplay(dom.accessPage, "none");
        setDisplay(dom.waybillPage, "none");
        setDisplay(dom.qrPage, "block");
        renderQrGrid();
    }
}

function resetWaybillFilters() {
    dom.waybillFilterWorksiteId.value = "";
    dom.waybillFilterCode.value = "";
    dom.waybillFilterState.value = "";
    initWaybillDates();
    dom.waybillFilterLimit.value = "20"; // 默认 20 条
    
    // 重置状态过滤 pill 的激活状态
    const pills = document.querySelectorAll(".status-pill");
    pills.forEach(p => p.classList.remove("active"));
    const allPill = document.querySelector('.status-pill[data-state=""]');
    if (allPill) allPill.classList.add("active");

    // 折叠高级筛选面板
    if (dom.advancedFiltersPanel) {
        dom.advancedFiltersPanel.style.display = "none";
        dom.toggleAdvancedFiltersBtn.innerHTML = `<i class="fa-solid fa-sliders"></i> 高级筛选`;
    }
    
    setDisplay(dom.waybillsTablePanelSection, "none");
    dom.waybillsTableBody.innerHTML = `
        <tr>
            <td colspan="12" class="table-empty">
                <i class="fa-solid fa-folder-open empty-icon"></i>
                <p>无检索运单数据，请输入查询条件并点击【查询】！</p>
            </td>
        </tr>
    `;
    dom.waybillStatsDisplay.textContent = "共检索到 0 条运单记录";
    setDisplay(dom.waybillSummaryStats, "none");
}

async function queryWaybills() {
    if (!appConfig.authtoken) {
        alert("请先在右上角【接口配置】中贴入有效 authtoken。");
        openDrawer();
        return;
    }

    dom.waybillQueryBtn.disabled = true;
    const originalHtml = dom.waybillQueryBtn.innerHTML;
    dom.waybillQueryBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> 查询中...`;

    dom.waybillsTableBody.innerHTML = `
        <tr>
            <td colspan="12" class="table-empty">
                <i class="fa-solid fa-circle-notch fa-spin empty-icon" style="font-size: 24px;"></i>
                <p>正在读取目标运单中枢数据，请稍候...</p>
            </td>
        </tr>
    `;
    setDisplay(dom.waybillsTablePanelSection, "block");
    setDisplay(dom.waybillSummaryStats, "none");

    const payload = {
        authtoken: appConfig.authtoken,
        page: 1,
        limit: parseInt(dom.waybillFilterLimit.value) || 50,
        id: dom.waybillFilterWorksiteId.value.trim(),
        state: dom.waybillFilterState.value,
        starTime: dom.waybillFilterStarTime.value,
        endTime: dom.waybillFilterEndTime.value,
        code: dom.waybillFilterCode.value.trim()
    };

    try {
        const response = await fetch(`${BACKEND_URL}/api/waybills`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error((data.detail && typeof data.detail === 'string') ? data.detail : "目标中枢服务响应异常");
        }

        const resultObj = data.result || {};
        const rows = resultObj.rows || [];
        const total = resultObj.total ?? 0;
        const count = resultObj.count ?? 0.0;

        dom.waybillStatsDisplay.textContent = `共检索到 ${total} 条运单记录 (当前页展示 ${rows.length} 条)`;
        
        if (count > 0) {
            setDisplay(dom.waybillSummaryStats, "flex");
            dom.waybillTotalTonnage.textContent = Number(count).toFixed(2);
        } else {
            setDisplay(dom.waybillSummaryStats, "none");
        }

        if (!rows.length) {
            renderEmptyTable(dom.waybillsTableBody, 9, "未检索到匹配的运单记录！");
        } else {
            dom.waybillsTableBody.innerHTML = rows.map(item => {
                let stateHtml = "";
                if (item.state === "运输中") {
                    stateHtml = `<span class="badge-shipping">运输中</span>`;
                } else if (item.state === "已完成") {
                    stateHtml = `<span class="badge-completed">已完成</span>`;
                } else if (item.state === "异常") {
                    stateHtml = `<span class="badge-error">异常</span>`;
                } else if (item.state === "违规运单") {
                    stateHtml = `<span class="badge-warning">违规运单</span>`;
                } else {
                    stateHtml = `<span class="status-text">${escapeHtml(item.state || "-")}</span>`;
                }

                return `
                    <tr>
                        <td style="text-align: center;">${stateHtml}</td>
                        <td style="font-weight: 700; color: var(--text-primary);">${escapeHtml(item.carnumberplate || "-")}</td>
                        <td style="text-align: left; font-size: 13px;">${escapeHtml(item.worksitename || "-")}</td>
                        <td style="text-align: left; font-size: 13px;">${escapeHtml(item.absorptivename || "-")}</td>
                        <td style="text-align: left; font-size: 13px;">${escapeHtml(item.transportname || "-")}</td>
                        <td>${escapeHtml(item.rubbishtype || "-")}</td>
                        <td style="text-align: center; font-weight: 700; color: var(--neon-cyan);">${escapeHtml(item.transportinoutnum || "-")}</td>
                        <td style="text-align: center; font-size: 12px; color: var(--text-secondary);">${escapeHtml(item.leavetime || "-")}</td>
                        <td style="text-align: center; font-size: 12px; color: var(--text-secondary);">${escapeHtml(item.arrivetime || "-")}</td>
                    </tr>
                `;
            }).join("");
        }
    } catch (err) {
        renderEmptyTable(dom.waybillsTableBody, 9, `查询失败：${err.message}`);
        dom.waybillStatsDisplay.textContent = `查询异常`;
        setDisplay(dom.waybillSummaryStats, "none");
    } finally {
        dom.waybillQueryBtn.disabled = false;
        dom.waybillQueryBtn.innerHTML = originalHtml;
    }
}

// ==========================================
// 简易扫码助手核心业务逻辑
// ==========================================
// Active editing vehicle QR data
let activeEditPlate = null;
let activeEditQrImage = null;

async function loadQrConfig() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/qr-helper/config`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success) {
            qrVehiclesList = data.vehicles || [];
            renderQrGrid();
            return;
        }
    } catch (e) {
        console.error("Failed to load QR config from backend, falling back to localStorage:", e);
    }

    const saved = localStorage.getItem(QR_STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            qrVehiclesList = parsed.vehicles || [];
        } catch (e) {
            console.error("Failed to parse QR storage:", e);
        }
    }
    renderQrGrid();
}

async function saveQrConfig() {
    // 1. Save to local storage for instant fallback
    localStorage.setItem(QR_STORAGE_KEY, JSON.stringify({
        vehicles: qrVehiclesList,
        templates: qrTemplates
    }));

    // 2. Async POST sync to backend server
    try {
        const response = await fetch(`${BACKEND_URL}/api/qr-helper/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                vehicles: qrVehiclesList,
                templates: qrTemplates
            })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (e) {
        console.error("Failed to sync QR config to backend:", e);
    }
}

function isNewEnergyVehicle(plate) {
    const cleanPlate = String(plate).trim().toUpperCase();
    if (cleanPlate.length === 8) return true;
    return false;
}

function renderQrGrid() {
    if (!dom.qrVehiclesGrid) return;
    
    if (qrVehiclesList.length === 0) {
        dom.qrVehiclesGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 48px; background: var(--card-bg); border: 1px dashed var(--card-border); border-radius: 12px; backdrop-filter: blur(20px);">
                <i class="fa-solid fa-qrcode" style="font-size: 40px; color: rgba(255,255,255,0.15); margin-bottom: 16px; display: block;"></i>
                <p style="color: var(--text-secondary); margin-bottom: 16px;">当前没有固定的扫码车辆</p>
                <button class="btn btn-primary" onclick="openBatchAddModal()">
                    <i class="fa-solid fa-plus"></i> 立即添加车辆
                </button>
            </div>
        `;
        return;
    }

    // Sort vehicles: enabled first, disabled last
    const sortedVehicles = [...qrVehiclesList].sort((a, b) => {
        const aEnabled = a.enabled !== false ? 1 : 0;
        const bEnabled = b.enabled !== false ? 1 : 0;
        return bEnabled - aEnabled;
    });

    dom.qrVehiclesGrid.innerHTML = sortedVehicles.map(vehicle => {
        const isNEV = isNewEnergyVehicle(vehicle.plate);
        const plateClass = isNEV ? "plate-green" : "plate-blue";
        const isWaitWorksite = vehicle.status === 0;
        const isEnabled = vehicle.enabled !== false;
        
        let worksiteBtnClass = "btn-qr-action";
        let dumpBtnClass = "btn-qr-action";
        let worksiteBtnText = "";
        let dumpBtnText = "";
        let worksiteBtnAttr = "";
        let dumpBtnAttr = "";
        let cardClass = isEnabled ? "qr-vehicle-card" : "qr-vehicle-card disabled-card";

        const hasQr = !!(vehicle.qrImage || vehicle.worksiteQrImage || vehicle.dumpQrImage);

        if (!isEnabled) {
            worksiteBtnClass += " btn-qr-disabled";
            worksiteBtnText = `<i class="fa-solid fa-ban"></i> 扫码已关`;
            worksiteBtnAttr = "disabled";
            
            dumpBtnClass += " btn-qr-disabled";
            dumpBtnText = `<i class="fa-solid fa-ban"></i> 扫码已关`;
            dumpBtnAttr = "disabled";
        } else if (isWaitWorksite) {
            // 工地扫码激活状态与二维码判定
            if (hasQr) {
                worksiteBtnClass += " btn-qr-worksite pulse-glow-blue";
                worksiteBtnText = `<i class="fa-solid fa-qrcode"></i> 扫工地`;
            } else {
                worksiteBtnClass += " btn-qr-unuploaded";
                worksiteBtnText = `<i class="fa-solid fa-qrcode"></i> 扫工地`;
            }
            
            // 土点扫码锁定状态
            dumpBtnClass += " btn-qr-locked";
            dumpBtnAttr = "disabled";
            dumpBtnText = `<i class="fa-solid fa-lock"></i> 待扫土点`;
        } else {
            // 工地扫码完成状态
            worksiteBtnClass += " btn-qr-done";
            worksiteBtnText = `<i class="fa-solid fa-circle-check"></i> 工地已扫`;
            worksiteBtnAttr = "disabled";
            
            // 土点扫码激活状态与二维码判定
            if (hasQr) {
                dumpBtnClass += " btn-qr-dump pulse-glow-orange";
                dumpBtnText = `<i class="fa-solid fa-qrcode"></i> 扫土点`;
            } else {
                dumpBtnClass += " btn-qr-unuploaded";
                dumpBtnText = `<i class="fa-solid fa-qrcode"></i> 扫土点`;
            }
        }

        // Display time of scans next to buttons
        const worksiteTimeStr = vehicle.worksiteTime ? escapeHtml(vehicle.worksiteTime) : "--:--:--";
        const dumpTimeStr = vehicle.dumpTime ? escapeHtml(vehicle.dumpTime) : "--:--:--";

        return `
            <div class="${cardClass}" data-plate="${escapeHtml(vehicle.plate)}">
                <div class="qr-card-header">
                    <span class="qr-plate ${plateClass}">${escapeHtml(vehicle.plate)}</span>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <label class="switch-toggle" title="启用/禁用扫码">
                            <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="toggleVehicleEnabled('${escapeHtml(vehicle.plate)}', this.checked)">
                            <span class="switch-slider"></span>
                        </label>
                        <button class="qr-edit-btn" onclick="openEditQrModal('${escapeHtml(vehicle.plate)}')" title="配置二维码">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="qr-delete-btn" onclick="deleteQrVehicle('${escapeHtml(vehicle.plate)}')" title="删除车辆">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
                <div class="qr-action-area">
                    <div class="qr-action-row">
                        <button class="${worksiteBtnClass}" ${worksiteBtnAttr} onclick="openQrCodeModal('${escapeHtml(vehicle.plate)}', 'worksite')">
                            ${worksiteBtnText}
                        </button>
                        <span class="qr-action-time" title="工地上次扫码时间">${worksiteTimeStr}</span>
                    </div>
                    <div class="qr-action-row">
                        <button class="${dumpBtnClass}" ${dumpBtnAttr} onclick="openQrCodeModal('${escapeHtml(vehicle.plate)}', 'dump')">
                            ${dumpBtnText}
                        </button>
                        <span class="qr-action-time" title="土点上次扫码时间">${dumpTimeStr}</span>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

window.deleteQrVehicle = function(plate) {
    if (confirm(`确认要删除车辆 ${plate} 吗？`)) {
        qrVehiclesList = qrVehiclesList.filter(v => v.plate !== plate);
        saveQrConfig();
        renderQrGrid();
    }
};

window.toggleVehicleEnabled = function(plate, isEnabled) {
    const vehicle = qrVehiclesList.find(v => v.plate === plate);
    if (vehicle) {
        vehicle.enabled = isEnabled;
        saveQrConfig();
        renderQrGrid();
    }
};

window.openBatchAddModal = function() {
    dom.batchAddTextArea.value = "";
    dom.batchAddModal.classList.add("active");
};

function closeAllModals() {
    dom.qrCodeModal.classList.remove("active");
    dom.batchAddModal.classList.remove("active");
    dom.editQrModal.classList.remove("active");
    activeQrVehiclePlate = null;
    activeQrType = null;
    activeEditPlate = null;
    activeEditQrImage = null;
}

// Client-side image compression
function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement("canvas");
            const max_size = 400; // Scales down image to maintain fast synchronization
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > max_size) {
                    height *= max_size / width;
                    width = max_size;
                }
            } else {
                if (height > max_size) {
                    width *= max_size / height;
                    height = max_size;
                }
            }
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
            callback(dataUrl);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Upload preview update functions
function updateUploadPreview(dataUrl) {
    activeEditQrImage = dataUrl;

    if (dataUrl) {
        dom.vehicleQrPreviewBox.innerHTML = `<img src="${dataUrl}" alt="预览">`;
        dom.vehicleUploadStatus.textContent = "已上传 ✓";
        dom.vehicleUploadStatus.style.color = "var(--neon-green-solid)";
        setDisplay(dom.deleteVehicleQrBtn, "inline-flex");
    } else {
        dom.vehicleQrPreviewBox.innerHTML = `<i class="fa-solid fa-image" style="font-size: 24px; color: rgba(255,255,255,0.15);"></i>`;
        dom.vehicleUploadStatus.textContent = "未上传";
        dom.vehicleUploadStatus.style.color = "var(--text-secondary)";
        setDisplay(dom.deleteVehicleQrBtn, "none");
    }
}

window.openEditQrModal = function(plate) {
    activeEditPlate = plate;
    const vehicle = qrVehiclesList.find(v => v.plate === plate);
    if (!vehicle) return;

    dom.editQrPlateDisplay.textContent = plate;
    const isNEV = isNewEnergyVehicle(plate);
    dom.editQrPlateDisplay.className = `qr-plate ${isNEV ? "plate-green" : "plate-blue"}`;

    dom.vehicleQrFileInput.value = "";

    const existingImage = vehicle.qrImage || vehicle.worksiteQrImage || vehicle.dumpQrImage || null;
    updateUploadPreview(existingImage);

    dom.editQrModal.classList.add("active");
};

function handleSaveEditQr() {
    if (!activeEditPlate) return;
    const vehicle = qrVehiclesList.find(v => v.plate === activeEditPlate);
    if (vehicle) {
        vehicle.qrImage = activeEditQrImage;
        // Clean up legacy keys
        delete vehicle.worksiteQrImage;
        delete vehicle.dumpQrImage;
        saveQrConfig();
        renderQrGrid();
    }
    closeAllModals();
    alert("二维码已更新并保存到云端数据库中。");
}

function openQrCodeModal(plate, type) {
    activeQrVehiclePlate = plate;
    activeQrType = type;

    const vehicle = qrVehiclesList.find(v => v.plate === plate);
    dom.qrCodePlateDisplay.textContent = plate;

    if (type === "worksite") {
        dom.qrCodeModalTitle.innerHTML = `<i class="fa-solid fa-building-shield"></i> 工地扫码认证`;
        dom.qrCodeStepBadge.textContent = "第一步 / 扫工地";
        dom.qrCodeStepBadge.className = "qr-code-step-badge";
        dom.qrCodeStepBadge.style.borderColor = "var(--neon-cyan)";
        dom.qrCodeStepBadge.style.color = "var(--neon-cyan)";
        dom.qrCodeStepTitle.textContent = "请司机使用手机扫描下方二维码";
        dom.confirmQrScannedBtn.className = "btn btn-success";
        dom.confirmQrScannedBtn.style.background = ""; // Reset inline color
        dom.confirmQrScannedBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> 确认司机已扫码`;
    } else {
        dom.qrCodeModalTitle.innerHTML = `<i class="fa-solid fa-mountain"></i> 消纳土点扫码`;
        dom.qrCodeStepBadge.textContent = "第二步 / 扫土点";
        dom.qrCodeStepBadge.className = "qr-code-step-badge";
        dom.qrCodeStepBadge.style.borderColor = "var(--neon-orange)";
        dom.qrCodeStepBadge.style.color = "var(--neon-orange)";
        dom.qrCodeStepTitle.textContent = "请司机使用手机扫描下方二维码";
        dom.confirmQrScannedBtn.className = "btn btn-success";
        dom.confirmQrScannedBtn.style.background = "linear-gradient(180deg, #d99726 0%, var(--neon-orange) 100%)";
        dom.confirmQrScannedBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> 确认司机已扫码`;
    }

    const imgData = vehicle ? (vehicle.qrImage || vehicle.worksiteQrImage || vehicle.dumpQrImage) : null;
    if (imgData) {
        dom.qrCodeImage.src = imgData;
        setDisplay(dom.qrCodeImage, "block");
        setDisplay(dom.qrCodeImageFallback, "none");
    } else {
        dom.qrCodeImage.src = "";
        setDisplay(dom.qrCodeImage, "none");
        setDisplay(dom.qrCodeImageFallback, "block");
    }

    dom.qrCodeModal.classList.add("active");
}

function processQrScannedConfirm() {
    if (!activeQrVehiclePlate || !activeQrType) return;

    const vehicle = qrVehiclesList.find(v => v.plate === activeQrVehiclePlate);
    if (vehicle) {
        // Record timestamp of click
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const ss = String(now.getSeconds()).padStart(2, "0");
        const timeStr = `${hh}:${mm}:${ss}`;
        vehicle.lastScannedTime = timeStr;

        if (activeQrType === "worksite") {
            vehicle.status = 1;
            vehicle.worksiteTime = timeStr;
        } else {
            vehicle.status = 0;
            vehicle.dumpTime = timeStr;
        }
        saveQrConfig();
        renderQrGrid();
    }
    closeAllModals();
}

function handleBatchAddSubmit() {
    const rawText = dom.batchAddTextArea.value;
    const items = rawText.split(/[,，;；\s\n、]+/).map(i => i.trim().toUpperCase()).filter(Boolean);
    const plateRegex = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,6}[挂学警港澳变超]?$/;
    
    let addedCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;

    items.forEach(plate => {
        if (!plateRegex.test(plate)) {
            invalidCount++;
            return;
        }

        const exists = qrVehiclesList.some(v => v.plate === plate);
        if (exists) {
            duplicateCount++;
            return;
        }

        qrVehiclesList.push({
            plate: plate,
            status: 0,
            qrImage: null,
            worksiteTime: null,
            dumpTime: null
        });
        addedCount++;
    });

    saveQrConfig();
    renderQrGrid();
    closeAllModals();

    alert(`批量添加完成：\n成功添加: ${addedCount} 辆车\n格式错误: ${invalidCount} 辆\n已存在重复车牌: ${duplicateCount} 辆`);
}

function handleResetAllVehicles() {
    if (qrVehiclesList.length === 0) {
        alert("当前没有固定的扫码车辆！");
        return;
    }

    if (confirm("确定要一键重置所有车辆的扫码状态为【等待扫工地】吗？")) {
        qrVehiclesList.forEach(v => {
            v.status = 0;
            v.worksiteTime = null;
            v.dumpTime = null;
            v.lastScannedTime = null;
        });
        saveQrConfig();
        renderQrGrid();
        alert("所有车辆扫码状态已重置为第一步。");
    }
}

function openQrSettingsModal() {
    dom.worksiteTemplateInput.value = localStorage.getItem("worksiteTemplate") || "";
    dom.dumpTemplateInput.value = localStorage.getItem("dumpTemplate") || "";
    dom.qrSettingsModal.classList.add("active");
}

function handleSaveQrSettings() {
    localStorage.setItem("worksiteTemplate", dom.worksiteTemplateInput.value);
    localStorage.setItem("dumpTemplate", dom.dumpTemplateInput.value);
    closeAllModals();
    alert("二维码模板已更新。");
}

window.addEventListener("DOMContentLoaded", () => {
    dom = {
        backendStatus: $("backendStatus"),
        openConfigBtn: $("openConfigBtn"),
        closeConfigBtn: $("closeConfigBtn"),
        configDrawer: $("configDrawer"),
        drawerOverlay: $("drawerOverlay"),
        saveConfigBtn: $("saveConfigBtn"),
        loginUsernameInput: $("loginUsernameInput"),
        loginPasswordInput: $("loginPasswordInput"),
        captchaImage: $("captchaImage"),
        captchaCodeInput: $("captchaCodeInput"),
        refreshCaptchaBtn: $("refreshCaptchaBtn"),
        autoLoginBtn: $("autoLoginBtn"),
        loginStatus: $("loginStatus"),
        tokenInput: $("tokenInput"),
        worksiteIdInput: $("worksiteIdInput"),
        worksiteTypeInput: $("worksiteTypeInput"),
        plateInput: $("plateInput"),
        searchBtn: $("searchBtn"),
        resultContainer: $("resultContainer"),
        loadingState: $("loadingState"),
        successState: $("successState"),
        failState: $("failState"),
        errorState: $("errorState"),
        successPlate: $("successPlate"),
        successWorksite: $("successWorksite"),
        successTime: $("successTime"),
        permitSerial: $("permitSerial"),
        failPlate: $("failPlate"),
        failWorksite: $("failWorksite"),
        failDesc: $("failDesc"),
        errorText: $("errorText"),
        syncDataBtn: $("syncDataBtn"),
        syncTimeDisplay: $("syncTimeDisplay"),
        tableWorksiteDisplay: $("tableWorksiteDisplay"),
        transportsTableBody: $("transportsTableBody"),
        tempTransportsTableBody: $("tempTransportsTableBody"),
        downloadTablePdfBtn: $("downloadTablePdfBtn"),
        
        // Waybill items
        tabAccessBtn: $("tabAccessBtn"),
        tabWaybillBtn: $("tabWaybillBtn"),
        accessPage: $("accessPage"),
        waybillPage: $("waybillPage"),
        waybillFilterWorksiteId: $("waybillFilterWorksiteId"),
        waybillFilterCode: $("waybillFilterCode"),
        waybillFilterState: $("waybillFilterState"),
        waybillFilterStarTime: $("waybillFilterStarTime"),
        waybillFilterEndTime: $("waybillFilterEndTime"),
        waybillFilterLimit: $("waybillFilterLimit"),
        waybillQueryBtn: $("waybillQueryBtn"),
        waybillResetBtn: $("waybillResetBtn"),
        waybillsTablePanelSection: $("waybillsTablePanelSection"),
        waybillStatsDisplay: $("waybillStatsDisplay"),
        waybillSummaryStats: $("waybillSummaryStats"),
        waybillTotalTonnage: $("waybillTotalTonnage"),
        waybillsTableBody: $("waybillsTableBody"),
        toggleAdvancedFiltersBtn: $("toggleAdvancedFiltersBtn"),
        advancedFiltersPanel: $("advancedFiltersPanel"),

        // QR Code Helper bindings
        tabQrBtn: $("tabQrBtn"),
        qrPage: $("qrPage"),
        qrVehiclesGrid: $("qrVehiclesGrid"),
        batchAddBtn: $("batchAddBtn"),
        resetAllVehiclesBtn: $("resetAllVehiclesBtn"),

        // Modals
        qrCodeModal: $("qrCodeModal"),
        closeQrCodeModalBtn: $("closeQrCodeModalBtn"),
        cancelQrCodeModalBtn: $("cancelQrCodeModalBtn"),
        confirmQrScannedBtn: $("confirmQrScannedBtn"),
        qrCodeModalTitle: $("qrCodeModalTitle"),
        qrCodeStepBadge: $("qrCodeStepBadge"),
        qrCodeStepTitle: $("qrCodeStepTitle"),
        qrCodeImage: $("qrCodeImage"),
        qrCodeImageFallback: $("qrCodeImageFallback"),
        qrCodePlateDisplay: $("qrCodePlateDisplay"),

        batchAddModal: $("batchAddModal"),
        closeBatchAddModalBtn: $("closeBatchAddModalBtn"),
        cancelBatchAddModalBtn: $("cancelBatchAddModalBtn"),
        confirmBatchAddBtn: $("confirmBatchAddBtn"),
        batchAddTextArea: $("batchAddTextArea"),

        // Edit QR Modal bindings
        editQrModal: $("editQrModal"),
        closeEditQrModalBtn: $("closeEditQrModalBtn"),
        cancelEditQrModalBtn: $("cancelEditQrModalBtn"),
        saveEditQrBtn: $("saveEditQrBtn"),
        editQrPlateDisplay: $("editQrPlateDisplay"),
        vehicleUploadStatus: $("vehicleUploadStatus"),
        vehicleQrPreviewBox: $("vehicleQrPreviewBox"),
        vehicleQrFileInput: $("vehicleQrFileInput"),
        deleteVehicleQrBtn: $("deleteVehicleQrBtn"),
        themeToggleBtn: $("themeToggleBtn"),
        themeToggleIcon: $("themeToggleIcon"),
        themeToggleText: $("themeToggleText"),
        syncConfigFromServerBtn: $("syncConfigFromServerBtn"),
    };

    // Safety check for null DOM elements to prevent fatal crash
    const missingElements = [];
    for (const [key, value] of Object.entries(dom)) {
        if (value === null) {
            missingElements.push(key);
        }
    }
    if (missingElements.length > 0) {
        console.warn("The following DOM element IDs were not found in the HTML page: ", missingElements);
    }

    const safeAddListener = (el, event, handler) => {
        if (el) {
            el.addEventListener(event, handler);
        } else {
            console.warn(`Could not bind event '${event}' because the target element is null.`);
        }
    };

    loadConfig();
    loadConfigFromServer(false);
    initTheme();
    detectBackendStatus();
    fetchLocalData();
    initWaybillDates();

    safeAddListener(dom.openConfigBtn, "click", openDrawer);
    safeAddListener(dom.closeConfigBtn, "click", closeDrawer);
    safeAddListener(dom.drawerOverlay, "click", closeDrawer);
    safeAddListener(dom.saveConfigBtn, "click", saveConfig);
    safeAddListener(dom.refreshCaptchaBtn, "click", loadCaptcha);
    safeAddListener(dom.autoLoginBtn, "click", loginAndSaveToken);
    safeAddListener(dom.syncDataBtn, "click", syncDataFromServer);
    safeAddListener(dom.searchBtn, "click", performSearch);
    safeAddListener(dom.downloadTablePdfBtn, "click", generateTablePDF);
    safeAddListener(dom.themeToggleBtn, "click", toggleTheme);
    safeAddListener(dom.syncConfigFromServerBtn, "click", () => loadConfigFromServer(true));

    if (dom.plateInput) {
        dom.plateInput.addEventListener("input", event => {
            event.target.value = event.target.value.toUpperCase().replace(/\s+/g, "");
        });
        dom.plateInput.addEventListener("keydown", event => {
            if (event.key === "Enter") performSearch();
        });
    }
    
    if (dom.captchaCodeInput) {
        dom.captchaCodeInput.addEventListener("keydown", event => {
            if (event.key === "Enter") loginAndSaveToken();
        });
    }
    
    // Waybills page events
    safeAddListener(dom.tabAccessBtn, "click", () => switchTab("access"));
    safeAddListener(dom.tabWaybillBtn, "click", () => switchTab("waybill"));
    
    if (dom.waybillFilterCode) {
        dom.waybillFilterCode.addEventListener("input", event => {
            event.target.value = event.target.value.toUpperCase().replace(/\s+/g, "");
        });
        dom.waybillFilterCode.addEventListener("keydown", event => {
            if (event.key === "Enter") queryWaybills();
        });
    }
    if (dom.waybillFilterWorksiteId) {
        dom.waybillFilterWorksiteId.addEventListener("keydown", event => {
            if (event.key === "Enter") queryWaybills();
        });
    }
    safeAddListener(dom.waybillQueryBtn, "click", queryWaybills);
    safeAddListener(dom.waybillResetBtn, "click", resetWaybillFilters);

    // 高级筛选面板展开/折叠
    safeAddListener(dom.toggleAdvancedFiltersBtn, "click", () => {
        if (dom.advancedFiltersPanel) {
            const isHidden = dom.advancedFiltersPanel.style.display === "none" || dom.advancedFiltersPanel.style.display === "";
            dom.advancedFiltersPanel.style.display = isHidden ? "block" : "none";
            dom.toggleAdvancedFiltersBtn.innerHTML = isHidden ? 
                `<i class="fa-solid fa-chevron-up"></i> 收起筛选` : 
                `<i class="fa-solid fa-sliders"></i> 高级筛选`;
        }
    });

    // 状态过滤 Pills 点击事件绑定
    const pills = document.querySelectorAll(".status-pill");
    pills.forEach(pill => {
        pill.addEventListener("click", () => {
            pills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            if (dom.waybillFilterState) {
                dom.waybillFilterState.value = pill.getAttribute("data-state") || "";
            }
            queryWaybills();
        });
    });

    // QR Helper events
    safeAddListener(dom.tabQrBtn, "click", () => switchTab("qr"));
    safeAddListener(dom.batchAddBtn, "click", openBatchAddModal);
    safeAddListener(dom.resetAllVehiclesBtn, "click", handleResetAllVehicles);

    // Modals events
    safeAddListener(dom.closeQrCodeModalBtn, "click", closeAllModals);
    safeAddListener(dom.cancelQrCodeModalBtn, "click", closeAllModals);
    safeAddListener(dom.confirmQrScannedBtn, "click", processQrScannedConfirm);

    safeAddListener(dom.closeBatchAddModalBtn, "click", closeAllModals);
    safeAddListener(dom.cancelBatchAddModalBtn, "click", closeAllModals);
    safeAddListener(dom.confirmBatchAddBtn, "click", handleBatchAddSubmit);

    // Edit Modal events
    safeAddListener(dom.closeEditQrModalBtn, "click", closeAllModals);
    safeAddListener(dom.cancelEditQrModalBtn, "click", closeAllModals);
    safeAddListener(dom.saveEditQrBtn, "click", handleSaveEditQr);

    // File input changes with compression
    if (dom.vehicleQrFileInput) {
        dom.vehicleQrFileInput.addEventListener("change", event => {
            const file = event.target.files[0];
            if (file) {
                compressImage(file, dataUrl => updateUploadPreview(dataUrl));
            }
        });
    }

    // Delete buttons
    if (dom.deleteVehicleQrBtn) {
        dom.deleteVehicleQrBtn.addEventListener("click", () => updateUploadPreview(null));
    }

    // Close on escape key
    window.addEventListener("keydown", event => {
        if (event.key === "Escape") closeAllModals();
    });

    // Initialize QR configuration
    loadQrConfig();
});
