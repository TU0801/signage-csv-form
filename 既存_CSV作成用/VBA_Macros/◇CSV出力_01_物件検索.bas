Attribute VB_Name = "◇CSV出力_01_物件検索"
Option Explicit

Dim sR As Long, mR As Long, C() As Long
Dim ws As Worksheet

Sub CSV出力物件検索()

Dim sRa  As Long, eRa As Long
Dim bNum As String, bName As String

If ws Is Nothing Then
 Call 物件リストの行列番号取得(ws, sR, mR, C)
End If

bNum = UserForm2.TextBox1.Value

If Application.WorksheetFunction.CountIf(ws.Columns(C(1)), bNum) > 0 And bNum <> "" Then
 With ws.Columns(C(1))
  sRa = .Find(bNum, lookat:=xlWhole).Row
  eRa = .Find(bNum, searchdirection:=xlPrevious).Row
 End With
 bName = ws.Cells(sRa, C(2)).Value
 Call 端末コードリスト作成(bNum, sRa, eRa)
Else
 bName = ""
End If

UserForm2.TextBox2.Value = bName


End Sub

Private Sub 端末コードリスト作成(ByVal bNum As String, ByVal sRa As Long, ByVal eRa As Long)

Dim R As Long, i As Long

With UserForm2.ComboBox2
 .Clear
 .AddItem "全端末": i = 0
 For R = sRa To eRa
  If ws.Cells(R, C(1)).Value = bNum Then
   .AddItem: i = i + 1
   .List(i, 0) = ws.Cells(R, C(4)).Value
   .List(i, 1) = ws.Cells(R, C(5)).Value
  End If
 Next R
 .Value = "全端末"
End With

End Sub

