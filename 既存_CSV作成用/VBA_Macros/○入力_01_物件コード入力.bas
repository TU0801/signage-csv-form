Attribute VB_Name = "○入力_01_物件コード入力"
Option Explicit

Dim sR As Long, mR As Long, C() As Long
Dim ws As Worksheet, fCol As Range

Sub 物件コード入力()
If UserForm1.処理中.Value = True Then Exit Sub
If ws Is Nothing Then
 Call 物件リストの行列番号取得(ws, sR, mR, C)
 Set fCol = ws.Columns(C(1))
End If

Dim sRa As Long, eRa As Long
Dim bNum As String
Dim bName As String

bNum = UserForm1.TextBox1.Value

If Application.WorksheetFunction.CountIf(ws.Columns(C(1)), bNum) > 0 Then
 With fCol
  sRa = .Find(bNum, lookat:=xlWhole).Row
  eRa = .Find(bNum, searchdirection:=xlPrevious).Row
 End With
 bName = ws.Cells(sRa, C(2)).Value
Else
 bName = ""
 sRa = 1
 eRa = 0
End If
Call 端末コードリスト作成(bNum, sRa, eRa)

UserForm1.TextBox2.Value = bName

End Sub

Private Sub 端末コードリスト作成(ByVal bNum As String, ByVal sRa As Long, ByVal eRa As Long)

Dim R As Long, i As Long

With UserForm1.ComboBox5
 .Clear: i = -1
 For R = sRa To eRa
  If ws.Cells(R, C(1)).Value = bNum Then
   .AddItem: i = i + 1
   .List(i, 0) = ws.Cells(R, C(4)).Value
   .List(i, 1) = ws.Cells(R, C(5)).Value
  End If
 Next R
End With

End Sub
