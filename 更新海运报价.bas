Attribute VB_Name = "UpdateOceanFreight"
Option Explicit

'============================================================
' RefreshOceanFreight
' 从凯琦月更报价中提取：
'   - 目的地：美国 + 加拿大（含美转加）
'   - 起运地：仅「义乌」「青岛」（义乌\宁波\苏州 归为义乌）
'   - 渠道：各 Sheet 下全部快/慢/海派/专线（只取义乌/青岛对应列）
' 写入本工作簿「海运报价」表；主表 SUMIFS 公式不用改
'
' 每月：把新文件放到同目录并命名 凯琦FBA报价_当期.xlsx
'       然后 Alt+F8 → RefreshOceanFreight
'============================================================

Public Const DEFAULT_QUOTE_NAME As String = "凯琦FBA报价_当期.xlsx"
Public Const DEST_SHEET As String = "海运报价"

Public Sub RefreshOceanFreight()
    Dim quotePath As String, thisPath As String
    Dim wbQuote As Workbook
    Dim wsDest As Worksheet
    Dim n As Long

    thisPath = ThisWorkbook.Path
    If Len(thisPath) = 0 Then
        MsgBox "请先把成本表保存到本地文件夹，再运行宏。", vbExclamation
        Exit Sub
    End If

    quotePath = thisPath & Application.PathSeparator & DEFAULT_QUOTE_NAME
    If Dir(quotePath) = "" Then
        quotePath = Application.GetOpenFilename( _
            FileFilter:="Excel (*.xlsx;*.xlsm;*.xls),*.xlsx;*.xlsm;*.xls", _
            Title:="选择本月凯琦 FBA 报价表")
        If quotePath = "False" Or Len(quotePath) = 0 Then Exit Sub
    End If

    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    On Error GoTo Fail

    Set wbQuote = Workbooks.Open(Filename:=quotePath, ReadOnly:=True)
    Set wsDest = GetOrCreateSheet(ThisWorkbook, DEST_SHEET)
    wsDest.Cells.Clear
    WriteHeader wsDest
    n = 2

    n = n + ImportGeneric(wbQuote, "美西快线", wsDest, n, quotePath)
    n = n + ImportGeneric(wbQuote, "美西普船", wsDest, n, quotePath)
    n = n + ImportGeneric(wbQuote, "奥克兰", wsDest, n, quotePath)
    n = n + ImportGeneric(wbQuote, "休斯顿", wsDest, n, quotePath)
    n = n + ImportGeneric(wbQuote, "芝加哥", wsDest, n, quotePath)
    n = n + ImportGeneric(wbQuote, "纽约", wsDest, n, quotePath)
    n = n + ImportGeneric(wbQuote, "萨瓦纳", wsDest, n, quotePath)
    n = n + ImportHaiPai(wbQuote, "美西海派", wsDest, n, quotePath)
    n = n + ImportCanada(wbQuote, wsDest, n, quotePath)
    n = n + ImportMeiZhuanJia(wbQuote, wsDest, n, quotePath)
    n = n + ImportMeiZhuanJiaHaiPai(wbQuote, wsDest, n, quotePath)
    n = n + ImportGeneric(wbQuote, "SEND专线", wsDest, n, quotePath)
    n = n + ImportGeneric(wbQuote, "整柜直送", wsDest, n, quotePath)

    BuildLists wsDest
    BuildCascadeDropdown wsDest
    wbQuote.Close SaveChanges:=False

    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    MsgBox "海运报价已更新！" & vbCrLf & _
           "共写入 " & (n - 2) & " 条（仅义乌/青岛 × 美国加拿大各船）" & vbCrLf & _
           "请按 起运地→渠道→FBA仓 联动选择（见「海运下拉」）" & vbCrLf & _
           quotePath, vbInformation
    Exit Sub

Fail:
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
    On Error Resume Next
    If Not wbQuote Is Nothing Then wbQuote.Close SaveChanges:=False
    MsgBox "更新失败: " & Err.Description, vbCritical
End Sub

'-------------------- helpers --------------------
Private Function GetOrCreateSheet(wb As Workbook, name As String) As Worksheet
    On Error Resume Next
    Set GetOrCreateSheet = wb.Worksheets(name)
    On Error GoTo 0
    If GetOrCreateSheet Is Nothing Then
        Set GetOrCreateSheet = wb.Worksheets.Add(After:=wb.Worksheets(1))
        GetOrCreateSheet.Name = name
    End If
End Function

Private Sub WriteHeader(ws As Worksheet)
    Dim h As Variant, i As Long
    h = Array("线路Sheet", "区域", "渠道", "起运地", "FBA仓", _
              "单价(RMB/KG)", "计费单位", "地毯附加(RMB/KG)", "生效日期", "来源文件")
    For i = 0 To UBound(h)
        ws.Cells(1, i + 1).Value = h(i)
        ws.Cells(1, i + 1).Font.Bold = True
    Next i
End Sub

Private Function OriginKind(v As Variant) As String
    Dim s As String
    s = Replace(Replace(CStr(v), vbLf, "\"), " ", "")
    If InStr(s, "青岛") > 0 Then
        OriginKind = "青岛"
    ElseIf InStr(s, "义乌") > 0 Then
        OriginKind = "义乌"
    Else
        OriginKind = ""
    End If
End Function

Private Function IsMeta(s As String) As Boolean
    IsMeta = (Len(s) = 0) Or (InStr(s, "预计") > 0) Or (InStr(s, "参考") > 0) Or _
             (InStr(s, "理赔") > 0) Or (InStr(s, "时效") > 0) Or (InStr(s, "航期") > 0) Or _
             (InStr(s, "KG+") > 0) Or (InStr(s, "CBM") > 0) Or (s = "含税") Or (s = "不含税") Or _
             (InStr(s, "进入报价") > 0)
End Function

Private Function IsSkipWh(s As String) As Boolean
    If Len(s) = 0 Then IsSkipWh = True: Exit Function
    If s = "FBA仓" Or s = "仓库代码" Or s = "邮编分区" Then IsSkipWh = True: Exit Function
    IsSkipWh = (Left$(s, 2) = "预配") Or (Left$(s, 2) = "含税") Or (Left$(s, 2) = "拒收") Or _
               (Left$(s, 2) = "地址") Or (Left$(s, 2) = "说明") Or (Left$(s, 2) = "备注") Or _
               (Left$(s, 2) = "附加") Or (Left$(s, 2) = "以下") Or (InStr(s, "FBA仓") = 1 And Len(s) < 10)
End Function

Private Function FindChannel(ws As Worksheet, col As Long) As String
    Dim r As Long, v As String, c As Long
    For r = 3 To 1 Step -2
        v = Trim$(CStr(ws.Cells(r, col).Value & ""))
        If Not IsMeta(v) And OriginKind(v) = "" Then FindChannel = v: Exit Function
    Next r
    For c = col To 1 Step -1
        v = Trim$(CStr(ws.Cells(1, c).Value & ""))
        If Not IsMeta(v) And OriginKind(v) = "" And InStr(v, "进入") = 0 Then
            FindChannel = v: Exit Function
        End If
    Next c
    FindChannel = "列" & Split(ws.Cells(1, col).Address, "$")(1)
End Function

Private Sub WriteRow(ws As Worksheet, ByRef outRow As Long, sheetName As String, _
    region As String, channel As String, origin As String, wh As String, _
    price As Double, carpet As Double, src As String)
    ws.Cells(outRow, 1).Value = sheetName
    ws.Cells(outRow, 2).Value = region
    ws.Cells(outRow, 3).Value = channel
    ws.Cells(outRow, 4).Value = origin
    ws.Cells(outRow, 5).Value = wh
    ws.Cells(outRow, 6).Value = price
    ws.Cells(outRow, 7).Value = "RMB/KG"
    ws.Cells(outRow, 8).Value = carpet
    ws.Cells(outRow, 9).Value = Date
    ws.Cells(outRow, 10).Value = src
    outRow = outRow + 1
End Sub

Private Sub EmitWhPrices(wsSrc As Worksheet, wsDest As Worksheet, ByRef outRow As Long, _
    sheetName As String, region As String, channel As String, origin As String, _
    priceCol As Long, whCol As Long, rFrom As Long, carpet As Double, src As String)
    Dim r As Long, wh As String, price As Variant, parts() As String, i As Long, code As String
    For r = rFrom To wsSrc.UsedRange.Rows.Count + 4
        wh = Trim$(CStr(wsSrc.Cells(r, whCol).Value & ""))
        If Len(wh) = 0 Then GoTo Cont
        If Len(wh) > 80 Then Exit For
        If IsSkipWh(wh) Then GoTo Cont
        If InStr(wh, "附加费") > 0 Or InStr(wh, "拒收") > 0 Or InStr(wh, "含税渠道") > 0 Then Exit For
        price = wsSrc.Cells(r, priceCol).Value
        If Not IsNumeric(price) Then GoTo Cont
        If wh = "商业地址" Or InStr(wh, "凯琦美西仓") > 0 Or InStr(wh, "美国") > 0 Then
            WriteRow wsDest, outRow, sheetName, region, channel, origin, wh, CDbl(price), carpet, src
        Else
            wh = Replace(Replace(Replace(Replace(wh, "，", ","), "、", ","), "；", ","), "/", ",")
            wh = Replace(wh, " ", ",")
            parts = Split(wh, ",")
            For i = LBound(parts) To UBound(parts)
                code = Trim$(parts(i))
                If Len(code) > 0 Then
                    WriteRow wsDest, outRow, sheetName, region, channel, origin, code, CDbl(price), carpet, src
                End If
            Next i
        End If
Cont:
    Next r
End Sub

Private Function WhCol(ws As Worksheet) As Long
    Dim c As Long, r As Long, n As Long, best As Long, bestN As Long
    best = 2: bestN = -1
    For c = 1 To 2
        n = 0
        For r = 5 To 80
            If InStr(CStr(ws.Cells(r, c).Value & ""), "ONT") > 0 Or _
               InStr(CStr(ws.Cells(r, c).Value & ""), "YYZ") > 0 Or _
               InStr(CStr(ws.Cells(r, c).Value & ""), "LAX") > 0 Or _
               InStr(CStr(ws.Cells(r, c).Value & ""), "凯琦") > 0 Then n = n + 1
        Next r
        If n > bestN Then bestN = n: best = c
    Next c
    WhCol = best
End Function

Private Sub CollectOriginCols(ws As Worksheet, ByRef cols() As Long, ByRef origins() As String, ByRef nCol As Long)
    Dim r As Long, c As Long, o As String, i As Long, exists As Boolean
    nCol = 0
    ReDim cols(1 To 40)
    ReDim origins(1 To 40)
    For r = 1 To 5
        For c = 1 To ws.UsedRange.Columns.Count
            o = OriginKind(ws.Cells(r, c).Value)
            If o <> "" Then
                exists = False
                For i = 1 To nCol
                    If cols(i) = c Then exists = True: Exit For
                Next i
                If Not exists Then
                    nCol = nCol + 1
                    cols(nCol) = c
                    origins(nCol) = o
                End If
            End If
        Next c
    Next r
End Sub

'-------------------- sheet importers --------------------
Private Function ImportGeneric(wb As Workbook, sheetName As String, wsDest As Worksheet, _
                               startRow As Long, src As String) As Long
    Dim ws As Worksheet, outRow As Long, cols() As Long, origins() As String, nCol As Long
    Dim i As Long, ch As String, wc As Long
    On Error Resume Next
    Set ws = wb.Worksheets(sheetName)
    On Error GoTo 0
    If ws Is Nothing Then ImportGeneric = 0: Exit Function

    outRow = startRow
    CollectOriginCols ws, cols, origins, nCol
    wc = WhCol(ws)
    For i = 1 To nCol
        ch = FindChannel(ws, cols(i))
        EmitWhPrices ws, wsDest, outRow, sheetName, sheetName, ch, origins(i), cols(i), wc, 5, 0#, src
    Next i
    ImportGeneric = outRow - startRow
End Function

Private Function ImportHaiPai(wb As Workbook, sheetName As String, wsDest As Worksheet, _
                              startRow As Long, src As String) As Long
    Dim ws As Worksheet, outRow As Long, cols() As Long, origins() As String, nCol As Long
    Dim i As Long, c As Long, ch As String, v As String
    On Error Resume Next
    Set ws = wb.Worksheets(sheetName)
    On Error GoTo 0
    If ws Is Nothing Then ImportHaiPai = 0: Exit Function

    outRow = startRow
    CollectOriginCols ws, cols, origins, nCol
    For i = 1 To nCol
        ch = ""
        For c = cols(i) To 1 Step -1
            v = Trim$(CStr(ws.Cells(1, c).Value & ""))
            If InStr(v, "海派") > 0 Then
                ch = v
                If origins(i) = "义乌" And Left$(ch, 2) <> "Y-" Then ch = "Y-" & ch
                Exit For
            End If
        Next c
        If ch = "" Then ch = FindChannel(ws, cols(i))
        EmitWhPrices ws, wsDest, outRow, sheetName, sheetName, ch, origins(i), cols(i), 2, 4, 0#, src
    Next i
    ImportHaiPai = outRow - startRow
End Function

Private Function ImportCanada(wb As Workbook, wsDest As Worksheet, startRow As Long, src As String) As Long
    Dim ws As Worksheet, outRow As Long
    Dim blocks As Variant, b As Long
    Dim chRow As Long, rf As Long, rt As Long, region As String, ch As String
    Dim yiwuCol As Long, r As Long, wh As String, price As Variant

    On Error Resume Next
    Set ws = wb.Worksheets("加拿大")
    On Error GoTo 0
    If ws Is Nothing Then ImportCanada = 0: Exit Function

    ' 义乌列 = C（第3列）；本表无青岛
    yiwuCol = 3
    outRow = startRow
    blocks = Array( _
        Array("加拿大-多伦多", 3, 6, 10), _
        Array("加拿大-温哥华", 13, 15, 16), _
        Array("加拿大-卡尔加里", 18, 20, 21), _
        Array("加拿大-温尼伯", 23, 25, 25))

    For b = LBound(blocks) To UBound(blocks)
        region = blocks(b)(0)
        chRow = blocks(b)(1)
        rf = blocks(b)(2)
        rt = blocks(b)(3)
        ch = Trim$(CStr(ws.Cells(chRow, yiwuCol).Value & ""))
        If ch = "" Then GoTo NextBlock
        For r = rf To rt
            wh = Trim$(CStr(ws.Cells(r, 1).Value & ""))
            If IsSkipWh(wh) Then GoTo NextR
            price = ws.Cells(r, yiwuCol).Value
            If IsNumeric(price) Then
                EmitSingleWh wsDest, outRow, "加拿大", region, ch, "义乌", wh, CDbl(price), 1#, src
            End If
NextR:
        Next r
NextBlock:
    Next b
    ImportCanada = outRow - startRow
End Function

Private Sub EmitSingleWh(wsDest As Worksheet, ByRef outRow As Long, sheetName As String, _
    region As String, channel As String, origin As String, wh As String, _
    price As Double, carpet As Double, src As String)
    Dim parts() As String, i As Long, code As String, raw As String
    If wh = "商业地址" Then
        WriteRow wsDest, outRow, sheetName, region, channel, origin, wh, price, carpet, src
        Exit Sub
    End If
    raw = Replace(Replace(Replace(wh, "，", ","), "、", ","), " ", ",")
    parts = Split(raw, ",")
    For i = LBound(parts) To UBound(parts)
        code = Trim$(parts(i))
        If Len(code) > 0 Then WriteRow wsDest, outRow, sheetName, region, channel, origin, code, price, carpet, src
    Next i
End Sub

Private Function ImportMeiZhuanJia(wb As Workbook, wsDest As Worksheet, startRow As Long, src As String) As Long
    Dim ws As Worksheet, outRow As Long, cols() As Long, origins() As String, nCol As Long
    Dim i As Long, c As Long, ch As String, startCol As Long
    Dim starts As Variant, names As Variant, s As Long

    On Error Resume Next
    Set ws = wb.Worksheets("美转加")
    On Error GoTo 0
    If ws Is Nothing Then ImportMeiZhuanJia = 0: Exit Function

    starts = Array(2, 6, 10)
    names = Array("X3-专线", "X5-专线", "X7-专线")
    outRow = startRow
    CollectOriginCols ws, cols, origins, nCol
    For i = 1 To nCol
        startCol = 2
        For s = LBound(starts) To UBound(starts)
            If starts(s) <= cols(i) Then startCol = starts(s): ch = names(s)
        Next s
        If origins(i) = "义乌" Then ch = "Y-" & Replace(ch, "Y-", "")
        EmitWhPrices ws, wsDest, outRow, "美转加", "美转加", ch, origins(i), cols(i), 1, 5, 0#, src
    Next i
    ImportMeiZhuanJia = outRow - startRow
End Function

Private Function ImportMeiZhuanJiaHaiPai(wb As Workbook, wsDest As Worksheet, startRow As Long, src As String) As Long
    Dim ws As Worksheet, outRow As Long, cols() As Long, origins() As String, nCol As Long
    Dim i As Long, ch As String, s As Long
    Dim starts As Variant, names As Variant

    On Error Resume Next
    Set ws = wb.Worksheets("美转加海派")
    On Error GoTo 0
    If ws Is Nothing Then ImportMeiZhuanJiaHaiPai = 0: Exit Function

    starts = Array(2, 5, 8)
    names = Array("X1-多伦多海派", "X3-海派", "X7-海派")
    outRow = startRow
    CollectOriginCols ws, cols, origins, nCol
    For i = 1 To nCol
        For s = LBound(starts) To UBound(starts)
            If starts(s) <= cols(i) Then ch = names(s)
        Next s
        If origins(i) = "义乌" Then ch = "Y-" & Replace(ch, "Y-", "")
        EmitWhPrices ws, wsDest, outRow, "美转加海派", "美转加海派", ch, origins(i), cols(i), 1, 4, 0#, src
    Next i
    ImportMeiZhuanJiaHaiPai = outRow - startRow
End Function

Private Sub BuildLists(ws As Worksheet)
    Dim last As Long, r As Long
    Dim chDict As Object, orDict As Object, whDict As Object
    Dim k As Variant, i As Long
    Set chDict = CreateObject("Scripting.Dictionary")
    Set orDict = CreateObject("Scripting.Dictionary")
    Set whDict = CreateObject("Scripting.Dictionary")
    last = ws.Cells(ws.Rows.Count, 3).End(xlUp).Row
    For r = 2 To last
        If Len(ws.Cells(r, 3).Value & "") > 0 Then chDict(CStr(ws.Cells(r, 3).Value)) = 1
        If Len(ws.Cells(r, 4).Value & "") > 0 Then orDict(CStr(ws.Cells(r, 4).Value)) = 1
        If Len(ws.Cells(r, 5).Value & "") > 0 Then whDict(CStr(ws.Cells(r, 5).Value)) = 1
    Next r
    ws.Range("N:P").Clear
    ws.Range("N1").Value = "渠道列表(旧/全量)"
    ws.Range("O1").Value = "起运地列表"
    ws.Range("P1").Value = "FBA仓列表(旧/全量勿直接用)"
    i = 2
    For Each k In chDict.Keys: ws.Cells(i, 14).Value = k: i = i + 1: Next k
    i = 2
    For Each k In orDict.Keys: ws.Cells(i, 15).Value = k: i = i + 1: Next k
    i = 2
    For Each k In whDict.Keys: ws.Cells(i, 16).Value = k: i = i + 1: Next k
    ws.Range("L1").Value = "主表按 起运地→渠道→FBA仓 联动选择（见「海运下拉」）。仅有报价的组合会出现在下拉中。"
End Sub

Private Sub BuildCascadeDropdown(wsRates As Worksheet)
    ' 重建「海运下拉」：起运地 + 义乌/青岛 FBA仓列表（不用 OFFSET，WPS 可下拉）
    Dim ws As Worksheet, wsBuy As Worksheet
    Dim last As Long, r As Long, i As Long
    Dim yWh As Object, qWh As Object
    Dim o As String, w As String, k As Variant
    Dim yN As Long, qN As Long

    On Error Resume Next
    Application.DisplayAlerts = False
    ThisWorkbook.Worksheets("海运下拉").Delete
    Application.DisplayAlerts = True
    On Error GoTo 0

    Set ws = ThisWorkbook.Worksheets.Add(After:=wsRates)
    ws.Name = "海运下拉"
    Set yWh = CreateObject("Scripting.Dictionary")
    Set qWh = CreateObject("Scripting.Dictionary")

    last = wsRates.Cells(wsRates.Rows.Count, 3).End(xlUp).Row
    For r = 2 To last
        o = CStr(wsRates.Cells(r, 4).Value & "")
        w = CStr(wsRates.Cells(r, 5).Value & "")
        If Len(o) = 0 Or Len(w) = 0 Then GoTo Nx
        If Not IsNumeric(wsRates.Cells(r, 6).Value) Then GoTo Nx
        If CDbl(wsRates.Cells(r, 6).Value) <= 0 Then GoTo Nx
        If o = "义乌" Then yWh(w) = 1
        If o = "青岛" Then qWh(w) = 1
Nx:
    Next r

    ws.Range("A1").Value = "起运地"
    ws.Range("A2").Value = "义乌"
    ws.Range("A3").Value = "青岛"
    ws.Range("B1").Value = "义乌FBA仓"
    ws.Range("C1").Value = "青岛FBA仓"
    ws.Range("D1").Value = "主表顺序：起运地 → FBA仓 → 运输方式 → 海运渠道"
    i = 2
    For Each k In yWh.Keys: ws.Cells(i, 2).Value = CStr(k): i = i + 1: Next k
    yN = yWh.Count
    i = 2
    For Each k In qWh.Keys: ws.Cells(i, 3).Value = CStr(k): i = i + 1: Next k
    qN = qWh.Count

    On Error Resume Next
    Set wsBuy = ThisWorkbook.Worksheets("采购成本对比")
    If wsBuy Is Nothing Then Exit Sub
    wsBuy.Range("BE4:BH50").Validation.Delete
    On Error GoTo 0

    wsBuy.Range("BE1").Value = "头程关联（顺序：起运地→FBA仓→运输方式→海运渠道；下拉仅有价 / 陆运手填BL）"
    wsBuy.Range("BE2").Value = "起运地"
    wsBuy.Range("BF2").Value = "FBA仓"
    wsBuy.Range("BG2").Value = "运输方式"
    wsBuy.Range("BH2").Value = "海运渠道"

    With wsBuy.Range("BE4:BE50").Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="=海运下拉!$A$2:$A$3"
        .IgnoreBlank = True: .InCellDropdown = True
    End With
    With wsBuy.Range("BF4:BF50").Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, _
            Formula1:="=IF(BE4=""青岛"",海运下拉!$C$2:$C$" & (qN + 1) & ",海运下拉!$B$2:$B$" & (yN + 1) & ")"
        .IgnoreBlank = True: .InCellDropdown = True
    End With
    With wsBuy.Range("BG4:BG50").Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="海运,陆运,海运+陆运"
        .IgnoreBlank = True: .InCellDropdown = True
    End With
    ' 渠道下拉引用行内辅助列 BO:CC（由模板公式 AGGREGATE 生成；若为空请先让表格完成计算）
    With wsBuy.Range("BH4:BH50").Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="=$BO4:$CC4"
        .IgnoreBlank = True: .InCellDropdown = True
    End With
End Sub

Private Function ColLetter(col As Long) As String
    Dim v As Long, s As String
    v = col
    Do While v > 0
        s = Chr(((v - 1) Mod 26) + 65) & s
        v = (v - 1) \ 26
    Loop
    ColLetter = s
End Function
