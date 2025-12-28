Attribute VB_Name = "□テキストボックスサンプル"
Option Explicit

Sub 掲示備考サンプル表示()

Dim mlCnt As String, mrCnt As String

With UserForm1
 .掲示備考サンプル.Value = True
 mlCnt = StrConv(.Label51.Caption, vbWide)
 mrCnt = StrConv(.Label52.Caption, vbWide)
 With .TextBox11
  .ForeColor = RGB(155, 155, 155)
  .Value = "＜入力例＞" & vbLf & _
           "００１号機：９時３０分～１１時００分" & vbLf & _
           "１行につき" & mlCnt & "文字程度、" & mrCnt & "行以内で入力してください。"
 End With
End With

End Sub

Sub 掲示備考入力待機()


With UserForm1.TextBox11
 .ForeColor = RGB(0, 0, 0)
 .Value = ""
End With
UserForm1.掲示備考サンプル.Value = False

End Sub
