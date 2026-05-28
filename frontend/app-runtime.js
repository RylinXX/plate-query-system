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
        return `<span style="font-family: var(--font-outfit); font-weight: 700; color: #ffffff; background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); margin: 3px; display: inline-block; white-space: nowrap;">${safePlate}</span>`;
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
                <td style="font-weight: 600; color: #ffffff;">${escapeHtml(item.companyname || "未知企业")}</td>
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
                <td style="font-weight: 600; color: #ffffff;">${escapeHtml(item.companyName || "未知企业")}</td>
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
        downloadTablePdfBtn: $("downloadTablePdfBtn")
    };

    loadConfig();
    detectBackendStatus();
    fetchLocalData();

    dom.openConfigBtn.addEventListener("click", openDrawer);
    dom.closeConfigBtn.addEventListener("click", closeDrawer);
    dom.drawerOverlay.addEventListener("click", closeDrawer);
    dom.saveConfigBtn.addEventListener("click", saveConfig);
    dom.refreshCaptchaBtn.addEventListener("click", loadCaptcha);
    dom.autoLoginBtn.addEventListener("click", loginAndSaveToken);
    dom.syncDataBtn.addEventListener("click", syncDataFromServer);
    dom.searchBtn.addEventListener("click", performSearch);
    dom.downloadTablePdfBtn.addEventListener("click", generateTablePDF);
    dom.plateInput.addEventListener("input", event => {
        event.target.value = event.target.value.toUpperCase().replace(/\s+/g, "");
    });
    dom.plateInput.addEventListener("keydown", event => {
        if (event.key === "Enter") performSearch();
    });
    dom.captchaCodeInput.addEventListener("keydown", event => {
        if (event.key === "Enter") loginAndSaveToken();
    });
});
