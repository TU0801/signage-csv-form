Attribute VB_Name = "☆ユーザーフォーム入力補助"
Option Explicit

Public Sub InputNum(ByVal Ctr As Control, Optional ByVal 桁区切りを使用する As Boolean, Optional ByVal 空白の際に代入 As String, Optional ByVal MaxNum As Long = -1, Optional ByVal MinNum As Long = -1)
If Ctr Is Nothing Then Exit Sub

Dim i As Long, n As Long
Dim Str As String, Txt As String, Check As String
Dim Frm As String

Str = TypeName(Ctr)
If (Str = "TextBox" Or Str = "ComboBox") Then
 Str = Ctr.Value
 Txt = ""
 If Str <> "" Then
  For i = 1 To Len(Str)
   Check = Mid(Str, i, 1)
   If Check Like "[0-9]" Then
    Txt = Txt & Check
   End If
  Next i
 End If
 If Txt = "" Then Txt = 空白の際に代入
 
 If Txt <> "" And IsNumeric(Txt) = True Then
  Frm = String$(Len(Txt), "0")
  n = Txt
  If MaxNum >= 0 And n > MaxNum Then
   n = MaxNum
  ElseIf MinNum >= 0 And n < MinNum Then
   n = MinNum
  End If
  Txt = Format(n, Frm)
 End If
 
 If (Txt <> "" And IsNumeric(Txt) = True And 桁区切りを使用する = True) Then
  Txt = Format(Txt, "#,###")
 End If
 
 Ctr.Value = Txt
End If

End Sub

Public Sub InputABC(ByVal Ctr As Control, Optional ByVal 小文字使用可 As Boolean, Optional ByVal 許可する文字列 As String)
If Ctr Is Nothing Then Exit Sub

Dim n As Long
Dim Str As String, Txt As String, Check As String


Str = Ctr.Value

Txt = ""
If Str <> "" Then
 Str = StrConv(Str, vbNarrow)
 If 小文字使用可 = False Then Str = UCase(Str)
 For n = 1 To Len(Str)
  Check = Mid$(Str, n, 1)
  If (Check Like "[0-9]" Or Check Like "[A-Z]" Or Check Like "[a-z]" Or InStr(許可する文字列, Check) > 0) Then
   Txt = Txt & Check
  End If
 Next n
End If

If Ctr.Value <> Txt Then Ctr.Value = Txt

End Sub

Public Sub InputYen(ByVal Ctr As Control)

Dim 金額 As String
Dim Yen As String, n As Long, Cnt As Long
Dim Str As String, Check As String, Txt As String

金額 = Ctr.Value
If 金額 <> "" Then
 Str = StrConv(Replace(金額, ",", ""), vbNarrow)
 Txt = ""
 Cnt = 0
 For n = 1 To Len(Str)
  Check = Mid(Str, n, 1)
  If IsNumeric(Check) = True Then
   Txt = Txt & Check
  ElseIf Check = "." And Cnt = 0 Then
   Cnt = Cnt + 1
   Txt = Txt & Check
  End If
 Next n
 If IsNumeric(Txt) = True Then
  On Error Resume Next
  Err.Clear
  Yen = Txt
  If Err.Number > 0 Then
   MsgBox "金額を確認してください。" & vbLf & Txt, vbSystemModal
   Yen = Left(Txt, Len(Txt) - 1)
  End If
  On Error GoTo 0
 ElseIf Txt Like "*." Then
  Yen = Txt
 Else
  Yen = 0
 End If
Else
 Yen = 0
End If

If Yen Like "*." Then
 Str = Format(Yen, "#,##0.")
ElseIf Yen Like "*.*" Then
 Str = Format(Yen, "#.0##")
Else
 Str = Format(Yen, "#,##0")
End If

If Ctr.Value <> Str Then Ctr.Value = Str

End Sub

Public Sub InputDate(ByVal Ctr As Control, Optional ByVal Frm As String, Optional ByVal LimDate As String, Optional ByVal 下限日以前の場合は下限日を使用 As Boolean = True)
If Frm = "" Then Frm = "yyyy/mm/dd"

Dim Opt As Boolean
Dim Str As String
Dim n As Long, D As Date, LimD As Date
Dim Txt As String, Check As String

Opt = 下限日以前の場合は下限日を使用
If LimDate = "" Or IsDate(LimDate) = False Then
 LimD = 0
Else
 LimD = DateValue(LimDate)
End If

Str = Ctr.Value
If Str = "0" Then Str = ""
If Str = "" Then
 Txt = ""
Else
 If IsDate(Str) = True Then
  D = Str
 ElseIf (Str Like "????????" And IsNumeric(Str) = True) Then
  D = DateSerial(Left(Str, 4), Mid(Str, 5, 2), Right(Str, 2))
 Else
  D = 0
 End If
 If D = 0 Then
  Txt = ""
 Else
  If D < LimD Then
   If Opt = True Then
    D = LimD
   Else
    D = DateSerial(Year(D) + 1, Month(D), Day(D))
   End If
  End If
  Txt = Format(D, Frm)
 End If
End If

If Ctr.Value <> Txt Then Ctr.Value = Txt

End Sub

Public Sub SlctTxtBox(ByVal TxtBox As Control, ByVal Btn As Long)

If Btn = 1 Then
 With TxtBox
  .SetFocus
  .SelStart = 0
  .SelLength = Len(.Value)
  
 End With
End If

End Sub

Function SpnBtn(ByVal ym As String, Optional ByVal UpDown As String = "UP", Optional ByVal LimMntCnt As Long = -1, Optional ByVal myFormat As String = "yyyymm") As String

Dim D As Date, LimD As Date
Dim Str As String

If ym Like "??????" And IsNumeric(ym) = True Then
 D = DateSerial(Left(ym, 4), Right(ym, 2), 1)
 LimD = Date
 UpDown = StrConv(UCase(UpDown), vbNarrow)
 If UpDown = "UP" Then
  LimD = DateSerial(Year(LimD), Month(LimD) + LimMntCnt, 1)
  If D <> LimD Then
   D = DateSerial(Year(D), Month(D) + 1, 1)
  End If
 Else
  LimD = DateSerial(Year(LimD), Month(LimD) - LimMntCnt, 1)
  If D <> LimD Then
   D = DateSerial(Year(D), Month(D) - 1, 1)
  End If
 End If
 Str = Format(D, myFormat)
End If

SpnBtn = Str

End Function



