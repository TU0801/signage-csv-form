Attribute VB_Name = "○入力_12_掲示備考入力"
Option Explicit

Sub 掲示備考入力()
If UserForm1.処理中.Value = True Then
 Exit Sub
Else
 UserForm1.処理中.Value = True
End If

Dim i As Long, lCnt As Long, rCnt As Long
Dim Str As String, Check As String, AnsTxt As String, BfrStr As String, nxtStr As String
Dim mlCnt As Long, mrCnt As Long

With UserForm1
 mlCnt = .Label51.Caption * 2
 mrCnt = .Label52.Caption
 Str = .TextBox11.Value
End With
BfrStr = Str


AnsTxt = ""
lCnt = 0
For i = 1 To Len(Str)
 Check = Mid$(Str, i, 1)
 If i < Len(Str) Then
  nxtStr = Mid$(Str, i + 1, 1)
 Else
  nxtStr = ""
 End If
 If 改行コード判定(Check) = True Then
  lCnt = 0
 Else
  lCnt = lCnt + LenB(StrConv(Check, vbFromUnicode))
 End If
 
 AnsTxt = AnsTxt & Check
 If lCnt >= mlCnt And 改行コード判定(nxtStr) = False Then
  AnsTxt = AnsTxt & vbCrLf
  lCnt = 0
 End If
Next i
AnsTxt = AnsTxt & nxtStr

rCnt = 0
i = InStr(AnsTxt, vbCrLf)
Do While i > 0
 rCnt = rCnt + 1
 If rCnt > mrCnt Then
  AnsTxt = Left$(AnsTxt, i - 1)
  Exit Do
 End If
 i = InStr(i + 1, AnsTxt, vbCrLf)
Loop

If BfrStr <> AnsTxt Then
 UserForm1.TextBox11.Value = AnsTxt
End If

UserForm1.処理中.Value = False

End Sub

Private Function 改行コード判定(ByVal Str As String) As Boolean

Dim Opt As Boolean

If InStr(Str, vbCr) > 0 Or InStr(Str, vbLf) > 0 Then
 Opt = True
Else
 Opt = False
End If

改行コード判定 = Opt


End Function
