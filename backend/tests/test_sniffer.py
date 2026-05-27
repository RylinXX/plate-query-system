import pytest
from app.main import _dfs_extract_plates_and_info, PLATE_REGEX

def test_dfs_extract_plate_numbers_from_complex_json():
    """
    验证 DFS 车牌自动嗅探清洗算法在超深嵌套、复杂结构的 JSON 中，
    是否能够 100% 准确、无视层级地提取出所有传统与新能源车牌，并智能提取工地名称。
    """
    # 模拟一个高度嵌套的复杂官方返回 JSON
    complex_response = {
        "code": 200,
        "msg": "success",
        "data": {
            "id": 225642,
            "enterprisename": "中央广播电视总台超高清示范园工程",
            "worksitetype": "1",
            "area_code": "440305",
            "audit_log": [
                {
                    "operator": "系统自检",
                    "comment": "已录入特种保障车：京A88888，请准予放行。"
                },
                {
                    "operator": "人工核对",
                    "comment": "暂无异常"
                }
            ],
            "vehicle_records": {
                "total": 5,
                "records": [
                    {
                        "id": 1,
                        "plateNo": "粤B12345", # 传统7位车牌
                        "vehicle_type": "自卸重卡",
                        "owner": "深建运输集团"
                    },
                    {
                        "id": 2,
                        "plate_num": "粤B12345D", # 新能源8位车牌 (D结尾)
                        "vehicle_type": "纯电渣土车",
                        "owner": "深建运输集团"
                    },
                    {
                        "id": 3,
                        "license": "沪AD12345", # 新能源8位车牌 (D在第二位)
                        "vehicle_type": "混动轻卡"
                    }
                ],
                "temporary_permit": ["闽C99999", "湘A77777"] # 数组中的裸字符串
            }
        }
    }

    found_plates = set()
    info_dict = {}
    
    # 运行数据嗅探器
    _dfs_extract_plates_and_info(complex_response, found_plates, info_dict)

    # 1. 验证车牌提取个数与去重 (应成功抓取 5 份车牌)
    assert len(found_plates) == 5
    assert "粤B12345" in found_plates
    assert "粤B12345D" in found_plates
    assert "沪AD12345" in found_plates
    assert "闽C99999" in found_plates
    assert "湘A77777" in found_plates

    # 2. 验证非正规车牌格式被安全过滤 (例如 id, area_code, phone 等纯数字不会被误判)
    assert "225642" not in found_plates
    assert "440305" not in found_plates

    # 3. 验证工地/企业名称被成功智能嗅探出来
    assert info_dict.get("worksite_name") == "中央广播电视总台超高清示范园工程"


def test_plate_regex_edge_cases():
    """
    验证车牌正则在传统车牌、新能源车牌以及带后缀挂学警等特种车牌下的高兼容匹配。
    """
    # 1. 合法车牌测试
    assert PLATE_REGEX.match("粤B88888")
    assert PLATE_REGEX.match("粤B12345D") # 新能源车牌 (D为后缀)
    assert PLATE_REGEX.match("京AD12345") # 新能源车牌
    assert PLATE_REGEX.match("京A12345学") # 学练车牌
    assert PLATE_REGEX.match("沪A8888挂") # 挂车车牌
    assert PLATE_REGEX.match("湘A6666警") # 警用车辆

    # 2. 非法车牌过滤测试
    assert not PLATE_REGEX.match("ABCDEFG") # 纯字母
    assert not PLATE_REGEX.match("1234567") # 纯数字
    assert not PLATE_REGEX.match("粤B123") # 位数不足
    assert not PLATE_REGEX.match("粤B12345678") # 位数超限
