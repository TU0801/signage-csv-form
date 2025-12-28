Attribute VB_Name = "☆受注先リストの行列番号"
Option Explicit

Sub 受注先リストの行列番号取得(ByRef ws As Worksheet, ByRef sR As Long, ByRef mR As Long, ByRef C() As Long)

If ws Is Nothing Then Set ws = ThisWorkbook.Worksheets("受注先リスト")

Call フィルターを解除(ws)

ReDim C(1 To 3) As Long
With ws.Range("1:5")
 C(1) = .Find("受注先", LookIn:=xlFormulas, lookat:=xlWhole).Column
 C(2) = .Find("緊急連絡先").Column
 C(3) = .Find("カテゴリ").Column
 
 sR = .Find("受注先").Row + 1
End With
mR = ws.Cells(ws.Rows.Count, C(1)).End(xlUp).Row

End Sub
