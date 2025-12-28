Attribute VB_Name = "○入力_00_フォームを表示"
Option Explicit

Sub 入力フォームを表示()

Dim Opt As Boolean

Call 入力フォームを初期化
Unload UserForm2

Opt = GetOPT


With UserForm1
 .CommandButton7.Visible = Opt
 .Label36.Caption = .Width
 .Label37.Caption = .Height
 .Label38.Caption = .Frame5.Left
 .MultiPage1.Value = 0
 .MultiPage2.Value = 0
 Call 設定を読み込み
 Call 履歴を読み込み
 .Show
End With

End Sub

Private Sub 履歴を読み込み()

Dim Cod As String
Dim ws As Worksheet

Set ws = ThisWorkbook.Worksheets("情報")
With ws.UsedRange
 Cod = .Find("物件コード").Offset(0, 1).Value


End With

With UserForm1
 .TextBox1.Value = Cod


End With

End Sub

Private Sub 設定を読み込み()

Dim Rng As Range
Dim mlCnt  As Long, mrCnt As Long

Set Rng = ThisWorkbook.Worksheets("設定").UsedRange
mlCnt = Rng.Find("掲示備考の文字数制限-行", LookIn:=xlFormulas, lookat:=xlWhole).Offset(0, 1).Value
mrCnt = Rng.Find("掲示備考の行数制限").Offset(0, 1).Value
With UserForm1
 .Label50.Caption = Rng.Find("表示時間の上限", LookIn:=xlFormulas, lookat:=xlWhole).Offset(0, 1).Value
 .Label51.Caption = mlCnt
 .Label52.Caption = mrCnt



End With


End Sub
