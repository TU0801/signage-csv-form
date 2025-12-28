Attribute VB_Name = "○入力_03_候補リスト選択"
Option Explicit

Dim sR As Long, mR As Long, C() As Long
Dim ws As Worksheet

Sub 候補リスト選択()

Dim i As Long, R As Long

With UserForm1.ListBox1
 i = .ListIndex
 If i > 0 Then
  R = .List(i, 0)
  Call 入力フォームを初期化
  If R > 0 Then
   Call 作成済を取得(R)
  End If
 End If
End With

End Sub

Private Sub 作成済を取得(ByVal R As Long)

Call CSV作成用の行列番号取得(ws, sR, mR, C)

UserForm1.処理中.Value = True

Call 掲載条件取得(R)
Call 掲示内容取得(R)

UserForm1.処理中.Value = False

Call 点検期間入力

End Sub

Private Sub 掲載条件取得(ByVal R As Long)

Dim 点検開始 As Date, 点検終了 As Date

点検開始 = 0: 点検終了 = 0
On Error Resume Next
点検開始 = ws.Cells(R, C(9)).Value
点検終了 = ws.Cells(R, C(10)).Value
On Error GoTo 0

With UserForm1
 .ComboBox2.Value = ws.Cells(R, C(4)).Value
 .TextBox4.Value = ws.Cells(R, C(5)).Value
 If 点検開始 > 0 Then
  .TextBox5.Value = Year(点検開始)
  .TextBox6.Value = Month(点検開始)
  .TextBox7.Value = Day(点検開始)
 End If
 If 点検終了 > 0 Then
  .TextBox8.Value = Year(点検終了)
  .TextBox9.Value = Month(点検終了)
  .TextBox10.Value = Day(点検終了)
 End If
 .TextBox11.Value = ws.Cells(R, C(11)).Value
 Call 表示開始日時(R)
 Call 表示終了日時(R)
 .TextBox25.Value = Second(ws.Cells(R, C(18)).Value)
 Call 表示位置取得(R)
End With

End Sub

Private Sub 表示開始日時(ByVal R As Long)

Dim 開始日 As Date, 開始時間 As Date

開始日 = 0: 開始時間 = 0
On Error Resume Next
If ws.Cells(R, C(14)).Value <> "" Then 開始日 = ws.Cells(R, C(14)).Value
If ws.Cells(R, C(16)).Value <> "" Then 開始時間 = ws.Cells(R, C(16)).Value
On Error GoTo 0

With UserForm1
 If 開始日 > 0 Then
  .TextBox12.Value = Year(開始日)
  .TextBox13.Value = Month(開始日)
  .TextBox14.Value = Day(開始日)
 End If
 If 開始時間 > 0 Then
  .TextBox15.Value = Hour(開始時間)
  .TextBox16.Value = Minute(開始時間)
 End If
End With

End Sub

Private Sub 表示終了日時(ByVal R As Long)

Dim 終了日 As Date, 終了時間 As Date

終了日 = 0: 終了時間 = 0
On Error Resume Next
If ws.Cells(R, C(15)).Value <> "" Then 終了日 = ws.Cells(R, C(15)).Value
If ws.Cells(R, C(17)).Value <> "" Then 終了時間 = ws.Cells(R, C(17)).Value
On Error GoTo 0

With UserForm1
 If 終了日 > 0 Then
  .TextBox17.Value = Year(終了日)
  .TextBox18.Value = Month(終了日)
  .TextBox19.Value = Day(終了日)
 End If
 If 終了時間 > 0 Then
  .TextBox20.Value = Hour(終了時間)
  .TextBox21.Value = Minute(終了時間)
 End If
End With

End Sub

Private Sub 表示位置取得(ByVal R As Long)

Dim n As Long

If ws.Cells(R, C(13)).Value <> "" Then
 n = ws.Cells(R, C(13)).Value
 With UserForm1
  If n = 1 Then
   .OptionButton4.Value = True
  ElseIf n = 2 Then
   .OptionButton5.Value = True
  ElseIf n = 3 Then
   .OptionButton6.Value = True
  ElseIf n = 4 Then
   .OptionButton7.Value = True
  ElseIf n = 0 Then
   .OptionButton8.Value = True
  End If
 End With
End If

End Sub

Private Sub 掲示内容取得(ByVal R As Long)

Dim Str As String
Dim fol As String, sFol As String
Dim fName As String, Check As String

Str = ws.Cells(R, C(28)).Value
fol = GetMyPath
fName = ""
With UserForm1
 .TextBox22.Value = ws.Cells(R, C(12)).Value
 .ComboBox4.Value = ws.Cells(R, C(6)).Value
 Check = ws.Cells(R, C(8)).Value
 If Str = "テンプレート" Then
  .OptionButton9.Value = True
  .Label29.Caption = Check
  sFol = "*貼紙テンプレート*"
 ElseIf Str = "追加" Then
  .OptionButton10.Value = True
  .TextBox24.Value = Check
  sFol = "*貼紙*追加*"
 End If
 sFol = Dir(fol & sFol, vbDirectory)
 If sFol <> "" Then
  fol = fol & sFol & "\"
  fName = Dir(fol & Check & ".jp*g")
  If fName <> "" Then
   fName = fol & fName
   .Label30.Caption = fol & fName
  End If
 End If
 .Frame3.Picture = LoadPicture(fName)
End With

End Sub

