from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import httpx
import re
import os
import json
import hashlib
from datetime import datetime

# 获取根路径与本地数据持久化路径
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.abspath(os.path.join(BASE_DIR, "data.json"))

app = FastAPI(title="Plate Query System Proxy API")

# 允许跨域 CORS，让本地 Vanilla 前端能直接请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 强制禁用浏览器静态强缓存的 HTTP 中间件，保障前端源码任何微调都能在普通刷新下瞬间无缝生效
@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# 中国车牌校验正则表达式（覆盖传统7位及新能源8位车牌，并支持挂、学、警等特种车牌）
PLATE_REGEX = re.compile(
    r"^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,6}[挂学警港澳变超]?$"
)

# 模糊提取工地名称/企业名称的字段键候选集
WORKSITE_KEYS = {"worksitename", "unitname", "enterprisename", "name", "title", "worksitename"}


class QueryRequest(BaseModel):
    authtoken: str
    id: str = "225642"
    worksitetype: str = "1"


class LoginTokenRequest(BaseModel):
    username: str
    password: str
    code: str
    uuid: str = ""


REMOTE_BASE_URL = "http://ztxn.capcloud.com.cn:8080/dregs_service-dev"
REMOTE_ORIGIN = "http://ztxn.capcloud.com.cn:8080"
REMOTE_REFERER = "http://ztxn.capcloud.com.cn:8080/dist/index.html"


def _remote_headers(authtoken: str = "") -> Dict[str, str]:
    return {
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Content-Type": "application/json",
        "Origin": REMOTE_ORIGIN,
        "Referer": REMOTE_REFERER,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "authtoken": authtoken,
    }


def _is_business_success(data: Dict[str, Any]) -> bool:
    code = data.get("code")
    success = data.get("success")
    if success is False:
        return False
    if code is None:
        return True
    return str(code) in ("2000", "200", "0")


def _business_message(data: Dict[str, Any], fallback: str) -> str:
    return str(data.get("message") or data.get("msg") or fallback)


def _remote_error_detail(data: Any, fallback: str) -> Dict[str, Any]:
    if not isinstance(data, dict):
        return {
            "message": fallback,
            "remote": data,
        }

    remote = {
        key: data.get(key)
        for key in ("code", "message", "msg", "success", "result")
        if key in data
    }
    return {
        "message": _business_message(data, fallback),
        "remote": remote or data,
    }


def _extract_token(data: Any) -> Optional[str]:
    token_keys = ("token", "authtoken", "authToken", "access_token", "accessToken")
    if isinstance(data, dict):
        for key in token_keys:
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        for value in data.values():
            found = _extract_token(value)
            if found:
                return found
    elif isinstance(data, list):
        for item in data:
            found = _extract_token(item)
            if found:
                return found
    return None


def _build_login_payload(username: str, password: str, code: str, uuid: str = "") -> Dict[str, Any]:
    password_md5 = hashlib.md5(password.encode("utf-8")).hexdigest()
    return {
        "identifierCode": "pc",
        "uuid": uuid.strip(),
        "userInfo": {
            "username": username.strip(),
            "pwd": password_md5,
        },
        "kaptcha": code.strip(),
    }


def _dfs_extract_plates_and_info(data: Any, foundPlates: set, infoDict: dict):
    """
    深度优先搜索 (DFS) 算法：递归遍历任意复杂的 JSON 结构，
    自动嗅探并提取出所有合法车牌与工地名称，免除硬编码字段映射。
    """
    if isinstance(data, str):
        # 智能切分：外部数据中，多个车牌可能是以中英文逗号、分号、顿号或空格拼装在一起的超长字符串
        # 我们使用正则切分出所有独立的车辆子项，确保无遗漏抓取
        parts = re.split(r"[,，;；\s、]+", data)
        for part in parts:
            cleanedVal = part.strip().upper()
            # 校验每一个拆分出的子项是否为合法车牌
            if PLATE_REGEX.match(cleanedVal):
                foundPlates.add(cleanedVal)
    elif isinstance(data, list):
        for item in data:
            _dfs_extract_plates_and_info(item, foundPlates, infoDict)
    elif isinstance(data, dict):
        for key, val in data.items():
            keyLower = key.lower()
            # 智能提取潜在的工地/企业名称
            if isinstance(val, str) and any(wk in keyLower for wk in WORKSITE_KEYS):
                valStripped = val.strip()
                if valStripped and len(valStripped) > 2 and not PLATE_REGEX.match(valStripped):
                    if "worksite" in keyLower or "enterprise" in keyLower:
                        infoDict["worksite_name"] = valStripped
                    elif "worksite_name" not in infoDict:
                        infoDict["worksite_name"] = valStripped
            
            _dfs_extract_plates_and_info(val, foundPlates, infoDict)


@app.get("/api/login/captcha")
async def login_captcha():
    targetUrl = f"{REMOTE_BASE_URL}/login/getCode"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(targetUrl, headers=_remote_headers())
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=504,
            detail=f"获取验证码失败，请检查网络或目标系统状态: {exc}",
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"目标系统验证码接口返回 HTTP {response.status_code}",
        )

    try:
        responseData = response.json()
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="目标系统验证码接口返回的不是合法 JSON",
        )

    if not isinstance(responseData, dict) or not _is_business_success(responseData):
        raise HTTPException(
            status_code=400,
            detail=_remote_error_detail(responseData, "验证码获取失败"),
        )

    resultObj = responseData.get("result") or {}
    img = resultObj.get("img") or responseData.get("img")
    uuid = resultObj.get("uuid") or responseData.get("uuid") or ""
    if not isinstance(img, str) or not img.strip():
        raise HTTPException(
            status_code=502,
            detail="目标系统验证码接口未返回图片数据",
        )

    img = img.strip()
    if not img.startswith("data:image/"):
        img = f"data:image/jpeg;base64,{img}"

    return {
        "success": True,
        "img": img,
        "uuid": str(uuid),
    }


@app.post("/api/login/token")
async def login_token(payload: LoginTokenRequest):
    username = payload.username.strip()
    password = payload.password
    code = payload.code.strip()
    uuid = payload.uuid.strip()
    if not username or not password or not code:
        raise HTTPException(
            status_code=400,
            detail="账号、密码和验证码不能为空",
        )

    targetUrl = f"{REMOTE_BASE_URL}/login"
    loginPayload = _build_login_payload(username, password, code, uuid)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(targetUrl, headers=_remote_headers(), json=loginPayload)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=504,
            detail=f"登录目标系统失败，请检查网络或目标系统状态: {exc}",
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"目标系统登录接口返回 HTTP {response.status_code}",
        )

    try:
        responseData = response.json()
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="目标系统登录接口返回的不是合法 JSON",
        )

    if not isinstance(responseData, dict) or not _is_business_success(responseData):
        raise HTTPException(
            status_code=400,
            detail=_remote_error_detail(responseData, "登录失败，请检查账号、密码或验证码"),
        )

    token = _extract_token(responseData)
    if not token:
        raise HTTPException(
            status_code=502,
            detail=_remote_error_detail(responseData, "登录成功但目标系统未返回 token"),
        )

    return {
        "success": True,
        "authtoken": token,
    }


@app.post("/api/sync-data")
async def sync_data(payload: QueryRequest):
    """
    一键同步路由：携带 authtoken 请求外部接口并用 DFS 数据提取车牌，
    然后写入本地 JSON 文件进行持久化存储。
    """
    targetUrl = f"http://ztxn.capcloud.com.cn:8080/dregs_service-dev/putOnRecords/unijz-unit-worksite/getWorksiteById?id={payload.id}&worksitetype={payload.worksitetype}"
    
    headers = {
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "authtoken": payload.authtoken.strip(),
        "Content-Length": "0",
        "Host": "ztxn.capcloud.com.cn:8080",
        "Origin": "http://ztxn.capcloud.com.cn:8080",
        "Referer": "http://ztxn.capcloud.com.cn:8080/dist/index.html",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(targetUrl, headers=headers)
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"目标系统返回非200状态码: {response.status_code}"
                )
                
            try:
                responseData = response.json()
                # 调试落盘：完整记录远程接口返回的真实 JSON 结构以供格式解析
                debugFile = os.path.join(BASE_DIR, "debug_response.json")
                with open(debugFile, "w", encoding="utf-8") as df:
                    json.dump(responseData, df, ensure_ascii=False, indent=2)
            except Exception:
                raise HTTPException(
                    status_code=502,
                    detail="目标系统返回的数据不是合法的 JSON 格式"
                )
                
            # 业务层防错拦截：远程官方即使业务失败（如 Token 过期）也会奇葩地返回 HTTP 200
            if isinstance(responseData, dict):
                bizSuccess = responseData.get("success")
                bizCode = responseData.get("code")
                bizMsg = responseData.get("message") or responseData.get("msg")
                
                # 如果业务显式标记 success 为 false，或者 code 不代表成功 (兼容官方系统的特有成功代码 2000)
                if bizSuccess is False or (bizCode is not None and str(bizCode) not in ("2000", "200", "0")):
                    errDetail = bizMsg or "未知业务错误"
                    # 特别捕获 Token 过期报错，给出汉化精准提示
                    if "token" in errDetail.lower() or bizCode == 6000:
                        errDetail = "当前配置的授权密钥 (authtoken) 已过期或失效，请在右上角【接口配置】中贴入最新的有效 Token！"
                    raise HTTPException(
                        status_code=400,
                        detail=f"同步失败：{errDetail}"
                    )
                
            foundPlates = set()
            infoDict = {}
            _dfs_extract_plates_and_info(responseData, foundPlates, infoDict)
            
            platesList = sorted(list(foundPlates))
            
            # 精确提取合作企业及临时合作企业数据流 (双保险提取：精确路径为主，DFS 嗅探为辅)
            resultObj = responseData.get("result") or responseData.get("data") or {}
            transports = resultObj.get("transports") or []
            tempTransports = resultObj.get("temporaryTransportChangeDTOS") or []
            worksiteName = resultObj.get("worksite", {}).get("name") or infoDict.get("worksite_name") or "未定名工地"
            
            # 写入本地数据持久化 JSON 文件
            nowStr = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            dataToSave = {
                "worksite_name": worksiteName,
                "last_updated": nowStr,
                "total_vehicles": len(platesList),
                "vehicles": platesList,
                "transports": transports,
                "temporary_transports": tempTransports
            }
            try:
                with open(DATA_FILE, "w", encoding="utf-8") as f:
                    json.dump(dataToSave, f, ensure_ascii=False, indent=2)
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"写入本地数据文件失败: {e}"
                )
            
            return {
                "success": True,
                "last_updated": nowStr,
                "worksite_name": worksiteName,
                "total_vehicles": len(platesList),
                "vehicles": platesList,
                "transports": transports,
                "temporary_transports": tempTransports
            }
            
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=504,
            detail=f"请求目标系统超时或连接失败，请确认您的网络代理或目标系统是否正常运行。异常信息: {exc}"
        )


class LocalQueryRequest(BaseModel):
    plate_no: str


@app.post("/api/local-query")
async def local_query(payload: LocalQueryRequest):
    """
    离线查询路由：日常查询完全不碰外部接口，
    直接比对本地持久化 JSON 数据，零延迟响应。
    """
    plateToFind = payload.plate_no.strip().upper()
    if not os.path.exists(DATA_FILE):
        raise HTTPException(
            status_code=400,
            detail="本地尚未同步任何备案数据，请先点击“一键同步数据”按钮！"
        )
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            localData = json.load(f)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"读取本地数据失败: {e}"
        )
    
    vehicles = localData.get("vehicles", [])
    worksiteName = localData.get("worksite_name", "未命名工地")
    lastUpdated = localData.get("last_updated", "")
    
    isMatch = any(v.upper() == plateToFind for v in vehicles)
    
    return {
        "success": True,
        "is_match": isMatch,
        "plate_no": plateToFind,
        "worksite_name": worksiteName,
        "last_updated": lastUpdated,
        "total_vehicles": len(vehicles)
    }


@app.get("/api/local-data")
async def get_local_data():
    """
    获取本地全量备案车牌列表接口，供前端渲染表格。
    """
    if not os.path.exists(DATA_FILE):
        return {
            "success": False,
            "has_data": False,
            "msg": "暂无本地已同步的备案数据"
        }
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            localData = json.load(f)
        return {
            "success": True,
            "has_data": True,
            "worksite_name": localData.get("worksite_name", "未命名工地"),
            "last_updated": localData.get("last_updated", ""),
            "total_vehicles": localData.get("total_vehicles", 0),
            "vehicles": localData.get("vehicles", []),
            "transports": localData.get("transports", []),
            "temporary_transports": localData.get("temporary_transports", [])
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"读取本地数据出错: {e}"
        )


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "plate-query-proxy"}


# Web 一站式全栈托管部署支持
import os
from fastapi.staticfiles import StaticFiles

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
