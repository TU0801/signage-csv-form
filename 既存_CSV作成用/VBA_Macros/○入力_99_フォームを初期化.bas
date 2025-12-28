Attribute VB_Name = "○入力_99_フォームを初期化"
Option Explicit

Sub 入力フォームを初期化()

UserForm1.処理中.Value = True

Call 掲示内容初期化
Call 登録状況初期化
Call プレビュー関係初期化

UserForm1.処理中.Value = False

End Sub

Private Sub 掲示内容初期化()

Dim D As Date, nxtD As Date
Dim Ctr As Control
Dim TypStr As String

For Each Ctr In UserForm1.MultiPage1.Pages(0).Controls
 TypStr = TypeName(Ctr)
 If TypStr = "ComboBox" Or TypStr = "TextBox" Then
  Ctr.Value = ""
 ElseIf TypStr = "CheckBox" Or TypStr = "OptionButton" Then
  Ctr.Value = False
 ElseIf TypStr = "ListBox" Then
  Ctr.Clear
 End If
Next Ctr

D = Date
nxtD = DateSerial(Year(D), Month(D) + 1, 1)
With UserForm1
 .TextBox5.Value = Year(nxtD)
 .TextBox6.Value = Month(nxtD)
 .TextBox8.Value = Year(nxtD)
 .TextBox9.Value = Month(nxtD)
 
 .TextBox12.Value = Year(D)
 .TextBox13.Value = Month(D)
 .TextBox14.Value = Day(D)
 
 .TextBox25.Value = "6"
 
 .CheckBox1.Value = True
 .OptionButton9.Value = True
 .Label29.Caption = "-"
 
End With

Call 受注先リスト
Call 案内内容ボックス
Call 掲示備考サンプル表示

End Sub

Private Sub 登録状況初期化()

Dim D As Date
Dim Ctr As Control
Dim TypStr As String

For Each Ctr In UserForm1.MultiPage1.Pages(1).Controls
 TypStr = TypeName(Ctr)
 If TypStr = "TextBox" Or TypStr = "ComboBox" Then
  Ctr.Value = ""
 ElseIf TypStr = "CheckBox" Or TypStr = "OptionButton" Then
  Ctr.Value = False
 ElseIf TypStr = "LisBox" Then
  Ctr.Clear
 End If
Next Ctr

D = DateSerial(Year(Date), Month(Date), 1)
With UserForm1
 With .ComboBox1
  .Clear
  .AddItem D
  .AddItem DateSerial(Year(D), Month(D) - 1, 1)
  .AddItem DateSerial(Year(D), Month(D) - 2, 1)
  .AddItem "指定なし"
  .Value = D
 End With
 .OptionButton1.Value = True
End With

End Sub

Private Sub 受注先リスト()

Dim R As Long, i As Long
Dim sR As Long, mR As Long, C() As Long
Dim ws As Worksheet

Call 受注先リストの行列番号取得(ws, sR, mR, C)

With UserForm1.ComboBox2
 .Clear: i = -1
 For R = sR To mR
  .AddItem: i = i + 1
  .List(i, 0) = R
  .List(i, 1) = ws.Cells(R, C(3)).Value & ","
  
  .List(i, 2) = ws.Cells(R, C(1)).Value
 Next R
End With

End Sub

Private Sub 掲載内容初期化()

Dim Ctr As Control
Dim TypStr As String

For Each Ctr In UserForm1.MultiPage1.Pages(0).Controls
 TypStr = TypeName(Ctr)
 If TypStr = "TextBox" Then
  Ctr.Value = ""
 ElseIf TypStr = "OptionButton" Then
  Ctr.Value = False
 End If
Next Ctr
Call 案内内容ボックス
Call 掲示備考サンプル表示

End Sub

Private Sub 案内内容ボックス()

Dim R As Long, sR As Long, mR As Long, C As Long
Dim ws As Worksheet

Set ws = ThisWorkbook.Worksheets("案内文カテゴリ設定")
With ws.Range("1:5")
 sR = .Find("カテゴリ名", lookat:=xlWhole, searchdirection:=xlPrevious).Row + 1
 C = .Find("カテゴリ名").Column
End With
mR = ws.Cells(ws.Rows.Count, C).End(xlUp).Row

With UserForm1.ComboBox3
 .Clear
 For R = sR To mR
  .AddItem ws.Cells(R, C).Value
 Next R
End With
UserForm1.ComboBox4.Clear

End Sub

Private Sub プレビュー関係初期化()

Dim Ctr As Control

UserForm1.Label30.Caption = ""
With UserForm1
 With .Frame3
  .Picture = LoadPicture("")
  For Each Ctr In .Controls
   If TypeName(Ctr) = "Label" Then
    Ctr.Caption = ""
   End If
  Next Ctr
 End With
 .OptionButton4.Value = True
 
End With

Call サンプルイメージ削除

End Sub

Sub サンプルイメージ削除()

With UserForm1
 .Label31.Caption = ""
 .Label32.Caption = ""
 .Label33.Caption = ""
 .Label34.Caption = ""
 .Label35.Caption = ""
 
 .Label43.Visible = False
 .Label44.Visible = False
 .Label45.Visible = False
 .Label46.Visible = False
 .Label43.Picture = LoadPicture("")
 .Label44.Picture = LoadPicture("")
 .Label45.Picture = LoadPicture("")
 .Label46.Picture = LoadPicture("")
 .Frame3.Picture = LoadPicture("")
 
End With


End Sub
