Attribute VB_Name = "○入力_21_案内文選択"
Option Explicit

Dim sR As Long, mR As Long, C() As Long
Dim ws As Worksheet

Sub 案内文選択()
If UserForm1.処理中.Value = True Then Exit Sub
UserForm1.処理中.Value = True
If ws Is Nothing Then Call 案内文候補の行列番号取得(ws, sR, mR, C)

Dim R As Long
Dim Str As String

Str = UserForm1.ComboBox4.Value
With UserForm1
 Str = .ComboBox4.Value
 .Label29.Caption = "-"
 .TextBox22.Value = ""
 .TextBox24.Value = ""
End With

If Application.WorksheetFunction.CountIf(ws.Columns(C(2)), Str) > 0 Then
 R = ws.Columns(C(2)).Find(Str, lookat:=xlWhole).Row
 With UserForm1
  .TextBox22.Value = ws.Cells(R, C(6)).Value '案内文
  .Label29.Caption = ws.Cells(R, C(5)).Value
  .TextBox24.Value = ws.Cells(R, C(5)).Value
 End With
 
End If

Call 貼紙サンプル表示

UserForm1.処理中.Value = False
UserForm1.OptionButton9.Value = True

End Sub
