Attribute VB_Name = "○入力_10_受注先入力"
Option Explicit

Dim sR As Long, mR As Long, C() As Long
Dim ws As Worksheet

Sub 受注先入力()
If UserForm1.処理中.Value = True Then Exit Sub
If ws Is Nothing Then Call 受注先リストの行列番号取得(ws, sR, mR, C)

Dim Check As String, Dflt As String
Dim R As Long

With UserForm1
' Check = .ComboBox2.Value
R = 0
On Error Resume Next
 R = .ComboBox2.Value
On Error GoTo 0
If R = 0 Then Exit Sub

 'If Application.WorksheetFunction.CountIf(ws.Columns(C(1)), Check) > 0 Then
 ' R = ws.Columns(C(1)).Find(Check, lookat:=xlWhole).Row
  .ComboBox2.Value = ws.Cells(R, C(1)).Value
  Dflt = ws.Cells(R, C(3)).Value
  
  .TextBox4.Value = ws.Cells(R, C(2)).Value
  .ComboBox3.Value = Dflt
 'Else
 ' .TextBox4.Value = ""
 'End If
End With

End Sub
