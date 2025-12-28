Attribute VB_Name = "○入力_02_候補リスト更新"
Option Explicit

Dim Mx As Long, Ca() As Long
Dim sR As Long, mR As Long, C() As Long
Dim ws As Worksheet

Sub 入力候補リスト更新()
If UserForm1.処理中.Value = True Then Exit Sub
If ws Is Nothing Then
 Call CSV作成用の行列番号取得(ws, sR, mR, C)
End If
mR = ws.Cells(ws.Rows.Count, C(2)).End(xlUp).Row

Dim LimD As Date, sortC As Long
Dim bNum As String, idStr As String

With UserForm1
 bNum = .TextBox1.Value
 idStr = UCase(.ComboBox5.Value)
 If IsDate(.ComboBox1.Value) = True Then
  LimD = DateValue(.ComboBox1.Value)
 Else
  LimD = 0
End If

 If .OptionButton1.Value = True Then
  sortC = C(25)
 ElseIf .OptionButton2.Value = True Then
  sortC = C(26)
 ElseIf .OptionButton3.Value = True Then
  sortC = C(27)
 Else
  sortC = C(25)
 End If
End With

Call 候補リスト初期化

If bNum <> "" And idStr <> "" Then
 If mR > sR Then
  ws.Rows(sR & ":" & mR).Sort key1:=ws.Cells(sR - 1, sortC), order1:=降順
 End If
 Call リスト更新(bNum, idStr, LimD)
End If


End Sub

Private Sub 候補リスト初期化()

Dim n As Long
Dim cList As String

Mx = Application.WorksheetFunction.Max(ws.Rows(1))
ReDim Ca(1 To Mx) As Long

cList = "0"
With UserForm1.ListBox1
 .Clear
 .ColumnCount = Mx + 1
 .AddItem
 For n = 1 To Mx
  Ca(n) = ws.Rows(1).Find(n, lookat:=xlWhole).Column
  cList = cList & "," & ws.Columns(Ca(n)).ColumnWidth * 6
  .List(0, n) = ws.Cells(sR - 1, Ca(n)).Value
 Next n
 .ColumnWidths = cList
' .AddItem
' .List(1, 0) = 0
' .List(1, 1) = "新規作成"
' .List(1, 2) = "　―"
' .List(1, 3) = "　―"
End With

End Sub

Private Sub リスト更新(ByVal bNum As String, ByVal idStr As String, ByVal LimD As Date)

Dim R As Long
Dim i As Long, n As Long

With UserForm1.ListBox1
 i = .ListCount - 1
 For R = sR To mR
  If ws.Cells(R, C(3)).Value = bNum And UCase(ws.Cells(R, C(2)).Value) = idStr And ws.Cells(R, C(21)).Value >= LimD Then
   .AddItem
   i = i + 1
   .List(i, 0) = R
   For n = 1 To Mx
    .List(i, n) = ws.Cells(R, Ca(n)).Value
   Next n
  End If
 Next R
End With

End Sub
