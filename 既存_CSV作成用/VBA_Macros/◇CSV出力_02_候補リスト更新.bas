Attribute VB_Name = "◇CSV出力_02_候補リスト更新"
Option Explicit

Dim Mx As Long, Ca() As Long
Dim sR As Long, mR As Long, C() As Long
Dim aws As Worksheet

Sub CSV出力の候補リスト更新()

Dim bNum As String, Cod As String, LimD As Date
Dim Check As String, dStr As String
Dim R As Long, i As Long, n As Long

lp:
With UserForm2
 bNum = .TextBox1.Value
 Cod = UCase(.ComboBox2.Value)
 dStr = .ComboBox1.Value
 If dStr <> "" And IsDate(dStr) = True Then
  LimD = DateValue(.ComboBox1.Value)
 Else
  LimD = 0
 End If
 Check = "*" & .TextBox4.Value & "*"
End With

If bNum = "" Or Cod = "" Then Exit Sub

If aws Is Nothing Then
 Call CSV作成用の行列番号取得(aws, sR, mR, C)
End If
mR = aws.Cells(aws.Rows.Count, C(2)).End(xlUp).Row
Call 準備

UserForm2.CheckBox1.Value = False

With UserForm2.ListBox1
 i = 0
 For R = sR To mR
  If aws.Cells(R, C(3)).Value = bNum And (UCase(aws.Cells(R, C(2)).Value) = Cod Or Cod = "全端末") Then
   If DateValue(aws.Cells(R, C(25)).Value) > LimD Then
    If aws.Cells(R, C(6)).Value Like Check Then
     .AddItem
     i = i + 1
     .List(i, 0) = R
     For n = 1 To Mx
      .List(i, n) = aws.Cells(R, Ca(n)).Value
     Next n
    End If
   End If
  End If
 Next R
End With

UserForm2.CheckBox1.Value = True

   
   



End Sub

Private Sub 準備()

Dim n As Long
Dim cList As String

Mx = Application.WorksheetFunction.Max(aws.Rows(1))
cList = "0"

ReDim Ca(1 To Mx) As Long

cList = "0"
With UserForm2.ListBox1
 .Clear
 .ColumnCount = Mx + 1
 .AddItem
 For n = 1 To Mx
  Ca(n) = aws.Rows(1).Find(n, lookat:=xlWhole).Column
  cList = cList & "," & aws.Columns(Ca(n)).ColumnWidth * 6
  .List(0, n) = aws.Cells(sR - 1, Ca(n)).Value
 Next n
 .ColumnWidths = cList
End With


End Sub
