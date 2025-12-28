Attribute VB_Name = "◇CSV出力_00_フォームを表示"
Option Explicit

Sub CSV出力フォームを表示()

Dim Opt As Boolean
Dim bNum As String
Dim ws As Worksheet

Set ws = ThisWorkbook.Worksheets("情報")
bNum = ws.UsedRange.Find("物件コード").Offset(0, 1).Value

Unload UserForm1

Opt = GetOPT
Call 検索範囲ボックス設定

With UserForm2
 .TextBox1.Value = bNum
 .CheckBox2.Visible = Opt
 .Show
End With

End Sub

Private Sub 検索範囲ボックス設定()

Dim D As Date, i As Long

With UserForm2.ComboBox1
 .Clear
 .AddItem "指定なし"
 D = DateSerial(Year(Date), Month(Date), 1)
 For i = 1 To 3
  .AddItem D
  D = DateSerial(Year(D), Month(D) - 1, 1)
 Next i
 
 .Value = .List(0)
End With


End Sub
