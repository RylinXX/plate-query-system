import os
import sys
import json
import re
from datetime import datetime
import httpx

# 确定路径关系
APP_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(APP_DIR)
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
DATA_FILE = os.path.join(BASE_DIR, "data.json")
LOG_FILE = os.path.join(BASE_DIR, "sync.log")

# 正则表达式与嗅探关键字配置
PLATE_REGEX = re.compile(
    r"^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,6}[挂学警港澳变超]?$"
)
WORKSITE_KEYS = {"worksitename", "unitname", "enterprisename", "name", "title", "worksitename"}

def log_message(msg: str):
    time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    full_msg = f"[{time_str}] {msg}"
    print(full_msg)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as lf:
            lf.write(full_msg + "\n")
    except Exception as e:
        print(f"写入日志文件失败: {e}", file=sys.stderr)

def _dfs_extract_plates_and_info(data, found_plates: set, info_dict: dict):
    if isinstance(data, str):
        parts = re.split(r"[,，;；\s、]+", data)
        for part in parts:
            cleaned_val = part.strip().upper()
            if PLATE_REGEX.match(cleaned_val):
                found_plates.add(cleaned_val)
    elif isinstance(data, list):
        for item in data:
            _dfs_extract_plates_and_info(item, found_plates, info_dict)
    elif isinstance(data, dict):
        for key, val in data.items():
            key_lower = key.lower()
            if isinstance(val, str) and any(wk in key_lower for wk in WORKSITE_KEYS):
                val_stripped = val.strip()
                if val_stripped and len(val_stripped) > 2 and not PLATE_REGEX.match(val_stripped):
                    if "worksite" in key_lower or "enterprise" in key_lower:
                        info_dict["worksite_name"] = val_stripped
                    elif "worksite_name" not in info_dict:
                        info_dict["worksite_name"] = val_stripped
            _dfs_extract_plates_and_info(val, found_plates, info_dict)

def run_sync():
    log_message("=== 启动定时数据同步 ===")
    
    # 1. 读取配置文件 config.json
    if not os.path.exists(CONFIG_FILE):
        log_message(f"错误: 配置文件不存在 {CONFIG_FILE}，同步终止。请先在系统网页上手动配置并同步一次。")
        return False
        
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            config = json.load(f)
    except Exception as e:
        log_message(f"错误: 读取配置文件 config.json 失败: {e}")
        return False
        
    authtoken = config.get("authtoken", "").strip()
    worksite_id = config.get("id", "225642").strip()
    worksitetype = config.get("worksitetype", "1").strip()
    
    if not authtoken:
        log_message("错误: 配置文件中 authtoken 为空，同步终止。")
        return False
        
    # 2. 构造请求参数
    target_url = f"http://ztxn.capcloud.com.cn:8080/dregs_service-dev/putOnRecords/unijz-unit-worksite/getWorksiteById?id={worksite_id}&worksitetype={worksitetype}"
    headers = {
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "authtoken": authtoken,
        "Content-Length": "0",
        "Host": "ztxn.capcloud.com.cn:8080",
        "Origin": "http://ztxn.capcloud.com.cn:8080",
        "Referer": "http://ztxn.capcloud.com.cn:8080/dist/index.html",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    }
    
    # 3. 发送网络请求
    log_message(f"正在请求数据接口: worksite_id={worksite_id}, worksitetype={worksitetype}...")
    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(target_url, headers=headers)
            
            if response.status_code != 200:
                log_message(f"错误: 接口返回 HTTP 状态码 {response.status_code}")
                return False
                
            try:
                response_data = response.json()
            except Exception:
                log_message("错误: 目标接口返回的数据不是合法的 JSON 格式。")
                return False
    except Exception as e:
        log_message(f"错误: 请求接口失败: {e}")
        return False
        
    # 4. 解析业务状态
    if isinstance(response_data, dict):
        biz_success = response_data.get("success")
        biz_code = response_data.get("code")
        biz_msg = response_data.get("message") or response_data.get("msg") or "未知业务错误"
        
        if biz_success is False or (biz_code is not None and str(biz_code) not in ("2000", "200", "0")):
            if "token" in biz_msg.lower() or biz_code == 6000:
                log_message("错误: 接口授权密钥 (authtoken) 已过期或失效！请前往系统网页贴入有效 Token。")
            else:
                log_message(f"错误: 业务操作返回失败, 错误信息: {biz_msg}")
            return False
            
    # 5. 数据清洗提取
    try:
        found_plates = set()
        info_dict = {}
        _dfs_extract_plates_and_info(response_data, found_plates, info_dict)
        
        plates_list = sorted(list(found_plates))
        
        result_obj = response_data.get("result") or response_data.get("data") or {}
        transports = result_obj.get("transports") or []
        temp_transports = result_obj.get("temporaryTransportChangeDTOS") or []
        worksite_name = result_obj.get("worksite", {}).get("name") or info_dict.get("worksite_name") or "未定名工地"
        
        # 6. 保存到本地数据文件
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        data_to_save = {
            "worksite_name": worksite_name,
            "last_updated": now_str,
            "total_vehicles": len(plates_list),
            "vehicles": plates_list,
            "transports": transports,
            "temporary_transports": temp_transports
        }
        
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data_to_save, f, ensure_ascii=False, indent=2)
            
        log_message(f"成功: 数据已成功写入 {DATA_FILE}")
        log_message(f"项目名称: {worksite_name}")
        log_message(f"载入情况: 正式合作企业数: {len(transports)}, 临时合作企业数: {len(temp_transports)}, 车牌数: {len(plates_list)}")
        return True
        
    except Exception as e:
        log_message(f"错误: 解析或保存数据时发生异常: {e}")
        return False

if __name__ == "__main__":
    success = run_sync()
    sys.exit(0 if success else 1)
