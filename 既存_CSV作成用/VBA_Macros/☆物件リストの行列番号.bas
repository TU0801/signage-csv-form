Attribute VB_Name = "☆物件リストの行列番号"
Option Explicit

Sub 物件リストの行列番号取得(ByRef ws As Worksheet, ByRef sR As Long, ByRef mR As Long, ByRef C() As Long)
If ws Is Nothing Then Set ws = ThisWorkbook.Worksheets("物件リスト")

Call フィルターを解除(ws)
ReDim C(1 To 5) As Long
With ws.Range("1:5")
 C(1) = .Find("物件コード", LookIn:=xlFormulas, lookat:=xlWhole).Column
 C(2) = .Find("物件名称").Column
 C(3) = .Find("所在地").Column
 C(4) = .Find("端末ID").Column
 C(5) = .Find("補足").Column
 sR = .Find("物件コード").Row + 1
End With
mR = ws.Cells(ws.Rows.Count, C(1)).End(xlUp).Row

End Sub
