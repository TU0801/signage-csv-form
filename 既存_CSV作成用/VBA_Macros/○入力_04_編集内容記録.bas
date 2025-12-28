Attribute VB_Name = "○入力_04_編集内容記録"
Option Explicit

Dim sR As Long, mR As Long, C() As Long
Dim aws As Worksheet

Sub 入力の編集内容記録(Optional ByVal 新規登録 As Boolean = False)

With Application
 .ScreenUpdating = False
 .EnableEvents = False
 .DisplayAlerts = False
 .Calculation = xlCalculationManual
End With

Dim mStr As String

If MsgBox("この内容で記録しますか？", vbYesNo Or vbQuestion Or vbSystemModal) = vbYes Then
 If aws Is Nothing Then
  Call CSV作成用の行列番号取得(aws, sR, mR, C)
 End If
 Call 記録処理(新規登録)
 Call 履歴を記録
 ThisWorkbook.Save
 mStr = "記録しました。"
Else
 mStr = "処理を中止しました。"
End If

With Application
 .Calculation = xlCalculationAutomatic
 .DisplayAlerts = True
 .EnableEvents = True
 .ScreenUpdating = True
End With

MsgBox mStr, vbInformation Or vbSystemModal

End Sub

Private Sub 記録処理(ByVal 新規登録 As Boolean)

Dim i As Long
Dim R As Long

R = 0
If 新規登録 = False Then
 With UserForm1.ListBox1
  i = .ListIndex
  If i <= 0 Then
   '編集を記録かつ既存リストが選択されていない
  
  Else
   R = .List(i, 0)
  End If
 End With
End If


If R = 0 Then
 mR = mR + 1
 R = mR
End If


With UserForm1
 aws.Cells(R, C(2)).Value = .ComboBox5.Value
 aws.Cells(R, C(3)).Value = .TextBox1.Value
 aws.Cells(R, C(4)).Value = .ComboBox2.Value
 aws.Cells(R, C(5)).Value = .TextBox4.Value
 
 Call 点検業者記録(.ComboBox2.Value, .TextBox4.Value)
 
 aws.Cells(R, C(6)).Value = .ComboBox4.Value
 aws.Cells(R, C(7)).Value = BooleToStr(.CheckBox1.Value)

 
 aws.Cells(R, C(8)).Value = GetFileName(.Label30.Caption)
 aws.Cells(R, C(9)).Value = SetDate(.TextBox5.Value, .TextBox6.Value, .TextBox7.Value)
 
 aws.Cells(R, C(10)).Value = SetDate(.TextBox8.Value, .TextBox9.Value, .TextBox10.Value)
 aws.Cells(R, C(11)).Value = .TextBox11.Value
 aws.Cells(R, C(12)).Value = .TextBox22.Value
 aws.Cells(R, C(13)).Value = SetFrameNO
 aws.Cells(R, C(14)).Value = SetDate(.TextBox12.Value, .TextBox13.Value, .TextBox14.Value)
 aws.Cells(R, C(15)).Value = SetDate(.TextBox17.Value, .TextBox18.Value, .TextBox19.Value)
 aws.Cells(R, C(16)).Value = SetTime(.TextBox15.Value, .TextBox16.Value)
 aws.Cells(R, C(17)).Value = SetTime(.TextBox20.Value, .TextBox21.Value)

 aws.Cells(R, C(18)).Value = SetTime(0, 0, .TextBox25.Value)
 aws.Cells(R, C(19)).Value = ""
 aws.Cells(R, C(20)).Value = ""
 aws.Cells(R, C(21)).Value = Date
 aws.Cells(R, C(22)).Value = ""
 aws.Cells(R, C(23)).Value = ""
 aws.Cells(R, C(24)).Value = ""
 aws.Cells(R, C(25)).Value = Now
 aws.Cells(R, C(26)).Value = aws.Cells(R, C(9)).Value
 aws.Cells(R, C(27)).Value = SetDateTime(aws.Cells(R, C(14)).Value, aws.Cells(R, C(16)).Value)
 aws.Cells(R, C(28)).Value = SetKubun
End With


End Sub

Private Function SetDateTime(ByVal dStr As String, ByVal tStr As String) As String

Dim D As Date
Dim Str As String

If dStr <> "" Then
 D = DateValue(dStr)
 If tStr <> "" Then
  D = D + TimeValue(tStr)
 End If
 Str = D
Else
 Str = ""
End If

SetDateTime = Str

End Function

Private Function BooleToStr(ByVal Val As Boolean) As String

Dim Str As String

If Val = True Then
 Str = "TRUE"
Else
 Str = "FALSE"
End If

BooleToStr = Str

End Function

Private Function GetFileName(ByVal fStr As String) As String

Dim i As Long

i = InStrRev(fStr, "\")
If i > 0 Then
 fStr = Right$(fStr, Len(fStr) - i)
End If

i = InStrRev(fStr, ".")
If i > 0 Then
 fStr = Left$(fStr, i - 1)
End If

GetFileName = fStr

End Function

Private Function SetDate(ByVal yStr As String, ByVal mStr As String, ByVal dStr As String) As String

Dim D As Date
Dim Str As String

If yStr <> "" And mStr <> "" And dStr <> "" Then
 D = DateSerial(yStr, mStr, dStr)
 Str = D
Else
 Str = ""
End If

SetDate = Str

End Function

Private Function SetTime(ByVal hStr As String, ByVal mStr As String, Optional ByVal sStr As String = "0") As String

Dim Str As String
If hStr <> "" And mStr <> "" Then
 Str = hStr & ":" & mStr & ":" & sStr
Else
 Str = ""
End If

SetTime = Str

End Function

Private Function SetFrameNO() As String

Dim nStr As String

With UserForm1
 If .OptionButton4.Value = True Then
  nStr = "1"
 ElseIf .OptionButton5.Value = True Then
  nStr = "2"
 ElseIf .OptionButton6.Value = True Then
  nStr = "3"
 ElseIf .OptionButton7.Value = True Then
  nStr = "4"
 ElseIf .OptionButton8.Value = True Then
  nStr = "0"
 Else
  nStr = ""
 End If
End With

SetFrameNO = nStr

End Function

Private Function SetKubun() As String

Dim Str As String

With UserForm1
 If .OptionButton9.Value = True Then
  Str = "テンプレート"
 ElseIf .OptionButton10.Value = True Then
  Str = "追加"
 Else
  Str = ""
 End If
End With

SetKubun = Str

End Function

Private Sub 点検業者記録(ByVal 業者名 As String, ByVal 連絡先 As String)

Dim R As Long, Ra As Long
Dim sR As Long, mR As Long, C() As Long
Dim CheckA As String, CheckB As String
Dim TelA As String, TelB As String
Dim ws As Worksheet

Call 受注先リストの行列番号取得(ws, sR, mR, C)

CheckA = 会社名調整(業者名)
TelA = 連絡先調整(連絡先)

Ra = mR + 1
For R = sR To mR
 CheckB = 会社名調整(ws.Cells(R, C(1)).Value)
 TelB = 連絡先調整(ws.Cells(R, C(2)).Value)
 If CheckA = CheckB And TelA = TelB Then
  Ra = 0
  Exit For
 End If
Next R

If Ra > 0 Then
 ws.Cells(Ra, C(1)).Value = 業者名
 ws.Cells(Ra, C(2)).Value = 連絡先
End If

End Sub

Private Function 会社名調整(ByVal Str As String) As String

Str = StrConv(Str, vbWide)
Str = Replace(Replace(Str, "株式会社", ""), "有限会社", "")
Str = Replace(Replace(Str, "（株）", ""), "（有）", "")
Str = Replace(Str, "　", "")

会社名調整 = Str

End Function

Private Function 連絡先調整(ByVal Str As String) As String

Str = StrConv(Str, vbNarrow)
Str = Replace(Replace(Str, "-", ""), " ", "")

連絡先調整 = Str

End Function
