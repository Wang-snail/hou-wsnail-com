# -*- coding: utf-8 -*-
"""
更新海运报价.py  —— 不需要 Excel 宏（WPS 也能用）

用法：
  1. 本脚本、成本表、凯琦报价放在同一文件夹
  2. 凯琦文件命名为：凯琦FBA报价_当期.xlsx（也可运行时再选）
  3. 双击本脚本，或命令行：python 更新海运报价.py

提取范围：美国+加拿大，起运地仅义乌/青岛，全部快慢船/海派/专线
"""
from __future__ import annotations

import os
import re
import sys
from datetime import date
from pathlib import Path

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation
    from openpyxl.formatting.rule import FormulaRule
except ImportError:
    print("缺少 openpyxl，正在安装…")
    os.system(f'"{sys.executable}" -m pip install openpyxl -q')
    import openpyxl
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation
    from openpyxl.formatting.rule import FormulaRule

from collections import defaultdict

HERE = Path(__file__).resolve().parent
COST_NAMES = ["成本分析模板_副本2_已修改.xlsx", "成本分析模板_副本2_已修改.xlsm"]
QUOTE_NAME = "凯琦FBA报价_当期.xlsx"
US_CA = [
    "美西快线", "美西普船", "奥克兰", "休斯顿", "芝加哥", "纽约", "萨瓦纳",
    "美西海派", "加拿大", "美转加", "美转加海派", "SEND专线", "整柜直送",
]


def cell_str(v) -> str:
    if v is None:
        return ""
    return str(v).replace("\n", "\\").replace("\r", "").strip()


def origin_kind(s) -> str | None:
    s = cell_str(s).replace(" ", "")
    if "青岛" in s:
        return "青岛"
    if "义乌" in s:
        return "义乌"
    return None


def is_skip_wh(s: str) -> bool:
    if not s or s in ("FBA仓", "仓库代码", "邮编分区"):
        return True
    return any(
        s.startswith(x)
        for x in ("预配", "含税", "不含税", "拒收", "地址", "说明", "备注", "附加", "以下", "单票", "计费")
    )


def is_meta(s: str) -> bool:
    if not s:
        return True
    return any(
        k in s
        for k in ("预计", "参考", "理赔", "时效", "航期", "KG+", "CBM", "含税", "不含税", "进入报价")
    )


def expand_wh(whs: str) -> list[str]:
    if "商业地址" in whs:
        return ["商业地址"]
    if "凯琦美西仓" in whs:
        return ["凯琦美西仓"]
    if "美国" in whs or "邮编" in whs:
        return [whs]
    raw = whs.replace("，", ",").replace("、", ",").replace("；", ",").replace("/", ",")
    raw = re.sub(r"\s+", ",", raw)
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    codes = [p for p in parts if re.search(r"[A-Za-z0-9]", p)]
    return codes if codes else [whs]


def find_channel(ws, col: int) -> str:
    for r in (3, 1, 4):
        v = cell_str(ws.cell(r, col).value)
        if v and not origin_kind(v) and not is_meta(v):
            return v
    for c in range(col, 0, -1):
        v = cell_str(ws.cell(1, c).value)
        if v and not origin_kind(v) and not is_meta(v) and "进入" not in v:
            return v
    return f"列{col}"


def collect_origin_cols(ws):
    seen, ocols = set(), []
    for r in range(1, 6):
        for c in range(1, ws.max_column + 1):
            o = origin_kind(ws.cell(r, c).value)
            if o and c not in seen:
                seen.add(c)
                ocols.append((c, o, r))
    return ocols


def wh_col(ws) -> int:
    best, bestn = 2, -1
    for wc in (1, 2):
        n = 0
        for r in range(5, min(ws.max_row, 100) + 1):
            s = cell_str(ws.cell(r, wc).value)
            if s and re.search(r"[A-Z]{2,}", s):
                n += 1
        if n > bestn:
            best, bestn = wc, n
    return best


def emit(rows, sheet, region, channel, origin, wh, price, carpet=0.0):
    for code in expand_wh(wh):
        rows.append(
            {
                "sheet": sheet,
                "region": region,
                "channel": channel,
                "origin": origin,
                "warehouse": code,
                "price": float(price),
                "carpet": carpet,
                "unit": "RMB/KG",
            }
        )


def extract_canada(ws, rows):
    blocks = [
        ("加拿大-多伦多", 3, 6, 10),
        ("加拿大-温哥华", 13, 15, 16),
        ("加拿大-卡尔加里", 18, 20, 21),
        ("加拿大-温尼伯", 23, 25, 25),
    ]
    yiwu_col = 3
    for region, ch_row, rf, rt in blocks:
        ch = cell_str(ws.cell(ch_row, yiwu_col).value)
        if not ch:
            continue
        for r in range(rf, rt + 1):
            wh = cell_str(ws.cell(r, 1).value)
            if not wh or is_skip_wh(wh):
                continue
            price = ws.cell(r, yiwu_col).value
            if isinstance(price, (int, float)):
                emit(rows, "加拿大", region, ch, "义乌", wh, price, carpet=1.0)


def extract_mzj(ws, rows, hai=False):
    if hai:
        starts = {2: "X1-多伦多海派", 5: "X3-海派", 8: "X7-海派"}
        r0, name = 4, "美转加海派"
    else:
        starts = {2: "X3-专线", 6: "X5-专线", 10: "X7-专线"}
        r0, name = 5, "美转加"
    for c, o, _ in collect_origin_cols(ws):
        cand = [s for s in starts if s <= c]
        if not cand:
            continue
        ch = starts[max(cand)]
        if o == "义乌":
            ch = "Y-" + ch.replace("Y-", "")
        for r in range(r0, ws.max_row + 1):
            wh = cell_str(ws.cell(r, 1).value)
            if not wh:
                continue
            if is_skip_wh(wh):
                if len(wh) > 60:
                    break
                continue
            if wh.endswith("FBA仓"):
                continue
            price = ws.cell(r, c).value
            if isinstance(price, (int, float)):
                emit(rows, name, name, ch, o, wh, price)


def extract_generic(ws, sheet, rows):
    ocols = collect_origin_cols(ws)
    if not ocols:
        return
    wc = wh_col(ws)
    for c, o, _orow in ocols:
        if sheet == "美西海派":
            ch = ""
            for cc in range(c, 0, -1):
                v = cell_str(ws.cell(1, cc).value)
                if "海派" in v:
                    ch = v if o != "义乌" else ("Y-" + v if not v.startswith("Y-") else v)
                    break
            if not ch:
                ch = find_channel(ws, c)
        else:
            ch = find_channel(ws, c)
        for r in range(5, ws.max_row + 1):
            wh = cell_str(ws.cell(r, wc).value)
            if not wh:
                continue
            if is_skip_wh(wh):
                if len(wh) > 60:
                    break
                continue
            if any(k in wh for k in ("附加费", "拒收", "含税渠道", "低消")):
                break
            price = ws.cell(r, c).value
            if isinstance(price, (int, float)):
                emit(rows, sheet, sheet, ch, o, wh, price)


def extract_all(quote_path: Path):
    wb = openpyxl.load_workbook(quote_path, data_only=True)
    rows = []
    for name in US_CA:
        if name not in wb.sheetnames:
            continue
        ws = wb[name]
        if name == "加拿大":
            extract_canada(ws, rows)
        elif name == "美转加":
            extract_mzj(ws, rows, hai=False)
        elif name == "美转加海派":
            extract_mzj(ws, rows, hai=True)
        else:
            extract_generic(ws, name, rows)
    return [r for r in rows if r["origin"] in ("义乌", "青岛")]


MAX_CH_HELPERS = 15  # 每行最多列出的可选渠道数（隐藏辅助列）
CHANNEL_SENTINEL = "（最低价）"  # 下拉默认项：按该仓最低价



def build_dropdown_sheet(wb, rows):
    """起运地/FBA仓列表 + 每仓最低价表 + 渠道下拉（首项=最低价）。"""
    name = "海运下拉"
    if name in wb.sheetnames:
        del wb[name]
    idx = wb.sheetnames.index("海运报价") + 1 if "海运报价" in wb.sheetnames else 1
    ws = wb.create_sheet(name, idx)

    by_o_wh = defaultdict(set)
    by_o_ch = defaultdict(set)
    best = {}
    for r in rows:
        by_o_wh[r["origin"]].add(r["warehouse"])
        by_o_ch[r["origin"]].add(r["channel"])
        key = (r["origin"], r["warehouse"])
        carpet = float(r.get("carpet") or 0)
        cur = best.get(key)
        if cur is None or r["price"] < cur[0] or (r["price"] == cur[0] and r["channel"] < cur[1]):
            best[key] = (float(r["price"]), r["channel"], carpet)

    ws["A1"] = "起运地"
    ws["A1"].font = Font(bold=True)
    ws["A2"] = "义乌"
    ws["A3"] = "青岛"
    ws["B1"] = "义乌FBA仓"
    ws["C1"] = "青岛FBA仓"
    ws["B1"].font = Font(bold=True)
    ws["C1"].font = Font(bold=True)
    y_wh = sorted(by_o_wh.get("义乌", []))
    q_wh = sorted(by_o_wh.get("青岛", []))
    for i, w in enumerate(y_wh, 2):
        ws.cell(i, 2, w)
    for i, w in enumerate(q_wh, 2):
        ws.cell(i, 3, w)

    ws["F1"] = "起运地"
    ws["G1"] = "FBA仓"
    ws["H1"] = "该仓最低单价"
    ws["I1"] = "最低价渠道"
    ws["J1"] = "地毯附加"
    for i, ((o, w), (p, ch, carpet)) in enumerate(sorted(best.items(), key=lambda x: (x[0][0], x[0][1])), 2):
        ws.cell(i, 6, o)
        ws.cell(i, 7, w)
        ws.cell(i, 8, p)
        ws.cell(i, 9, ch)
        ws.cell(i, 10, carpet)

    # L/M：渠道下拉（第2行哨兵=最低价）
    y_ch = sorted(by_o_ch.get("义乌", []))
    q_ch = sorted(by_o_ch.get("青岛", []))
    ws["L1"] = "义乌可选渠道"
    ws["M1"] = "青岛可选渠道"
    ws["L2"] = CHANNEL_SENTINEL
    ws["M2"] = CHANNEL_SENTINEL
    for i, ch in enumerate(y_ch, 3):
        ws.cell(i, 12, ch)
    for i, ch in enumerate(q_ch, 3):
        ws.cell(i, 13, ch)

    ws["D1"] = f"渠道默认「{CHANNEL_SENTINEL}」→最低价；选具体渠道→按所选计价"
    ws["D1"].font = Font(color="C00000")
    return {
        "yiwu_wh_n": len(y_wh),
        "qd_wh_n": len(q_wh),
        "min_last": 1 + len(best),
        "yiwu_ch_end": 2 + len(y_ch),
        "qd_ch_end": 2 + len(q_ch),
    }


def apply_cascade_validations(wb, meta):
    """采购表头顺序：起运地|FBA仓|运输方式|海运渠道；仓用IF列表，渠道用行内辅助列。"""
    if "采购成本对比" not in wb.sheetnames:
        return
    ws = wb["采购成本对比"]
    ws.data_validations.dataValidation = []

    ws["BE1"] = f"头程关联（渠道可选：默认「{CHANNEL_SENTINEL}」；选具体渠道则按所选 / 陆运手填BL）"
    ws["BE2"] = "起运地"
    ws["BF2"] = "FBA仓"
    ws["BG2"] = "运输方式"
    ws["BH2"] = "海运渠道(可选)"
    ws["BI2"] = "海运单价(RMB/KG)"
    ws["BJ2"] = "计费重(kg)"
    ws["BK2"] = "海运运费(RMB)"
    ws["BL2"] = "陆运运费(RMB)"
    ws["BM2"] = "选价提示"
    ws["BM2"].font = Font(bold=True, color="C00000")

    dv_size = DataValidation(type="list", formula1="箱规!$A$2:$A$23", allow_blank=True)
    dv_size.add("C4:C50")
    ws.add_data_validation(dv_size)

    dv_origin = DataValidation(type="list", formula1="海运下拉!$A$2:$A$3", allow_blank=True)
    dv_origin.prompt = "①先选起运地"
    dv_origin.promptTitle = "起运地"
    dv_origin.add("BE4:BE50")
    ws.add_data_validation(dv_origin)

    y_end = max(meta["yiwu_wh_n"] + 1, 2)
    q_end = max(meta["qd_wh_n"] + 1, 2)
    wh_f = f'IF(BE4="青岛",海运下拉!$C$2:$C${q_end},海运下拉!$B$2:$B${y_end})'
    dv_wh = DataValidation(type="list", formula1=wh_f, allow_blank=True)
    dv_wh.prompt = "②再选FBA仓（仅该起运地有报价）"
    dv_wh.promptTitle = "FBA仓"
    dv_wh.add("BF4:BF50")
    ws.add_data_validation(dv_wh)

    dv_mode = DataValidation(type="list", formula1='"海运,陆运,海运+陆运"', allow_blank=True)
    dv_mode.add("BG4:BG50")
    ws.add_data_validation(dv_mode)

    y_ch_end = max(int(meta.get("yiwu_ch_end") or 3), 3)
    q_ch_end = max(int(meta.get("qd_ch_end") or 3), 3)
    ch_f = f'IF(BE4="青岛",海运下拉!$M$2:$M${q_ch_end},海运下拉!$L$2:$L${y_ch_end})'
    dv_ch = DataValidation(type="list", formula1=ch_f, allow_blank=True)
    dv_ch.prompt = f"默认「{CHANNEL_SENTINEL}」；或选具体渠道"
    dv_ch.promptTitle = "海运渠道(可选)"
    dv_ch.add("BH4:BH50")
    ws.add_data_validation(dv_ch)

    min_last = max(int(meta.get("min_last") or 2), 2)
    sent = CHANNEL_SENTINEL
    bh_filled = f'AND(BH{{r}}<>"",BH{{r}}<>"{sent}")'
    # 默认最低价 / 选了具体渠道则精确匹配
    bi_f = (
        '=IF(OR(BE{r}="",BF{r}=""),"",'
        f'IF({bh_filled},'
        'IFERROR(IF(SUMIFS(海运报价!$F$2:$F$2000,海运报价!$C$2:$C$2000,BH{r},'
        '海运报价!$D$2:$D$2000,BE{r},海运报价!$E$2:$E$2000,BF{r})=0,"",'
        'SUMIFS(海运报价!$F$2:$F$2000,海运报价!$C$2:$C$2000,BH{r},'
        '海运报价!$D$2:$D$2000,BE{r},海运报价!$E$2:$E$2000,BF{r})),""),'
        f'IFERROR(IF(SUMIFS(海运下拉!$H$2:$H${min_last},海运下拉!$F$2:$F${min_last},BE{{r}},'
        f'海运下拉!$G$2:$G${min_last},BF{{r}})=0,"",'
        f'SUMIFS(海运下拉!$H$2:$H${min_last},海运下拉!$F$2:$F${min_last},BE{{r}},'
        f'海运下拉!$G$2:$G${min_last},BF{{r}})),"")))'
    )
    tip_f = (
        '=IF(OR(BE{r}="",BF{r}=""),"请选起运地+FBA仓",'
        f'IF(AND({bh_filled},BI{{r}}=""),"⚠该渠道不服务此仓：请重选或改回「{sent}」",'
        'IF(BI{r}="","无报价：请换起运地/仓库",'
        f'IF({bh_filled},"按你选的渠道「"&BH{{r}}&"」计价",'
        f'"按最低价「"&IFERROR(SUMIFS(海运下拉!$I$2:$I${min_last},海运下拉!$F$2:$F${min_last},BE{{r}},'
        f'海运下拉!$G$2:$G${min_last},BF{{r}}),"")&"」（默认）"))))'
    )
    bk_f = (
        '=IF(OR(BI{r}="",BJ{r}=""),"",'
        'BJ{r}*(BI{r}+'
        f'IF({bh_filled},'
        'IFERROR(AVERAGEIFS(海运报价!$H$2:$H$2000,海运报价!$C$2:$C$2000,BH{r},'
        '海运报价!$D$2:$D$2000,BE{r},海运报价!$E$2:$E$2000,BF{r}),0),'
        f'IFERROR(SUMIFS(海运下拉!$J$2:$J${min_last},海运下拉!$F$2:$F${min_last},BE{{r}},'
        f'海运下拉!$G$2:$G${min_last},BF{{r}}),0))))'
    )
    # 单箱计费重=箱规一箱毛重；头程/件=单箱运费÷装数；FBA用单件净重(主表N列)
    bj_f = '=IF(C{r}="","",VLOOKUP($C{r},箱规!$A$2:$S$23,18,FALSE))'
    aa_f = (
        '=IF(OR(D{r}="",D{r}=0),"",'
        'IF(BG{r}="陆运",IF(BL{r}="",0,BL{r})/D{r},'
        'IF(BG{r}="海运",IF(BK{r}="",0,BK{r})/D{r},'
        'IF(BG{r}="海运+陆运",(IF(BK{r}="",0,BK{r})+IF(BL{r}="",0,BL{r}))/D{r},'
        'IF(BK{r}="",0,BK{r})/D{r}))))'
    )

    for r in range(4, 21):
        ws.cell(r, 27, aa_f.format(r=r))
        ws.cell(r, 61, bi_f.format(r=r))
        ws.cell(r, 62, bj_f.format(r=r))
        ws.cell(r, 63, bk_f.format(r=r))
        ws.cell(r, 65, tip_f.format(r=r))
        # 渠道默认「（最低价）」
        if ws.cell(r, 60).value in (None, ""):
            ws.cell(r, 60, CHANNEL_SENTINEL)
        for k in range(1, MAX_CH_HELPERS + 1):
            col = 66 + k
            ws.cell(
                r,
                col,
                (
                    f'=IF(OR($BE{r}="",$BF{r}=""),"",'
                    f"IFERROR(INDEX(海运报价!$C$2:$C$2000,"
                    f"AGGREGATE(15,6,(ROW(海运报价!$C$2:$C$2000)-ROW(海运报价!$C$2)+1)/"
                    f"((海运报价!$D$2:$D$2000=$BE{r})*(海运报价!$E$2:$E$2000=$BF{r})),{k})),\"\"))"
                ),
            )
            ws.column_dimensions[get_column_letter(col)].hidden = True

    try:
        red_fill = PatternFill(start_color="FCE4EC", end_color="FCE4EC", fill_type="solid")
        ws.conditional_formatting.add(
            "BI4:BI20",
            FormulaRule(formula=['AND(BE4<>"",BF4<>"",BH4<>"",BI4="")'], fill=red_fill),
        )
    except Exception:
        pass


def write_rates(cost_path: Path, rows, quote_path: Path):
    wb = openpyxl.load_workbook(cost_path)
    if "海运报价" in wb.sheetnames:
        del wb["海运报价"]
    wsh = wb.create_sheet("海运报价", 1)
    headers = [
        "线路Sheet", "区域", "渠道", "起运地", "FBA仓", "单价(RMB/KG)",
        "计费单位", "地毯附加(RMB/KG)", "生效日期", "来源文件",
    ]
    for c, h in enumerate(headers, 1):
        cell = wsh.cell(1, c, h)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", "4472C4")
    for i, r in enumerate(rows, 2):
        wsh.cell(i, 1, r["sheet"])
        wsh.cell(i, 2, r["region"])
        wsh.cell(i, 3, r["channel"])
        wsh.cell(i, 4, r["origin"])
        wsh.cell(i, 5, r["warehouse"])
        wsh.cell(i, 6, r["price"])
        wsh.cell(i, 7, r["unit"])
        wsh.cell(i, 8, r["carpet"])
        wsh.cell(i, 9, date.today().isoformat())
        wsh.cell(i, 10, quote_path.name)

    channels = sorted({r["channel"] for r in rows})
    origins = sorted({r["origin"] for r in rows})
    whs = sorted({r["warehouse"] for r in rows})
    wsh["N1"] = "渠道列表(旧/全量)"
    wsh["O1"] = "起运地列表"
    wsh["P1"] = "FBA仓列表(旧/全量勿直接用)"
    for i, v in enumerate(channels, 2):
        wsh.cell(i, 14, v)
    for i, v in enumerate(origins, 2):
        wsh.cell(i, 15, v)
    for i, v in enumerate(whs, 2):
        wsh.cell(i, 16, v)
    wsh["L1"] = (
        f"已更新 {len(rows)} 条。主表顺序：起运地→FBA仓→运输方式→海运渠道。来源：{quote_path.name}"
    )
    wsh["L1"].font = Font(bold=True, color="C00000")

    meta = build_dropdown_sheet(wb, rows)
    apply_cascade_validations(wb, meta)
    if "采购成本对比" in wb.sheetnames:
        wb["采购成本对比"]["A3"] = (
            f"头程：起运地→FBA仓→运输方式→海运渠道（{len(rows)}条有价）。"
            "每月运行 更新海运报价.py。陆运填BL。"
        )
    wb.save(cost_path)


def pick_file(title, patterns):
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        path = filedialog.askopenfilename(title=title, filetypes=patterns)
        root.destroy()
        return Path(path) if path else None
    except Exception:
        return None


def main():
    cost = next((HERE / n for n in COST_NAMES if (HERE / n).exists()), None)
    if not cost:
        cost = pick_file("选择成本分析表", [("Excel", "*.xlsx *.xlsm")])
        if not cost:
            print("未找到成本表")
            input("按回车退出")
            return

    quote = HERE / QUOTE_NAME
    if not quote.exists():
        cands = [
            p
            for p in list(HERE.glob("*凯琦*.xlsx")) + list(HERE.glob("*FBA*.xlsx"))
            if p.resolve() != cost.resolve()
        ]
        if len(cands) == 1:
            quote = cands[0]
        else:
            quote = pick_file("选择本月凯琦报价表", [("Excel", "*.xlsx")])
            if not quote:
                print("未选择报价表")
                input("按回车退出")
                return

    print(f"成本表: {cost.name}")
    print(f"报价表: {quote.name}")
    print("正在提取…")
    rows = extract_all(quote)
    print(
        f"提取 {len(rows)} 条（义乌 {sum(1 for r in rows if r['origin']=='义乌')} / "
        f"青岛 {sum(1 for r in rows if r['origin']=='青岛')}）"
    )
    write_rates(cost, rows, quote)
    print("完成！已写入「海运报价」。请重新打开成本表查看。")
    input("按回车退出")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("失败:", e)
        import traceback

        traceback.print_exc()
        input("按回车退出")
