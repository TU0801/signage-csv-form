Attribute VB_Name = "☆CSV作成用の行列番号"
Option Explicit

Sub CSV作成用の行列番号取得(ByRef ws As Worksheet, ByRef sR As Long, ByRef mR As Long, ByRef C() As Long)

If ws Is Nothing Then Set ws = ThisWorkbook.Worksheets("CSV作成用")
Call フィルターを解除(ws)

ReDim C(1 To 28) As Long
With ws.Range("1:5")
 C(1) = .Find("点検CO", LookIn:=xlFormulas, lookat:=xlWhole).Column
 C(2) = .Find("端末ID").Column
 C(3) = .Find("物件コード").Column
 C(4) = .Find("受注先名").Column
 C(5) = .Find("緊急連絡先番号").Column
 C(6) = .Find("点検工事案内").Column
 C(7) = .Find("掲示板に表示する").Column
 C(8) = .Find("点検案内TPLNo").Column
 C(9) = .Find("点検開始日").Column
 C(10) = .Find("点検完了日").Column
 C(11) = .Find("掲示備考").Column
 C(12) = .Find("掲示板用案内文").Column
 C(13) = .Find("frame_No").Column
 C(14) = .Find("表示開始日").Column
 C(15) = .Find("表示終了日").Column
 C(16) = .Find("表示開始時刻").Column
 C(17) = .Find("表示終了時刻").Column
 C(18) = .Find("表示時間").Column
 C(19) = .Find("統合ポリシー").Column
 C(20) = .Find("制御").Column
 C(21) = .Find("変更日").Column
 C(22) = .Find("変更時刻").Column
 C(23) = .Find("最終エクスポート日時").Column
 C(24) = .Find("ID").Column
 C(25) = .Find("変更日時").Column
 C(26) = .Find("点検日時").Column
 C(27) = .Find("表示日時").Column
 C(28) = .Find("貼紙区分").Column
 sR = .Find("物件コード").Row + 1
End With
mR = ws.Cells(ws.Rows.Count, C(3)).End(xlUp).Row

End Sub
