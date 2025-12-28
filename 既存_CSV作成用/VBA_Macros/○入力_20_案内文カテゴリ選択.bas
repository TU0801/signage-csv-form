Attribute VB_Name = "○入力_20_案内文カテゴリ選択"
Option Explicit

Dim sR As Long, mR As Long, C() As Long
Dim ws As Worksheet

Sub 案内文カテゴリ選択()
If UserForm1.処理中.Value = True Then Exit Sub
UserForm1.処理中.Value = True

If ws Is Nothing Then Call 案内文候補の行列番号取得(ws, sR, mR, C)

Dim Check As String
Dim R As Long

Check = "*" & UserForm1.ComboBox3.Value & "*"
With UserForm1.ComboBox4
 .Clear
 For R = sR To mR
  If ws.Cells(R, C(2)).Value Like Check Then
   .AddItem ws.Cells(R, C(2)).Value
  End If
 Next R
 
 UserForm1.処理中.Value = False
 
 If .ListCount > 0 Then
  .Value = .List(0)
 End If
End With

End Sub
