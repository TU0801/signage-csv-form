Attribute VB_Name = "☆案内文候補の行列番号取得"
Option Explicit

Sub 案内文候補の行列番号取得(ByRef ws As Worksheet, ByRef sR As Long, ByRef mR As Long, ByRef C() As Long)
If ws Is Nothing Then Set ws = ThisWorkbook.Worksheets("掲示板案内文")

Call フィルターを解除(ws)

ReDim C(1 To 17) As Long
With ws.Range("1:5")
 C(1) = .Find("点検掲示種類ID", LookIn:=xlFormulas, lookat:=xlWhole).Column
 C(2) = .Find("点検工事案内").Column
 C(3) = .Find("受注カテゴリーID").Column
 C(4) = .Find("掲示板に表示する").Column
 C(5) = .Find("案内TPLNo").Column
 C(6) = .Find("掲示板用案内文").Column
 C(7) = .Find("frame_No").Column
 On Error Resume Next
 C(8) = .Find("案内画像").Column
 C(9) = .Find("概要").Column
 C(10) = .Find("表示開始日前日数").Column
 C(11) = .Find("表示終了日後日数").Column
 C(12) = .Find("表示開始時刻").Column
 C(13) = .Find("表示終了時刻").Column
 C(14) = .Find("表示時間").Column
 C(15) = .Find("統合ポリシー").Column
 C(16) = .Find("変更日").Column
 C(17) = .Find("変更時刻").Column
 On Error GoTo 0
 sR = .Find("点検工事案内").Row + 1
End With
mR = ws.Cells(ws.Rows.Count, C(2)).End(xlUp).Row

End Sub
