Attribute VB_Name = "☆レポートの行列番号取得"
Option Explicit

Sub レポートの行列番号取得(ByVal ws As Worksheet, ByRef sR As Long, ByRef mR As Long, ByRef C() As Long)

Call フィルターを解除(ws)

ReDim C(1 To 6) As Long
With ws.Range("1:5")
 C(1) = .Find("端末ID", LookIn:=xlFormulas, lookat:=xlWhole).Column
 C(2) = .Find("物件コード").Column
 C(3) = .Find("点検工事案内").Column
 C(4) = .Find("点検開始日").Column
 C(5) = .Find("点検完了日").Column
 C(6) = .Find("掲示備考").Column
 sR = .Find("物件コード").Row + 1
End With
mR = ws.Cells(ws.Rows.Count, C(1)).End(xlUp).Row

End Sub
