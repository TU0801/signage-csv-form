Attribute VB_Name = "○入力_11_点検期間入力"
Option Explicit

Sub 点検期間入力()
If UserForm1.処理中.Value = True Then Exit Sub

Dim sD As Date, eD As Date, CheckD As Date
Dim stY As String, stM As String, stD As String
Dim edY As String, edM As String, edD As String

With UserForm1
 stY = .TextBox5.Value
 stM = .TextBox6.Value
 stD = .TextBox7.Value
 edY = .TextBox8.Value
 edM = .TextBox9.Value
 edD = .TextBox10.Value
End With

sD = 0: eD = 0: CheckD = 0
If stY Like "????" And stM <> "" And stD <> "" Then sD = DateSerial(stY, stM, stD)
If edY Like "????" And edM <> "" And edD <> "" Then eD = DateSerial(edY, edM, edD)

If sD > 0 Or eD > 0 Then
 If eD > 0 Then
  CheckD = eD
 Else
  CheckD = sD
 End If
 With UserForm1
  .TextBox17.Value = Year(CheckD)
  .TextBox18.Value = Month(CheckD)
  .TextBox19.Value = Day(CheckD)
 End With
End If

Call プレビュー表示(sD, eD)

End Sub

Private Sub プレビュー表示(ByVal sD As Date, ByVal eD As Date)

Const FormStr As String = "m月d日(aaa)"
Dim dStr As String

If sD > 0 And eD > 0 Then
 If sD = eD Then
  dStr = Format(sD, FormStr)
 Else
  dStr = Format(sD, FormStr) & "～" & Format(eD, FormStr)
 End If
 
ElseIf sD > 0 Or eD > 0 Then
 If sD > 0 Then
  dStr = Format(sD, FormStr)
 Else
  dStr = Format(eD, FormStr)
 End If
 
Else
 dStr = ""
End If

UserForm1.Label32.Caption = dStr

End Sub
